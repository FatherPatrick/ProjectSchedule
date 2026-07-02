/**
 * Integration tests for `POST /api/waitlist` (public waitlist join).
 * Mirrors appointments.test.ts's mocking approach for salon resolution,
 * captcha, and client upsert.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SALON_ID = "salon_1";
const SALON_SLUG = "waitlist-salon";

const prismaMock = vi.hoisted(() => ({
  salon: { findUnique: vi.fn() },
  service: { findUnique: vi.fn() },
  client: { upsert: vi.fn() },
  setting: { upsert: vi.fn() },
}));
const joinWaitlistMock = vi.hoisted(() => vi.fn(async () => ({ id: "wl_1", alreadyOnList: false })));

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/domain/clients", () => ({
  findClientIdByEmail: vi.fn(async () => null),
}));
vi.mock("@/lib/domain/waitlist", () => ({ joinWaitlist: joinWaitlistMock }));

import { POST } from "@/app/api/waitlist/route";
import { _resetCaptchaDedupeForTests } from "@/lib/integrations/captcha";
import { _resetRateLimitStoreForTests } from "@/lib/rateLimit";

function postJson(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/waitlist", {
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

const VALID_BODY = {
  serviceId: "svc_1",
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
  prismaMock.client.upsert.mockReset().mockResolvedValue({ id: "client_1" });
  prismaMock.setting.upsert.mockReset().mockResolvedValue({
    id: "default",
    salonId: SALON_ID,
    slotGranularityMin: 15,
    allowStartAtClose: false,
    maxAdvanceDays: null,
    reviewRequestEnabled: false,
    reviewRequestUrl: null,
    waitlistEnabled: true,
    waitlistClaimWindowMinutes: 30,
  });
  joinWaitlistMock.mockClear().mockResolvedValue({ id: "wl_1", alreadyOnList: false });
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
    active: true,
  });
}

describe("POST /api/waitlist", () => {
  it("404s when the salon has the waitlist turned off", async () => {
    prismaMock.setting.upsert.mockResolvedValueOnce({
      id: "default",
      salonId: SALON_ID,
      slotGranularityMin: 15,
      allowStartAtClose: false,
      maxAdvanceDays: null,
      reviewRequestEnabled: false,
      reviewRequestUrl: null,
      waitlistEnabled: false,
      waitlistClaimWindowMinutes: 30,
    });
    const res = await POST(postJson(VALID_BODY));
    expect(res.status).toBe(404);
    expect(joinWaitlistMock).not.toHaveBeenCalled();
  });

  it("404s when the service doesn't belong to this salon", async () => {
    prismaMock.service.findUnique.mockResolvedValueOnce({
      id: "svc_1",
      salonId: "other_salon",
      name: "Manicure",
      active: true,
    });
    const res = await POST(postJson(VALID_BODY));
    expect(res.status).toBe(404);
    expect(joinWaitlistMock).not.toHaveBeenCalled();
  });

  it("400s on invalid input", async () => {
    mockServiceOk();
    const res = await POST(postJson({ ...VALID_BODY, phone: "x" }));
    expect(res.status).toBe(400);
  });

  it("joins the waitlist and upserts the client on the happy path", async () => {
    mockServiceOk();
    const res = await POST(postJson(VALID_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(prismaMock.client.upsert).toHaveBeenCalled();
    expect(joinWaitlistMock).toHaveBeenCalledWith(SALON_ID, "svc_1", "client_1");
  });

  it("429s past the per-IP rate limit", async () => {
    mockServiceOk();
    for (let i = 0; i < 5; i++) {
      const res = await POST(postJson(VALID_BODY));
      expect(res.status).toBe(200);
    }
    const res = await POST(postJson(VALID_BODY));
    expect(res.status).toBe(429);
  });
});
