/**
 * Integration tests for `POST /api/appointments` (public booking).
 *
 * Mocks the prisma client + side-effecting integrations (notifications)
 * so we can exercise validation, rate-limiting, conflict detection, and
 * the success envelope without touching Postgres / Resend / Twilio.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const SALON_ID = "salon_1";
const SALON_SLUG = "test-salon";

const prismaMock = vi.hoisted(() => ({
  salon: { findUnique: vi.fn() },
  service: { findUnique: vi.fn(), findMany: vi.fn() },
  appointment: { findFirst: vi.fn(), create: vi.fn() },
  appointmentAddOn: { createMany: vi.fn() },
  clientPackage: {
    findMany: vi.fn(
      async (): Promise<{ id: string; sessionsUsed: number; sessionsTotal: number }[]> => []
    ),
    update: vi.fn(),
  },
  client: { upsert: vi.fn() },
  setting: { upsert: vi.fn() },
  $transaction: vi.fn(),
}));
// Interactive transactions in the routes under test just run the callback
// against this same mock client — good enough since none of these tests
// exercise multi-service add-ons (empty addOns skips appointmentAddOn entirely).
prismaMock.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(prismaMock));

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/domain/clients", () => ({
  findClientIdByEmail: vi.fn(async () => null),
}));
vi.mock("@/lib/integrations/notifications", () => ({
  sendNotifications: vi.fn(async () => undefined),
}));
vi.mock("@/lib/integrations/adminSms", () => ({
  notifyAdminsOfBooking: vi.fn(),
}));
// The Stripe payment branch is covered separately in
// appointmentsPayment.test.ts — default the platform flag off here so these
// pre-existing tests exercise the unpaid path without touching real env vars.
const isStripePaymentsEnabledMock = vi.hoisted(() => vi.fn(() => false));
vi.mock("@/lib/flags", () => ({
  isStripePaymentsEnabled: isStripePaymentsEnabledMock,
}));

import { POST } from "@/app/api/appointments/route";
import { _resetCaptchaDedupeForTests } from "@/lib/integrations/captcha";
import { _resetRateLimitStoreForTests } from "@/lib/rateLimit";

function postJson(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/appointments", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.7",
      "x-salon-slug": SALON_SLUG,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const FUTURE_ISO = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

const VALID_BODY = {
  serviceId: "svc_1",
  startISO: FUTURE_ISO,
  name: "Pat Smith",
  email: "pat@example.com",
  phone: "+15555551212",
  smsOptIn: true,
};

beforeEach(() => {
  _resetRateLimitStoreForTests();
  _resetCaptchaDedupeForTests();
  delete process.env.TURNSTILE_SECRET_KEY;
  prismaMock.salon.findUnique.mockReset().mockResolvedValue({
    id: SALON_ID,
    slug: SALON_SLUG,
    name: "Test Salon",
    timezone: "America/Los_Angeles",
    instagram: null,
    brandColor: "#db2777",
    accentColor: "#db2777",
    backgroundColor: "#fdf2f8",
    fontKey: "geist",
    logoUrl: null,
    status: "ACTIVE",
  });
  prismaMock.service.findUnique.mockReset();
  prismaMock.service.findMany.mockReset();
  prismaMock.appointment.findFirst.mockReset().mockResolvedValue(null);
  prismaMock.appointment.create.mockReset();
  prismaMock.clientPackage.findMany.mockReset().mockResolvedValue([]);
  prismaMock.client.upsert.mockReset().mockResolvedValue({ id: "client_1" });
  // Default settings: no book-out limit so existing cases are unaffected.
  prismaMock.setting.upsert.mockReset().mockResolvedValue({
    id: "default",
    slotGranularityMin: 15,
    allowStartAtClose: false,
    maxAdvanceDays: null,
  });
});

afterEach(() => {
  _resetRateLimitStoreForTests();
  _resetCaptchaDedupeForTests();
  delete process.env.TURNSTILE_SECRET_KEY;
  vi.unstubAllGlobals();
});

function mockServiceOk() {
  prismaMock.service.findUnique.mockResolvedValue({
    id: "svc_1",
    salonId: SALON_ID,
    name: "Manicure",
    durationMinutes: 60,
    active: true,
  });
}

describe("POST /api/appointments — input validation", () => {
  it("400s on a non-JSON body", async () => {
    const res = await POST(postJson("not-json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON." });
  });

  it("400s when required fields are missing", async () => {
    const res = await POST(postJson({ serviceId: "svc_1" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid input.");
  });

  it("400s on a malformed phone number", async () => {
    mockServiceOk();
    const res = await POST(postJson({ ...VALID_BODY, phone: "12345" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/appointments — domain rules", () => {
  it("404s when the service is missing", async () => {
    prismaMock.service.findUnique.mockResolvedValue(null);
    const res = await POST(postJson(VALID_BODY));
    expect(res.status).toBe(404);
  });

  it("404s when the service is inactive", async () => {
    prismaMock.service.findUnique.mockResolvedValue({
      id: "svc_1",
      name: "Manicure",
      durationMinutes: 60,
      active: false,
    });
    const res = await POST(postJson(VALID_BODY));
    expect(res.status).toBe(404);
  });

  it("400s when the requested start time is in the past", async () => {
    mockServiceOk();
    const past = new Date(Date.now() - 60_000).toISOString();
    const res = await POST(postJson({ ...VALID_BODY, startISO: past }));
    expect(res.status).toBe(400);
  });

  it("400s when the start time is beyond the max book-out window", async () => {
    mockServiceOk();
    prismaMock.setting.upsert.mockResolvedValue({
      id: "default",
      slotGranularityMin: 15,
      allowStartAtClose: false,
      maxAdvanceDays: 30, // 1 month
    });
    const tooFar = new Date(
      Date.now() + 60 * 24 * 60 * 60 * 1000 // 60 days out
    ).toISOString();
    const res = await POST(postJson({ ...VALID_BODY, startISO: tooFar }));
    expect(res.status).toBe(400);
    expect(prismaMock.appointment.create).not.toHaveBeenCalled();
  });

  it("409s when the slot is already taken", async () => {
    mockServiceOk();
    prismaMock.appointment.findFirst.mockResolvedValue({ id: "existing" });
    const res = await POST(postJson(VALID_BODY));
    expect(res.status).toBe(409);
    expect(prismaMock.appointment.create).not.toHaveBeenCalled();
  });

  it("creates the appointment and returns the management envelope on the happy path", async () => {
    mockServiceOk();
    prismaMock.appointment.create.mockResolvedValue({
      id: "appt_1",
      managementToken: "mgmt-token-xyz",
    });

    const res = await POST(postJson(VALID_BODY));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      managementToken: string;
      serviceName: string;
      whenLabel: string;
    };
    expect(body.id).toBe("appt_1");
    expect(body.managementToken).toBe("mgmt-token-xyz");
    expect(body.serviceName).toBe("Manicure");
    expect(body.whenLabel).toEqual(expect.any(String));

    expect(prismaMock.appointment.create).toHaveBeenCalledOnce();
    const createArgs = prismaMock.appointment.create.mock.calls[0][0] as {
      data: { startsAt: Date; endsAt: Date; serviceId: string };
    };
    // endsAt should be exactly durationMinutes after startsAt.
    expect(
      createArgs.data.endsAt.getTime() - createArgs.data.startsAt.getTime()
    ).toBe(60 * 60_000);
    expect(createArgs.data.serviceId).toBe("svc_1");
  });
});

describe("POST /api/appointments — package redemption", () => {
  it("redeems a package session instead of creating a payment hold", async () => {
    mockServiceOk();
    prismaMock.clientPackage.findMany.mockResolvedValueOnce([
      { id: "cp_1", sessionsUsed: 2, sessionsTotal: 5 },
    ]);
    prismaMock.appointment.create.mockResolvedValue({
      id: "appt_1",
      managementToken: "tok",
    });

    const res = await POST(postJson(VALID_BODY));
    expect(res.status).toBe(200);
    const createArgs = prismaMock.appointment.create.mock.calls[0][0] as {
      data: { clientPackageId?: string; status?: string };
    };
    expect(createArgs.data.clientPackageId).toBe("cp_1");
    expect(createArgs.data.status).toBeUndefined(); // defaults to CONFIRMED
  });

  it("does not look up a package when the booking includes add-ons (no partial-package charges)", async () => {
    mockServiceOk();
    prismaMock.service.findMany.mockResolvedValueOnce([
      { id: "svc_2", name: "Pedicure", durationMinutes: 30, priceCents: 3000 },
    ]);
    prismaMock.appointment.create.mockResolvedValue({ id: "appt_1", managementToken: "tok" });

    await POST(postJson({ ...VALID_BODY, addOnServiceIds: ["svc_2"] }));

    expect(prismaMock.clientPackage.findMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/appointments — rate limiting", () => {
  it("429s after 5 requests from the same IP inside the window", async () => {
    mockServiceOk();
    prismaMock.appointment.create.mockResolvedValue({
      id: "appt",
      managementToken: "tok",
    });

    // First 5 succeed (validation may still 409/200 etc.; we just care the
    // limiter doesn't reject them).
    for (let i = 0; i < 5; i++) {
      const res = await POST(postJson(VALID_BODY));
      expect(res.status).not.toBe(429);
    }
    // 6th from the same IP is throttled before any DB work happens.
    const res = await POST(postJson(VALID_BODY));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
  });

  it("does not throttle a different IP", async () => {
    mockServiceOk();
    prismaMock.appointment.create.mockResolvedValue({
      id: "appt",
      managementToken: "tok",
    });
    for (let i = 0; i < 5; i++) {
      await POST(postJson(VALID_BODY));
    }
    const res = await POST(
      postJson(VALID_BODY, { "x-forwarded-for": "198.51.100.42" })
    );
    expect(res.status).not.toBe(429);
  });
});

describe("POST /api/appointments \u2014 captcha gate", () => {
  it("is a no-op when TURNSTILE_SECRET_KEY is unset", async () => {
    mockServiceOk();
    prismaMock.appointment.create.mockResolvedValue({
      id: "appt",
      managementToken: "tok",
    });
    const res = await POST(postJson(VALID_BODY));
    expect(res.status).toBe(200);
  });

  it("rejects with 400 when the captcha token is missing and the secret is set", async () => {
    process.env.TURNSTILE_SECRET_KEY = "prod-secret";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    mockServiceOk();
    const res = await POST(postJson(VALID_BODY));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing captcha token." });
    // Captcha rejection should short-circuit — no DB lookup, no service fetch.
    expect(prismaMock.service.findUnique).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects with 400 when Cloudflare reports the token is invalid", async () => {
    process.env.TURNSTILE_SECRET_KEY = "prod-secret";
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: false,
        "error-codes": ["invalid-input-response"],
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    mockServiceOk();
    const res = await POST(
      postJson({ ...VALID_BODY, captchaToken: "forged" })
    );
    expect(res.status).toBe(400);
    expect(prismaMock.service.findUnique).not.toHaveBeenCalled();
  });

  it("proceeds with the booking when the captcha verifies", async () => {
    process.env.TURNSTILE_SECRET_KEY = "prod-secret";
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    mockServiceOk();
    prismaMock.appointment.create.mockResolvedValue({
      id: "appt",
      managementToken: "tok",
    });
    const res = await POST(
      postJson({ ...VALID_BODY, captchaToken: "good-token" })
    );
    expect(res.status).toBe(200);
    expect(prismaMock.appointment.create).toHaveBeenCalled();
  });
});
