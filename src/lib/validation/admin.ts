import { z } from "zod";

/* -------------------------------------------------------------------------- */
/*                                 Services                                   */
/* -------------------------------------------------------------------------- */

const hhmmRegex = /^\d{1,2}:\d{2}$/;

/**
 * Raw form-shape for the "add service" form. The server action collects this
 * from FormData via {@link parseServiceCreateForm}.
 */
export const serviceCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(120),
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
    description: z
      .string()
      .trim()
      .max(2_000)
      .optional()
      .transform((v) => (v ? v : null)),
  })
  .transform(({ name, durationHours, durationMinutes, priceDollars, description }) => ({
    name,
    description,
    durationMinutes: durationHours * 60 + durationMinutes,
    priceCents: Math.round(priceDollars * 100),
  }))
  .refine((v) => v.durationMinutes >= 5, {
    message: "Service must be at least 5 minutes long.",
    path: ["durationMinutes"],
  });

export type ServiceCreate = z.infer<typeof serviceCreateSchema>;

export function parseServiceCreateForm(fd: FormData): ServiceCreate {
  return serviceCreateSchema.parse({
    name: fd.get("name") ?? "",
    durationHours: fd.get("durationHours") ?? 0,
    durationMinutes: fd.get("durationMinutes") ?? 0,
    priceDollars: fd.get("priceDollars") ?? 0,
    description: fd.get("description") ?? undefined,
  });
}

/* -------------------------------------------------------------------------- */
/*                              Business hours                                */
/* -------------------------------------------------------------------------- */

/** Valid booking-interval values (minutes between offered slot start times). */
export const ALLOWED_GRANULARITIES = [
  5, 10, 15, 20, 30, 45, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360,
] as const;

const dayHoursSchema = z.object({
  active: z.boolean(),
  open: z.string().regex(hhmmRegex, "Open time must be HH:MM."),
  close: z.string().regex(hhmmRegex, "Close time must be HH:MM."),
});

export const businessHoursSaveSchema = z.object({
  granularity: z
    .coerce.number()
    .refine((v) => (ALLOWED_GRANULARITIES as readonly number[]).includes(v), {
      message: "Unsupported booking interval.",
    }),
  days: z.array(dayHoursSchema).length(7),
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
  return businessHoursSaveSchema.parse({
    granularity: fd.get("granularity") ?? 30,
    days: parseDayHoursFromForm(fd, {
      active: "active",
      open: "open",
      close: "close",
    }),
  });
}

/* -------------------------------------------------------------------------- */
/*                          Scheduled hours changes                           */
/* -------------------------------------------------------------------------- */

const yyyyMmDdRegex = /^\d{4}-\d{2}-\d{2}$/;

export const scheduledChangeCreateSchema = z.object({
  effectiveFrom: z.string().regex(yyyyMmDdRegex, "Invalid effective date."),
  note: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : null)),
  days: z.array(dayHoursSchema).length(7),
});

export type ScheduledChangeCreate = z.infer<typeof scheduledChangeCreateSchema>;

export function parseScheduledChangeCreateForm(
  fd: FormData
): ScheduledChangeCreate {
  return scheduledChangeCreateSchema.parse({
    effectiveFrom: String(fd.get("effectiveFrom") ?? "").trim(),
    note: fd.get("note") ?? undefined,
    days: parseDayHoursFromForm(fd, {
      active: "s-active",
      open: "s-open",
      close: "s-close",
    }),
  });
}

export const scheduledChangeDeleteSchema = z.object({
  effectiveFrom: z.string().regex(yyyyMmDdRegex, "Invalid effective date."),
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
/*                       Admin appointment cancel body                        */
/* -------------------------------------------------------------------------- */

/** JSON body for `POST /api/admin/appointments/[id]/cancel`. */
export const appointmentCancelBodySchema = z
  .object({
    message: z.string().trim().max(280).optional(),
  })
  .partial();

export type AppointmentCancelBody = z.infer<typeof appointmentCancelBodySchema>;
