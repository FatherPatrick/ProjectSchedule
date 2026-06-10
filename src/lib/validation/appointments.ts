import { z } from "zod";
import { toE164 } from "../phone";

/** Shared shape for client-submitted appointment requests (book + propose). */
export const appointmentRequestSchema = z.object({
  serviceId: z.string().min(1),
  startISO: z.string().datetime(),
  name: z.string().trim().min(1).max(120),
  // Optional for now — bookings only need a name + phone (SMS is the channel).
  // When provided it must be a valid address.
  email: z.string().trim().email().optional(),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(32)
    .transform((v, ctx) => {
      const e = toE164(v);
      if (!e) {
        ctx.addIssue({
          code: "custom",
          message: "Enter a valid phone number, e.g. (555) 123-4567.",
        });
        return z.NEVER;
      }
      return e;
    }),
  smsOptIn: z.boolean().default(true),
  notes: z.string().trim().max(500).optional(),
});

export type AppointmentRequest = z.infer<typeof appointmentRequestSchema>;

/**
 * Admin "book on behalf of a client" request. Unlike the public schema this
 * allows either an existing `clientId` OR new-client details, and the route
 * creates a CONFIRMED appointment directly (no approval, no lead-time / window
 * / business-hours checks — admins can book any future slot). Phone for a new
 * client is normalized to E.164 in the route.
 */
export const adminAppointmentCreateSchema = z
  .object({
    serviceId: z.string().min(1),
    startISO: z.string().datetime(),
    clientId: z.string().min(1).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    // Optional — admin bookings only require a name + phone; email may be added
    // later. When provided it must still be a valid address.
    email: z.string().trim().email().optional(),
    phone: z.string().trim().min(7).max(32).optional(),
    smsOptIn: z.boolean().default(true),
    /** When true (default), send the client the usual confirmation + reminder. */
    notify: z.boolean().default(true),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((v) => Boolean(v.clientId) || Boolean(v.name && v.phone), {
    message:
      "Select an existing client, or enter a name and phone for a new client.",
  });

export type AdminAppointmentCreate = z.infer<typeof adminAppointmentCreateSchema>;

/** Query for the public availability endpoint. */
export const availabilityQuerySchema = z.object({
  serviceId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
