/**
 * Source of truth for every admin write-path validation rule.
 *
 * Shape: this file owns the canonical JSON request shapes and the field-
 * level constraints (max lengths, ranges, regexes, allow-lists). The
 * sibling `./admin.ts` builds the FormData (server-action) variants by
 * preprocessing form fields into the shapes defined here and then
 * `.pipe()`-ing into these schemas, so a constraint change here lights
 * up everywhere — JSON endpoints and form posts both.
 */
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/*                            Shared field atoms                              */
/* -------------------------------------------------------------------------- */

export const HHMM_REGEX = /^\d{1,2}:\d{2}$/;
export const YYYY_MM_DD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Valid booking-interval values (minutes between offered slot start times). */
export const ALLOWED_GRANULARITIES = [
  5, 10, 15, 20, 30, 45, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360,
] as const;

const NAME_MAX = 120;
const DESCRIPTION_MAX = 2_000;
const NOTE_MAX = 200;
const SERVICE_MIN_MINUTES = 5;
const SERVICE_MAX_MINUTES = 24 * 60;
const PRICE_MAX_CENTS = 10_000_000;
const MAX_MIN_OF_DAY = 24 * 60;

const nameField = z
  .string()
  .trim()
  .min(1, "Name is required.")
  .max(NAME_MAX, `Name must be ${NAME_MAX} characters or less.`);

const descriptionField = z
  .string()
  .trim()
  .max(DESCRIPTION_MAX, `Description must be ${DESCRIPTION_MAX} characters or less.`)
  .optional()
  .nullable();

const noteField = z
  .string()
  .trim()
  .max(NOTE_MAX, `Note must be ${NOTE_MAX} characters or less.`)
  .optional()
  .nullable();

const durationMinutesField = z
  .number()
  .int("Duration must be a whole number of minutes.")
  .min(SERVICE_MIN_MINUTES, `Service must be at least ${SERVICE_MIN_MINUTES} minutes long.`)
  .max(SERVICE_MAX_MINUTES, "Service cannot exceed 24 hours.");

const priceCentsField = z
  .number()
  .int("Price must be a whole number of cents.")
  .nonnegative("Price cannot be negative.")
  .max(PRICE_MAX_CENTS, "Price too large.");

const dayOfWeekField = z.number().int().min(0).max(6);

const minOfDayField = z.number().int().min(0).max(MAX_MIN_OF_DAY);

const granularityField = z.coerce.number().int().refine(
  (v) => (ALLOWED_GRANULARITIES as readonly number[]).includes(v),
  { message: "Unsupported booking interval." }
);

const effectiveFromField = z
  .string()
  .regex(YYYY_MM_DD_REGEX, "Use YYYY-MM-DD.");

/**
 * Canonical day-hours row in the JSON shape (explicit `dayOfWeek`,
 * minutes since midnight). The form schema uses a different shape
 * (`{active, open, close}` indexed by position) and preprocesses into
 * this one before validating.
 */
export const dayHoursJsonSchema = z.object({
  dayOfWeek: dayOfWeekField,
  openMin: minOfDayField,
  closeMin: minOfDayField,
  active: z.boolean(),
});
export type DayHoursJson = z.infer<typeof dayHoursJsonSchema>;

const sevenDayCovering = (
  v: { days: { dayOfWeek: number }[] }
): boolean => new Set(v.days.map((d) => d.dayOfWeek)).size === 7;

/* -------------------------------------------------------------------------- */
/*                                 Services                                   */
/* -------------------------------------------------------------------------- */

export const serviceJsonCreateSchema = z.object({
  name: nameField,
  description: descriptionField,
  durationMinutes: durationMinutesField,
  priceCents: priceCentsField,
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export type ServiceJsonCreate = z.infer<typeof serviceJsonCreateSchema>;

export const serviceJsonUpdateSchema = serviceJsonCreateSchema.partial();
export type ServiceJsonUpdate = z.infer<typeof serviceJsonUpdateSchema>;

export const serviceReorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
});
export type ServiceReorder = z.infer<typeof serviceReorderSchema>;

/* -------------------------------------------------------------------------- */
/*                              Business hours                                */
/* -------------------------------------------------------------------------- */

export const businessHoursJsonSaveSchema = z
  .object({
    days: z.array(dayHoursJsonSchema).length(7),
  })
  .refine(sevenDayCovering, {
    message: "Each dayOfWeek 0..6 must appear exactly once.",
  });
export type BusinessHoursJsonSave = z.infer<typeof businessHoursJsonSaveSchema>;

export const businessHoursScheduleJsonCreateSchema = z
  .object({
    effectiveFrom: effectiveFromField,
    note: noteField,
    days: z.array(dayHoursJsonSchema).length(7),
  })
  .refine(sevenDayCovering, {
    message: "Each dayOfWeek 0..6 must appear exactly once.",
  });
export type BusinessHoursScheduleJsonCreate = z.infer<
  typeof businessHoursScheduleJsonCreateSchema
>;

/* -------------------------------------------------------------------------- */
/*                                 Settings                                   */
/* -------------------------------------------------------------------------- */

export const settingsUpdateSchema = z
  .object({
    slotGranularityMin: z
      .number()
      .int()
      .refine(
        (v) => (ALLOWED_GRANULARITIES as readonly number[]).includes(v),
        { message: "Unsupported booking interval." }
      )
      .optional(),
    allowStartAtClose: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Provide at least one field to update.",
  });
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

/* -------------------------------------------------------------------------- */
/*                              Push registration                             */
/* -------------------------------------------------------------------------- */

export const pushRegisterSchema = z.object({
  pushToken: z.string().min(8).max(256),
  platform: z.enum(["ios", "android"]),
});
export type PushRegister = z.infer<typeof pushRegisterSchema>;

/* -------------------------------------------------------------------------- */
/*                  Re-exports for the FormData layer (./admin.ts)            */
/* -------------------------------------------------------------------------- */

/**
 * Internal field atoms exposed for the FormData wrappers in `./admin.ts`.
 * Application code should consume the schemas above directly; these are
 * here only so the form layer can build matching validators without
 * restating the constraints.
 */
export const _shared = {
  granularityField,
  effectiveFromField,
  noteField,
  HHMM_REGEX,
};
