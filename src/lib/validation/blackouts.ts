import { z } from "zod";

/** Admin blackout creation payload. */
export const blackoutCreateSchema = z.object({
  fromDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  allDay: z.boolean(),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  reason: z.string().max(200).nullable(),
});

export type BlackoutCreate = z.infer<typeof blackoutCreateSchema>;
