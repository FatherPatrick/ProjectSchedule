import { describe, expect, it } from "vitest";
import {
  dayLabel,
  formatDuration,
  formatPrice,
  isValidYMD,
  minutesToHHMM,
  parseHHMM,
  todayYMD,
} from "@/lib/format";

describe("formatPrice", () => {
  it("renders cents to a fixed 2-decimal dollar string", () => {
    expect(formatPrice(0)).toBe("$0.00");
    expect(formatPrice(4_550)).toBe("$45.50");
    expect(formatPrice(1)).toBe("$0.01");
  });
});

describe("formatDuration", () => {
  it.each([
    [30, "30m"],
    [60, "1h"],
    [90, "1h 30m"],
    [125, "2h 5m"],
    [0, "0m"],
  ])("formats %i minutes as %s", (input, expected) => {
    expect(formatDuration(input)).toBe(expected);
  });
});

describe("minutesToHHMM", () => {
  it("zero-pads hours and minutes", () => {
    expect(minutesToHHMM(0)).toBe("00:00");
    expect(minutesToHHMM(9 * 60 + 5)).toBe("09:05");
    expect(minutesToHHMM(24 * 60)).toBe("24:00");
  });

  it("clamps negatives and overflow back into the valid range", () => {
    expect(minutesToHHMM(-30)).toBe("00:00");
    expect(minutesToHHMM(25 * 60)).toBe("24:00");
  });
});

describe("parseHHMM", () => {
  it("parses well-formed times", () => {
    expect(parseHHMM("09:05")).toBe(9 * 60 + 5);
    expect(parseHHMM("9:05")).toBe(9 * 60 + 5);
    expect(parseHHMM("24:00")).toBe(24 * 60);
  });

  it("returns null for malformed inputs", () => {
    expect(parseHHMM("9-05")).toBeNull();
    expect(parseHHMM("")).toBeNull();
    expect(parseHHMM("25:00")).toBeNull();
    expect(parseHHMM("09:60")).toBeNull();
    expect(parseHHMM("24:30")).toBeNull();
  });
});

describe("YMD helpers", () => {
  it("isValidYMD enforces the dashed shape", () => {
    expect(isValidYMD("2026-05-13")).toBe(true);
    expect(isValidYMD("26-5-13")).toBe(false);
    expect(isValidYMD("not a date")).toBe(false);
  });

  it("todayYMD returns a valid YYYY-MM-DD that round-trips back through isValidYMD", () => {
    const ymd = todayYMD();
    expect(isValidYMD(ymd)).toBe(true);
    const today = new Date();
    const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(ymd).toBe(expected);
  });
});

describe("dayLabel", () => {
  it("maps 0..6 to Sun..Sat", () => {
    expect(dayLabel(0)).toBe("Sun");
    expect(dayLabel(6)).toBe("Sat");
  });

  it("returns ? for out-of-range indexes", () => {
    expect(dayLabel(7)).toBe("?");
    expect(dayLabel(-1)).toBe("?");
  });
});
