import { describe, expect, it } from "vitest";
import {
  addDays,
  endOfLocalDay,
  formatDayHeader,
  formatShortDay,
  formatTime,
  sameLocalDay,
  startOfLocalDay,
} from "@/lib/dates";

describe("startOfLocalDay / endOfLocalDay", () => {
  it("zeroes / maxes the time-of-day fields", () => {
    const d = new Date(2026, 4, 13, 14, 27, 9, 333); // 2:27:09.333 PM
    const start = startOfLocalDay(d);
    const end = endOfLocalDay(d);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });

  it("does not mutate the input Date", () => {
    const d = new Date(2026, 4, 13, 14);
    const before = d.getTime();
    startOfLocalDay(d);
    endOfLocalDay(d);
    expect(d.getTime()).toBe(before);
  });
});

describe("addDays", () => {
  it("rolls forward across a month boundary", () => {
    const d = new Date(2026, 4, 30); // May 30
    const after = addDays(d, 3); // -> June 2
    expect(after.getMonth()).toBe(5);
    expect(after.getDate()).toBe(2);
  });

  it("rolls backward with negative days", () => {
    const d = new Date(2026, 4, 1);
    expect(addDays(d, -1).getDate()).toBe(30);
  });

  it("does not mutate the input", () => {
    const d = new Date(2026, 4, 13);
    const ts = d.getTime();
    addDays(d, 5);
    expect(d.getTime()).toBe(ts);
  });
});

describe("sameLocalDay", () => {
  it("treats midnight + 23:59 as the same day", () => {
    expect(
      sameLocalDay(
        new Date(2026, 4, 13, 0, 0, 0),
        new Date(2026, 4, 13, 23, 59, 59)
      )
    ).toBe(true);
  });

  it("returns false across a midnight boundary", () => {
    expect(
      sameLocalDay(
        new Date(2026, 4, 13, 23, 59),
        new Date(2026, 4, 14, 0, 0)
      )
    ).toBe(false);
  });
});

describe("formatters", () => {
  it("formatTime renders a 12-hour clock", () => {
    expect(formatTime(new Date(2026, 4, 13, 9, 5))).toBe("9:05 AM");
    expect(formatTime(new Date(2026, 4, 13, 12, 0))).toBe("12:00 PM");
    expect(formatTime(new Date(2026, 4, 13, 0, 30))).toBe("12:30 AM");
    expect(formatTime(new Date(2026, 4, 13, 23, 59))).toBe("11:59 PM");
  });

  it("formatDayHeader includes weekday + month + day", () => {
    // 2026-05-13 is a Wednesday.
    expect(formatDayHeader(new Date(2026, 4, 13))).toBe("Wed, May 13");
  });

  it("formatShortDay returns the weekday + day-of-month for date pills", () => {
    expect(formatShortDay(new Date(2026, 4, 13))).toEqual({
      weekday: "Wed",
      day: 13,
    });
  });
});
