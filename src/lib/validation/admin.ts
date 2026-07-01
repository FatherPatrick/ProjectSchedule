/**
 * FormData (server-action) wrappers for admin write paths.
 *
 * Strategy: each `parse*Form` helper does two passes —
 *   1. A shallow form-shape parse that coerces strings → numbers / booleans
 *      and enforces only the form-specific rules (e.g. `durationHours`
 *      must be 0..24).
 *   2. A second pass against the canonical JSON schema in
 *      `./adminJson.ts`, which owns every field-level constraint shared
 *      with the JSON endpoints (max lengths, min minutes, allowed
 *      granularities, day-of-week coverage).
 *
 * That keeps the two transports validating against the same rules
 * without forcing them through zod's `.pipe()` plumbing, which gets
 * brittle around `.optional().nullable()` typing.
 *
 * Public API:
 *   - `serviceCreateSchema` / `parseServiceCreateForm`
 *   - `businessHoursSaveSchema` / `parseBusinessHoursSaveForm`
 *   - `scheduledChangeCreateSchema` / `parseScheduledChangeCreateForm`
 *   - `scheduledChangeDeleteSchema` / `parseScheduledChangeDeleteForm`
 *   - `appointmentCancelBodySchema`
 *   - `ALLOWED_GRANULARITIES` (re-exported for the hours admin UI)
 */
import { z } from "zod";
import { hhmmToMinutes } from "@/lib/domain/dates";
import {
  ALLOWED_GRANULARITIES,
  _shared,
  appearanceUpdateSchema,
  businessHoursJsonSaveSchema,
  businessHoursScheduleJsonCreateSchema,
  serviceJsonCreateSchema,
  type AppearanceUpdate,
  type ServiceJsonCreate,
} from "./adminJson";

export { ALLOWED_GRANULARITIES };

const { granularityField, maxAdvanceDaysField, effectiveFromField, HHMM_REGEX } =
  _shared;

/**
 * Form-level "max book-out" field. The hours-page <select> posts either the
 * string "none" (no limit → null) or a number-of-days string. Preprocess into
 * `number | null`, then validate against the canonical allow-list.
 */
