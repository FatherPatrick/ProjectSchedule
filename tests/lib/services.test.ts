import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

import { createServiceForSingleSalon } from "@/lib/domain/services";

const SERVICE = {
  name: "Pedicure",
  description: null,
  durationMinutes: 60,
  priceCents: 5000,
};

beforeEach(() => {
  prismaMock.$queryRaw.mockReset();
});

describe("createServiceForSingleSalon", () => {
  it("creates a service for the sole active salon without slug lookup", async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ id: "salon_1" }])
      .mockResolvedValueOnce([{ id: "service_1" }]);

    await expect(createServiceForSingleSalon(SERVICE)).resolves.toBe("service_1");

    const salonQuery = prismaMock.$queryRaw.mock.calls[0][0] as TemplateStringsArray;
    expect(salonQuery.join(" ")).toContain('FROM "Salon" WHERE status = \'ACTIVE\'');
    expect(salonQuery.join(" ")).not.toContain("slug");

    const insertCall = prismaMock.$queryRaw.mock.calls[1];
    expect(insertCall[0].join(" ")).toContain('INSERT INTO "Service"');
    expect(insertCall).toContain("salon_1");
    expect(insertCall).toContain("Pedicure");
  });

  it.each([
    ["no active salon", []],
    ["multiple active salons", [{ id: "salon_1" }, { id: "salon_2" }]],
  ])("rejects when there are %s", async (_caseName, salons) => {
    prismaMock.$queryRaw.mockResolvedValueOnce(salons);

    await expect(createServiceForSingleSalon(SERVICE)).rejects.toThrow(
      salons.length === 0
        ? "No active salon is configured."
        : "Expected exactly one active salon."
    );
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

