export interface ServiceLite {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
}

export type ClientMode = "existing" | "new";

/** Mirrors the Prisma `RecurrenceRule` enum as a plain string union so this
 *  client component doesn't need a runtime import from `@prisma/client`. */
export type RecurrenceRule = "WEEKLY" | "BIWEEKLY" | "MONTHLY";
