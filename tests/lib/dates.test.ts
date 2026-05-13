/**
 * Tests for the shared HH:MM helpers in `src/lib/domain/dates.ts`.
 *
 * These helpers are also imported from the mobile package via
 * `@shared/domain/dates`, so any behaviour change here ripples to both
 * surfaces. The mobile-side `format` re-export is covered separately by
 * the existing `mobile/tests/format.test.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  hhmmToMinutes,
  minutesToHHMM,
  minutesToHhmm,
  nextDay,
  parseHHMM,
} from "@/lib/domain/dates";

describe("hhmmToMinutes (lax)", () => {
  it("parses well-formed HH:MM into minutes since midnight", () => {
    expect(hhmmToMinutes("00:00")).toBe(0);
    expect(hhmmToMinutes("09:30")).toBe(9 * 60 + 30);
    expect(hhmmToMinutes("18:00")).toBe(18 * 60);
  });

  it("treats missing/non-numeric segments as 0 (caller is expected to pre-validate)", () => {
    expect(hhmmToMinutes(":")).toBe(0);
    expect(hhmmToMinutes("abc:xyz")).toBe(0);
  });
});

describe("minutesToHhmm (lax)", () => {
  it("formats minutes as HH:MM with zero padding", () => {
    expect(minutesToHhmm(0)).toBe("00:00");
    expect(minutesToHhmm(9 * 60 + 5)).toBe("09:05");
    expect(minutesToHhmm(24 * 60)).toBe("24:00");
  });
});

describe("parseHHMM (strict)", () => {
  it("returns minutes for well-formed input", () => {
    expect(parseHHMM("00:00")).toBe(0);
    expect(parseHHMM("9:05")).toBe(9 * 60 + 5);
    expect(parseHHMM("24:00")).toBe(24 * 60);
  });

  it("trims whitespace before parsing", () => {
    expect(parseHHMM("  09:30  ")).toBe(9 * 60 + 30);
  });

  it("returns null for malformed or out-of-range input", () => {
    expect(parseHHMM("")).toBeNull();
    expect(parseHHMM("9")).toBeNull();
    expect(parseHHMM("09:5")).toBeNull(); // minute must be 2 digits
    expect(parseHHMM("ab:cd")).toBeNull();
    expect(parseHHMM("25:00")).toBeNull();
    expect(parseHHMM("09:60")).toBeNull();
    expect(parseHHMM("24:30")).toBeNull(); // 24:00 only
    expect(parseHHMM("-1:00")).toBeNull();
  });
});

describe("minutesToHHMM (strict, clamped)", () => {
  it("clamps below 0 to 00:00 and above 1440 to 24:00", () => {
    expect(minutesToHHMM(-30)).toBe("00:00");
    expect(minutesToHHMM(25 * 60)).toBe("24:00");
  });

  it("matches the lax variant for in-range inputs", () => {
    for (const min of [0, 1, 5 * 60 + 17, 13 * 60 + 45, 24 * 60]) {
      expect(minutesToHHMM(min)).toBe(minutesToHhmm(min));
    }
  });
});

describe("nextDay", () => {
  it("rolls forward by one calendar day with no TZ shift", () => {
    expect(nextDay("2026-01-01")).toBe("2026-01-02");
    expect(nextDay("2026-02-28")).toBe("2026-03-01"); // 2026 is not a leap year
    expect(nextDay("2024-02-28")).toBe("2024-02-29");
    expect(nextDay("2024-02-29")).toBe("2024-03-01");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
  });
});
