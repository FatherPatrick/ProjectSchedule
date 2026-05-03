import { describe, it, expect } from "vitest";
import {
  bizDateKey,
  bizDayOfWeek,
  bizWallClockToUTC,
  formatBiz,
} from "@/lib/timezone";

// Tests assume BUSINESS_TIMEZONE defaults to America/Los_Angeles (see src/lib/config.ts).

describe("timezone helpers", () => {
  describe("bizWallClockToUTC", () => {
    it("converts a winter (PST, UTC-8) wall-clock time to UTC", () => {
      // Jan 15, 2026 09:00 PST -> 17:00 UTC
      const utc = bizWallClockToUTC("2026-01-15", 9 * 60);
      expect(utc.toISOString()).toBe("2026-01-15T17:00:00.000Z");
    });

    it("converts a summer (PDT, UTC-7) wall-clock time to UTC", () => {
      // Jul 15, 2026 09:00 PDT -> 16:00 UTC
      const utc = bizWallClockToUTC("2026-07-15", 9 * 60);
      expect(utc.toISOString()).toBe("2026-07-15T16:00:00.000Z");
    });

    it("handles minutes that aren't on the hour", () => {
      const utc = bizWallClockToUTC("2026-07-15", 9 * 60 + 30);
      expect(utc.toISOString()).toBe("2026-07-15T16:30:00.000Z");
    });
  });

  describe("bizDayOfWeek", () => {
    it("returns the local day-of-week (Mon=1) regardless of UTC date rollover", () => {
      // 2026-07-13 06:00 UTC == 2026-07-12 23:00 PDT (Sunday=0).
      const d = new Date("2026-07-13T06:00:00.000Z");
      expect(bizDayOfWeek(d)).toBe(0);
    });

    it("returns Monday for early-morning local Monday", () => {
      // 2026-07-13 16:00 UTC == 2026-07-13 09:00 PDT (Monday=1).
      const d = new Date("2026-07-13T16:00:00.000Z");
      expect(bizDayOfWeek(d)).toBe(1);
    });
  });

  describe("bizDateKey", () => {
    it("returns the local YYYY-MM-DD even when UTC is on the next day", () => {
      // 03:00 UTC on Jul 16 is still Jul 15 PDT.
      const d = new Date("2026-07-16T03:00:00.000Z");
      expect(bizDateKey(d)).toBe("2026-07-15");
    });
  });

  describe("formatBiz", () => {
    it("formats a UTC instant in local time", () => {
      const d = new Date("2026-07-15T16:00:00.000Z"); // 09:00 PDT
      expect(formatBiz(d, "h:mm a")).toBe("9:00 AM");
    });
  });

  describe("DST round-trip", () => {
    it("round-trips wall-clock -> UTC -> formatted wall-clock", () => {
      const utc = bizWallClockToUTC("2026-03-09", 10 * 60); // day after DST start
      expect(formatBiz(utc, "yyyy-MM-dd HH:mm")).toBe("2026-03-09 10:00");
    });
  });
});
