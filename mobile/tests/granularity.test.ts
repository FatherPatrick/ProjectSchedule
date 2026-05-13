import { describe, expect, it } from "vitest";
import { ALLOWED_GRANULARITIES } from "@/lib/granularity";

describe("ALLOWED_GRANULARITIES", () => {
  it("matches the server allow-list (mirrors src/lib/validation/admin.ts)", () => {
    expect([...ALLOWED_GRANULARITIES]).toEqual([
      5, 10, 15, 20, 30, 45, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360,
    ]);
  });

  it("is sorted ascending (UI relies on this for the granularity picker)", () => {
    const sorted = [...ALLOWED_GRANULARITIES].slice().sort((a, b) => a - b);
    expect([...ALLOWED_GRANULARITIES]).toEqual(sorted);
  });
});
