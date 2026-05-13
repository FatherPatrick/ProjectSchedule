/**
 * Verifies that the FormData wrappers in `admin.ts` enforce the same
 * field-level constraints as the canonical JSON schemas in
 * `adminJson.ts` — i.e. they truly share rules instead of restating
 * them in two places.
 */
import { describe, expect, it } from "vitest";
import {
  parseBusinessHoursSaveForm,
  parseScheduledChangeCreateForm,
  parseServiceCreateForm,
} from "@/lib/validation/admin";
import {
  ALLOWED_GRANULARITIES,
  businessHoursJsonSaveSchema,
  serviceJsonCreateSchema,
} from "@/lib/validation/adminJson";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

function sevenDaysOpen(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let d = 0; d < 7; d++) {
    out[`active-${d}`] = "on";
    out[`open-${d}`] = "09:00";
    out[`close-${d}`] = "18:00";
  }
  return out;
}

describe("parseServiceCreateForm", () => {
  it("combines duration + price and produces the canonical JSON shape", () => {
    const out = parseServiceCreateForm(
      form({
        name: " Manicure ",
        durationHours: "1",
        durationMinutes: "30",
        priceDollars: "45.50",
        description: "  ",
      })
    );
    expect(out).toEqual({
      name: "Manicure",
      description: null,
      durationMinutes: 90,
      priceCents: 4_550,
    });
    // The JSON schema accepts the same object, by construction.
    expect(serviceJsonCreateSchema.safeParse(out).success).toBe(true);
  });

  it("rejects a duration below the canonical 5-minute floor", () => {
    expect(() =>
      parseServiceCreateForm(
        form({
          name: "Quick",
          durationHours: "0",
          durationMinutes: "3",
          priceDollars: "10",
        })
      )
    ).toThrow();
  });

  it("rejects a name that exceeds the canonical 120-char cap", () => {
    expect(() =>
      parseServiceCreateForm(
        form({
          name: "x".repeat(121),
          durationHours: "0",
          durationMinutes: "30",
          priceDollars: "10",
        })
      )
    ).toThrow();
  });
});

describe("parseBusinessHoursSaveForm", () => {
  it("accepts a valid 7-day grid + supported granularity", () => {
    const out = parseBusinessHoursSaveForm(
      form({ granularity: "30", ...sevenDaysOpen() })
    );
    expect(out.granularity).toBe(30);
    expect(out.days).toHaveLength(7);
    expect(out.days[0]).toEqual({ active: true, open: "09:00", close: "18:00" });
  });

  it("rejects an unsupported granularity (canonical allow-list)", () => {
    // 7 is not in ALLOWED_GRANULARITIES.
    expect(ALLOWED_GRANULARITIES).not.toContain(7);
    expect(() =>
      parseBusinessHoursSaveForm(form({ granularity: "7", ...sevenDaysOpen() }))
    ).toThrow();
  });

  it("rejects a malformed time", () => {
    const fd = form({ granularity: "30", ...sevenDaysOpen() });
    fd.set("open-0", "9am");
    expect(() => parseBusinessHoursSaveForm(fd)).toThrow();
  });
});

describe("parseScheduledChangeCreateForm", () => {
  it("requires YYYY-MM-DD effectiveFrom and accepts a valid grid", () => {
    const fd = form({
      effectiveFrom: "2027-01-15",
      note: "Holiday hours",
      ...Object.fromEntries(
        Object.entries(sevenDaysOpen()).map(([k, v]) => [
          k.replace(/^active/, "s-active").replace(/^open/, "s-open").replace(/^close/, "s-close"),
          v,
        ])
      ),
    });
    const out = parseScheduledChangeCreateForm(fd);
    expect(out.effectiveFrom).toBe("2027-01-15");
    expect(out.note).toBe("Holiday hours");
    expect(out.days).toHaveLength(7);
  });

  it("rejects a malformed effectiveFrom", () => {
    const fd = form({
      effectiveFrom: "not-a-date",
      ...Object.fromEntries(
        Object.entries(sevenDaysOpen()).map(([k, v]) => [
          k.replace(/^active/, "s-active").replace(/^open/, "s-open").replace(/^close/, "s-close"),
          v,
        ])
      ),
    });
    expect(() => parseScheduledChangeCreateForm(fd)).toThrow();
  });
});

describe("shared constraint coverage", () => {
  it("the JSON business-hours schema requires every dayOfWeek 0..6", () => {
    const days = Array.from({ length: 7 }, (_, d) => ({
      dayOfWeek: d === 6 ? 0 : d, // duplicate day 0
      openMin: 540,
      closeMin: 1080,
      active: true,
    }));
    expect(businessHoursJsonSaveSchema.safeParse({ days }).success).toBe(false);
  });
});
