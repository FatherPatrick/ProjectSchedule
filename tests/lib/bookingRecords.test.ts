import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

import {
  findClientIdByEmail,
  findClientIdById,
  upsertClientForSalon,
} from "@/lib/domain/clients";
import { createAppointmentForSalon } from "@/lib/domain/appointments";

beforeEach(() => {
  prismaMock.$queryRaw.mockReset();
  prismaMock.$executeRaw.mockReset();
});

describe("salon-scoped client records", () => {
  it("looks up email only within the requested salon", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([{ id: "client_1" }]);

    await expect(findClientIdByEmail("salon_1", "pat@example.com")).resolves.toBe(
      "client_1"
    );
    const [query, ...values] = prismaMock.$queryRaw.mock.calls[0];
    expect((query as TemplateStringsArray).join(" ")).toContain('"salonId" =');
    expect(values).toEqual(["salon_1", "pat@example.com"]);
  });

  it("verifies explicit client IDs belong to the requested salon", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([{ id: "client_1" }]);

    await expect(findClientIdById("salon_1", "client_1")).resolves.toBe(
      "client_1"
    );
    expect(prismaMock.$queryRaw.mock.calls[0]).toContain("salon_1");
  });

  it("inserts or updates the client with the resolved salon ID", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([{ id: "client_1" }]);

    await expect(
      upsertClientForSalon({
        salonId: "salon_1",
        existingId: "client_1",
        name: "Pat Smith",
        email: "pat@example.com",
        phone: "+15555551212",
        smsOptIn: true,
        emailOptIn: true,
      })
    ).resolves.toEqual({ id: "client_1" });

    const [query, ...values] = prismaMock.$queryRaw.mock.calls[0];
    expect((query as TemplateStringsArray).join(" ")).toContain('"salonId"');
    expect((query as TemplateStringsArray).join(" ")).toContain("ON CONFLICT (id)");
    expect(values).toEqual([
      "client_1",
      "salon_1",
      "Pat Smith",
      "pat@example.com",
      "+15555551212",
      true,
      true,
    ]);
  });

  it("creates a new client with a generated ID and required salon ID", async () => {
    prismaMock.$queryRaw.mockImplementationOnce(
      async (query: TemplateStringsArray, ...values: unknown[]) => {
        expect(query.join(" ")).toContain('INSERT INTO "Client"');
        return [{ id: String(values[0]) }];
      }
    );

    const client = await upsertClientForSalon({
      salonId: "salon_1",
      existingId: null,
      name: "New Client",
      email: "new@example.com",
      phone: "+15555551212",
      smsOptIn: true,
      emailOptIn: true,
    });

    expect(client.id).toMatch(/^c[0-9a-f]{22}$/);
    const [query, ...values] = prismaMock.$queryRaw.mock.calls[0];
    expect((query as TemplateStringsArray).join(" ")).toContain('"salonId"');
    expect(values.slice(0, 3)).toEqual([client.id, "salon_1", "New Client"]);
  });
});

describe("salon-scoped appointment records", () => {
  it("inserts appointments with salon ownership and status", async () => {
    prismaMock.$executeRaw.mockResolvedValueOnce(1);
    const startsAt = new Date("2026-11-10T18:00:00.000Z");
    const endsAt = new Date("2026-11-10T19:00:00.000Z");

    const result = await createAppointmentForSalon({
      salonId: "salon_1",
      serviceId: "service_1",
      clientId: "client_1",
      startsAt,
      endsAt,
      status: "PENDING",
      managementToken: "management-token",
    });

    expect(result.id).toMatch(/^c[0-9a-f]{22}$/);
    expect(result.managementToken).toBe("management-token");
    const [query, ...values] = prismaMock.$executeRaw.mock.calls[0];
    expect((query as TemplateStringsArray).join(" ")).toContain('"salonId"');
    expect(values).toEqual([
      result.id,
      "salon_1",
      "client_1",
      "service_1",
      startsAt,
      endsAt,
      "PENDING",
      "management-token",
      null,
    ]);
  });
});
