import { z } from "zod";
import { toE164 } from "../phone";

/** Client-submitted request to join a service's waitlist. */
export const waitlistJoinSchema = z.object({
  serviceId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
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
});

export type WaitlistJoinRequest = z.infer<typeof waitlistJoinSchema>;