const maxAdvanceFormField = z.preprocess((v) => {
  if (v === "none" || v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? v : n;
}, maxAdvanceDaysField);

const optionalNonEmptyString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

/* -------------------------------------------------------------------------- */
/*                                 Services                                   */
/* -------------------------------------------------------------------------- */

/**
 * Raw form-shape: combines `durationHours + durationMinutes` into a single
 * minutes integer and `priceDollars` into cents. Field-level constraints
 * (name length, min duration, max price) are enforced by the canonical
 * {@link serviceJsonCreateSchema} in the second pass.
 */
export const serviceCreateSchema = z
  .object({
    name: z.string(),
    durationHours: z.coerce
      .number()
      .int("Hours must be a whole number.")
      .min(0)
      .max(24),
    durationMinutes: z.coerce
      .number()
      .int("Minutes must be a whole number.")
      .min(0)
      .max(59),
    priceDollars: z.coerce
      .number()
      .nonnegative("Price cannot be negative.")
      .max(100_000),
    description: optionalNonEmptyString(2_000),
  })
  .transform(({ name, durationHours, durationMinutes, priceDollars, description }) => ({
    name,
    description,
    durationMinutes: durationHours * 60 + durationMinutes,
    priceCents: Math.round(priceDollars * 100),
  }));

export type ServiceCreate = ServiceJsonCreate;

export function parseServiceCreateForm(fd: FormData): ServiceCreate {
  const intermediate = serviceCreateSchema.parse({
    name: fd.get("name") ?? "",
    durationHours: fd.get("durationHours") ?? 0,
    durationMinutes: fd.get("durationMinutes") ?? 0,
    priceDollars: fd.get("priceDollars") ?? 0,
    description: fd.get("description") ?? undefined,
  });
  return serviceJsonCreateSchema.parse(intermediate);
}

/* -------------------------------------------------------------------------- */
/*                              Business hours                                */
/* -------------------------------------------------------------------------- */

const dayHoursFormSchema = z.object({
  active: z.boolean(),
  open: z.string().regex(HHMM_REGEX, "Open time must be HH:MM."),
  close: z.string().regex(HHMM_REGEX, "Close time must be HH:MM."),
});

/** Map position-indexed form days into the canonical JSON shape. */
function formDaysToJson(
  days: Array<{ active: boolean; open: string; close: string }>
) {
  return days.map((d, i) => ({
    dayOfWeek: i,
    openMin: hhmmToMinutes(d.open),
    closeMin: hhmmToMinutes(d.close),
    active: d.active,
  }));
}

/**
 * Output shape: `{ granularity, days: [{active, open, close}] }`. Callers
 * use {@link parseBusinessHoursSaveForm}, which additionally re-validates
 * the `days` array via {@link businessHoursJsonSaveSchema} so any rule
 * added there (e.g. requiring `closeMin >= openMin`) applies to both
 * transports automatically.
 */
export const businessHoursSaveSchema = z.object({
  granularity: granularityField,
  maxAdvanceDays: maxAdvanceFormField,
  days: z.array(dayHoursFormSchema).length(7),
});

export type BusinessHoursSave = z.infer<typeof businessHoursSaveSchema>;

function parseDayHoursFromForm(
  fd: FormData,
  prefix: { active: string; open: string; close: string }
): Array<{ active: boolean; open: string; close: string }> {
  return Array.from({ length: 7 }, (_, d) => ({
    active: fd.get(`${prefix.active}-${d}`) === "on",
    open: String(fd.get(`${prefix.open}-${d}`) ?? "09:00"),
    close: String(fd.get(`${prefix.close}-${d}`) ?? "18:00"),
  }));
}

export function parseBusinessHoursSaveForm(fd: FormData): BusinessHoursSave {
  const value = businessHoursSaveSchema.parse({
    granularity: fd.get("granularity") ?? 30,
    maxAdvanceDays: fd.get("maxAdvanceDays") ?? "none",
    days: parseDayHoursFromForm(fd, {
      active: "active",
      open: "open",
      close: "close",
    }),
  });
  // Second pass: enforce the canonical per-day rules.
  businessHoursJsonSaveSchema.parse({ days: formDaysToJson(value.days) });
  return value;
}

/* -------------------------------------------------------------------------- */
/*                          Scheduled hours changes                           */
/* -------------------------------------------------------------------------- */

/**
 * Output shape: `{ effectiveFrom, note, days: [{active, open, close}] }`.
 * The `days` array is re-validated against the canonical JSON schema
 * inside {@link parseScheduledChangeCreateForm}.
 */
export const scheduledChangeCreateSchema = z.object({
  effectiveFrom: effectiveFromField,
  note: optionalNonEmptyString(200),
  days: z.array(dayHoursFormSchema).length(7),
});

export type ScheduledChangeCreate = z.infer<typeof scheduledChangeCreateSchema>;

export function parseScheduledChangeCreateForm(
  fd: FormData
): ScheduledChangeCreate {
  const value = scheduledChangeCreateSchema.parse({
    effectiveFrom: String(fd.get("effectiveFrom") ?? "").trim(),
    note: fd.get("note") ?? undefined,
    days: parseDayHoursFromForm(fd, {
      active: "s-active",
      open: "s-open",
      close: "s-close",
    }),
  });
  businessHoursScheduleJsonCreateSchema.parse({
    effectiveFrom: value.effectiveFrom,
    note: value.note,
    days: formDaysToJson(value.days),
  });
  return value;
}

export const scheduledChangeDeleteSchema = z.object({
  effectiveFrom: effectiveFromField,
});

export type ScheduledChangeDelete = z.infer<typeof scheduledChangeDeleteSchema>;

export function parseScheduledChangeDeleteForm(
  fd: FormData
): ScheduledChangeDelete {
  return scheduledChangeDeleteSchema.parse({
    effectiveFrom: String(fd.get("effectiveFrom") ?? "").trim(),
  });
}

/* -------------------------------------------------------------------------- */
/*                                Appearance                                  */
/* -------------------------------------------------------------------------- */

/**
 * The form posts every field on every save (color inputs always render a
 * value), so this just strips blanks and re-validates against the canonical
 * schema — there's no form-specific coercion needed here.
 */
export function parseAppearanceUpdateForm(fd: FormData): AppearanceUpdate {
  const raw: Record<string, string> = {};
  for (const key of ["brandColor", "accentColor", "backgroundColor", "fontKey"] as const) {
    const v = fd.get(key);
    if (typeof v === "string" && v.trim()) raw[key] = v.trim();
  }
  return appearanceUpdateSchema.parse(raw);
}

/* -------------------------------------------------------------------------- */
/*                       Admin appointment cancel body                        */
/* -------------------------------------------------------------------------- */

/** JSON body for `POST /api/admin/appointments/[id]/cancel`. */
export const appointmentCancelBodySchema = z
  .object({
    message: z.string().trim().max(280).optional(),
  })
  .partial();

export type AppointmentCancelBody = z.infer<typeof appointmentCancelBodySchema>;
