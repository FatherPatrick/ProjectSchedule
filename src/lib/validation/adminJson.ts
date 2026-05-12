/**
 * Zod schemas used by the JSON `/api/admin/*` endpoints (consumed primarily
 * by the mobile admin app). Mirrors the form-shaped schemas in
 * `./admin.ts`, but accepts already-typed values rather than FormData.
 */
import { z } from "zod";
import { ALLOWED_GRANULARITIES } from "./admin";

const yyyyMmDdRegex = /^\d{4}-\d{2}-\d{2}$/;
const dayOfWeek = z.number().int().min(0).max(6);

/* -------------------------------------------------------------------------- */
/*                                 Services                                   */
/* -------------------------------------------------------------------------- */

export const serviceJsonCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  durationMinutes: z.number().int().min(5).max(24 * 60),
  priceCents: z.number().int().nonnegative().max(10_000_000),
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

const dayHoursJsonSchema = z.object({
  dayOfWeek,
  openMin: z.number().int().min(0).max(24 * 60),
  closeMin: z.number().int().min(0).max(24 * 60),
  active: z.boolean(),
});

export const businessHoursJsonSaveSchema = z
  .object({
    days: z.array(dayHoursJsonSchema).length(7),
  })
  .refine(
    (v) => {
      // Every dayOfWeek 0..6 present exactly once.
      const seen = new Set(v.days.map((d) => d.dayOfWeek));
      return seen.size === 7;
    },
    { message: "Each dayOfWeek 0..6 must appear exactly once." }
  );
export type BusinessHoursJsonSave = z.infer<typeof businessHoursJsonSaveSchema>;

export const businessHoursScheduleJsonCreateSchema = z
  .object({
    effectiveFrom: z.string().regex(yyyyMmDdRegex, "Use YYYY-MM-DD."),
    note: z.string().trim().max(200).optional().nullable(),
    days: z.array(dayHoursJsonSchema).length(7),
  })
  .refine(
    (v) => new Set(v.days.map((d) => d.dayOfWeek)).size === 7,
    { message: "Each dayOfWeek 0..6 must appear exactly once." }
  );
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
