/**
 * Curated font metadata only — no `next/font/google` import here. Kept
 * separate from `./fonts.ts` (which does the actual font loading) so that
 * widely-shared modules like validation schemas can depend on the allow-list
 * without pulling in `next/font/google`, which only works inside Next's own
 * build pipeline and throws in plain Node contexts like the Vitest suite.
 */

export const CURATED_FONTS = [
  { key: "geist", label: "Geist (default)", cssVar: "--font-geist-sans" },
  { key: "playfair", label: "Playfair Display", cssVar: "--font-playfair" },
  { key: "poppins", label: "Poppins", cssVar: "--font-poppins" },
  { key: "inter", label: "Inter", cssVar: "--font-inter" },
] as const;

export type FontKey = (typeof CURATED_FONTS)[number]["key"];

export const FONT_KEYS = CURATED_FONTS.map((f) => f.key) as FontKey[];

export function isFontKey(v: string): v is FontKey {
  return (FONT_KEYS as string[]).includes(v);
}

/** The CSS var a given fontKey should point --font-heading/--font-body at. Unknown keys fall back to Geist. */
export function fontCssVar(key: string): string {
  return CURATED_FONTS.find((f) => f.key === key)?.cssVar ?? "--font-geist-sans";
}
