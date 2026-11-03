import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  service: { findUnique: vi.fn() },
  appointment: { findFirst: vi.fn() },
  setting: { upsert: vi.fn() },
}));
const getSingleActiveSalonIdMock = vi.hoisted(() => vi.fn());
const findClientIdByEmailMock = vi.hoisted(() => vi.fn());
const upsertClientForSalonMock = vi.hoisted(() => vi.fn());
const createAppointmentForSalonMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/domain/salon", () => ({
  getSingleActiveSalonId: getSingleActiveSalonIdMock,
}));
vi.mock("@/lib/domain/clients", () => ({
  findClientIdByEmail: findClientIdByEmailMock,
  upsertClientForSalon: upsertClientForSalonMock,
}));
vi.mock("@/lib/domain/appointments", () => ({
  createAppointmentForSalon: createAppointmentForSalonMock,
}));
vi.mock("@/lib/integrations/push", () => ({ pushToAdmins: vi.fn() }));
vi.mock("@/lib/integrations/adminSms", () => ({
  notifyAdminsOfBooking: vi.fn(),
}));

import { POST } from "@/app/api/appointments/propose/route";

const BODY = {
  serviceId: "service_1",
  startISO: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  name: "Pat Smith",
  email: "pat@example.com",
  phone: "+15555551212",
  smsOptIn: true,
};

beforeEach(() => {
  delete process.env.TURNSTILE_SECRET_KEY;
  getSingleActiveSalonIdMock.mockReset().mockResolvedValue("salon_1");
  findClientIdByEmailMock.mockReset().mockResolvedValue(null);
  upsertClientForSalonMock.mockReset().mockResolvedValue({ id: "client_1" });
  createAppointmentForSalonMock.mockReset().mockResolvedValue({
    id: "appointment_1",
    managementToken: "management-token",
  });
  prismaMock.service.findUnique.mockReset().mockResolvedValue({
    id: "service_1",
    name: "Manicure",
    durationMinutes: 60,
    active: true,
  });
  prismaMock.appointment.findFirst.mockReset().mockResolvedValue(null);
  prismaMock.setting.upsert.mockReset().mockResolvedValue({
    id: "default",
    slotGranularityMin: 15,
    allowStartAtClose: false,
    maxAdvanceDays: null,
  });
});

describe("POST /api/appointments/propose", () => {
  it("creates a pending appointment for the sole active salon", async () => {
    const response = await POST(
      new Request("http://localhost/api/appointments/propose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(BODY),
      })
    );

    expect(response.status).toBe(200);
    expect(upsertClientForSalonMock).toHaveBeenCalledWith(
      expect.objectContaining({ salonId: "salon_1", name: "Pat Smith" })
    );
    expect(createAppointmentForSalonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        salonId: "salon_1",
        clientId: "client_1",
        status: "PENDING",
      })
    );
  });
});
