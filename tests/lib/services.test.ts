import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
}));
const getSingleActiveSalonIdMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/domain/salon", () => ({
  getSingleActiveSalonId: getSingleActiveSalonIdMock,
}));

import { createServiceForSingleSalon } from "@/lib/domain/services";

const SERVICE = {
  name: "Pedicure",
  description: null,
  durationMinutes: 60,
  priceCents: 5000,
};

beforeEach(() => {
  prismaMock.$queryRaw.mockReset();
  getSingleActiveSalonIdMock.mockReset().mockResolvedValue("salon_1");
});

describe("createServiceForSingleSalon", () => {
  it("creates a service for the sole active salon without slug lookup", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([{ id: "service_1" }]);

    await expect(createServiceForSingleSalon(SERVICE)).resolves.toBe("service_1");

    expect(getSingleActiveSalonIdMock).toHaveBeenCalledOnce();
    const insertCall = prismaMock.$queryRaw.mock.calls[0];
    expect(insertCall[0].join(" ")).toContain('INSERT INTO "Service"');
    expect(insertCall).toContain("salon_1");
    expect(insertCall).toContain("Pedicure");
  });

  it.each([
    ["no active salon", "No active salon is configured."],
    ["multiple active salons", "Expected exactly one active salon."],
  ])("rejects when there are %s", async (_caseName, error) => {
    getSingleActiveSalonIdMock.mockRejectedValueOnce(new Error(error));

    await expect(createServiceForSingleSalon(SERVICE)).rejects.toThrow(error);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });
});

