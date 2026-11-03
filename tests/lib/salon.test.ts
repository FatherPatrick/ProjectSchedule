import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

import { getSingleActiveSalonId } from "@/lib/domain/salon";

beforeEach(() => {
  prismaMock.$queryRaw.mockReset();
});

describe("getSingleActiveSalonId", () => {
  it("returns the only active salon without slug lookup", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([{ id: "salon_1" }]);

    await expect(getSingleActiveSalonId()).resolves.toBe("salon_1");

    const query = prismaMock.$queryRaw.mock.calls[0][0] as TemplateStringsArray;
    expect(query.join(" ")).toContain('FROM "Salon" WHERE status = \'ACTIVE\'');
    expect(query.join(" ")).not.toContain("slug");
  });

  it.each([
    ["no active salon", [], "No active salon is configured."],
    [
      "multiple active salons",
      [{ id: "salon_1" }, { id: "salon_2" }],
      "Expected exactly one active salon.",
    ],
  ])("fails closed when there are %s", async (_caseName, salons, message) => {
    prismaMock.$queryRaw.mockResolvedValueOnce(salons);

    await expect(getSingleActiveSalonId()).rejects.toThrow(message);
  });
});
