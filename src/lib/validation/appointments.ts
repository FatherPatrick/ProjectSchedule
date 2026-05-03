import { z } from "zod";

/** Shared shape for client-submitted appointment requests (book + propose). */
export const appointmentRequestSchema = z.object({
  serviceId: z.string().min(1),
  startISO: z.string().datetime(),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().min(7).max(32),
  smsOptIn: z.boolean().default(true),
  notes: z.string().trim().max(500).optional(),
});

export type AppointmentRequest = z.infer<typeof appointmentRequestSchema>;

/** Query for the public availability endpoint. */
export const availabilityQuerySchema = z.object({
  serviceId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
