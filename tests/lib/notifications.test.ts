/**
 * Covers `sendNotifications`' multi-service label
 * (docs/FEATURE_OPPORTUNITIES_SPEC.md #6) — a booking with add-ons should
 * read "Gel Manicure + Pedicure" in the subject/lead line, not just the
 * primary service name. Delivery mechanics (email/SMS opt-in branching,
 * NotificationLog rows) aren't re-tested here.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  appointment: { findUnique: vi.fn() },
  notificationLog: { create: vi.fn() },
}));
const sendEmailMock = vi.hoisted(() => vi.fn(async () => ({ id: "email_1", skipped: false as const })));
const sendSMSMock = vi.hoisted(() => vi.fn(async () => ({ sid: "sms_1" })));

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/integrations/email", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/lib/integrations/sms", () => ({
  sendSMS: sendSMSMock,
  withSmsFooter: (s: string) => s,
}));

import { sendNotifications } from "@/lib/integrations/notifications";

const SALON = {
  name: "Test Salon",
  instagram: null,
  slug: "test-salon",
  timezone: "America/Los_Angeles",
  brandColor: "#db2777",
  logoUrl: null,
};

function bundle(overrides: Record<string, unknown> = {}) {
  return {
    id: "appt_1",
    startsAt: new Date("2099-01-01T20:00:00.000Z"),
    endsAt: new Date("2099-01-01T21:00:00.000Z"),
    managementToken: "tok_1",
    client: { name: "Pat Smith", email: "pat@example.com", phone: "+15555551212", emailOptIn: true, smsOptIn: true },
    service: { id: "svc_1", name: "Gel Manicure" },
    salon: SALON,
    addOns: [],
    ...overrides,
  };
}

beforeEach(() => {
  prismaMock.appointment.findUnique.mockReset();
  prismaMock.notificationLog.create.mockReset();
  sendEmailMock.mockClear();
  sendSMSMock.mockClear();
});

describe("sendNotifications — multi-service label", () => {
  it("uses just the primary service name with no add-ons", async () => {
    prismaMock.appointment.findUnique.mockResolvedValueOnce(bundle());

    await sendNotifications("appt_1", "CONFIRMATION");

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining("Gel Manicure") })
    );
  });

  it("joins add-on service names into the subject and lead line", async () => {
    prismaMock.appointment.findUnique.mockResolvedValueOnce(
      bundle({
        addOns: [
          { service: { name: "Pedicure" } },
          { service: { name: "Nail Art" } },
        ],
      })
    );

    await sendNotifications("appt_1", "CONFIRMATION");

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining("Gel Manicure + Pedicure + Nail Art"),
        text: expect.stringContaining("Gel Manicure + Pedicure + Nail Art"),
      })
    );
    expect(sendSMSMock).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining("Gel Manicure + Pedicure + Nail Art") })
    );
  });

  it("includes the add-on combo in a cancellation notice too", async () => {
    prismaMock.appointment.findUnique.mockResolvedValueOnce(
      bundle({ addOns: [{ service: { name: "Pedicure" } }] })
    );

    await sendNotifications("appt_1", "CANCELLATION");

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining("Gel Manicure + Pedicure") })
    );
  });
});
