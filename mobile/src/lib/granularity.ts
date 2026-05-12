/**
 * Mobile-side mirror of the server's `ALLOWED_GRANULARITIES` constant
 * (defined in `src/lib/validation/admin.ts`). Kept in sync manually; if these
 * drift, the server will reject the value with a 400.
 */
export const ALLOWED_GRANULARITIES = [
  5, 10, 15, 20, 30, 45, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360,
] as const;

export type AllowedGranularity = (typeof ALLOWED_GRANULARITIES)[number];
