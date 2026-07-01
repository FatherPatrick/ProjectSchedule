/**
 * Platform default appearance — the pre-theming look (current pink + Geist).
 * Shared by the root-layout fallback, the Prisma schema `@default`s, and the
 * admin appearance page's "Reset to default" action, so all three can never
 * drift apart. Plain constants only — safe to import from client components.
 */
export const PLATFORM_DEFAULT_APPEARANCE = {
  brandColor: "#db2777",
  accentColor: "#db2777",
  backgroundColor: "#fdf2f8",
  fontKey: "geist",
} as const;
