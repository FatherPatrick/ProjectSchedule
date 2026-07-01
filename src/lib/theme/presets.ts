import type { FontKey } from "./fontKeys";

export interface AppearancePreset {
  key: string;
  name: string;
  brandColor: string;
  accentColor: string;
  backgroundColor: string;
  fontKey: FontKey;
}

/**
 * Curated "basic mode" themes — bundles of brand/accent/background/font
 * that look good together, for admins who don't want to pick four values
 * individually. All backgrounds stay light: `--foreground` (body text) is
 * a fixed dark neutral, not themeable, so a dark background would make
 * body copy unreadable.
 */
export const APPEARANCE_PRESETS: readonly AppearancePreset[] = [
  {
    key: "classic-pink",
    name: "Classic Pink",
    brandColor: "#db2777",
    accentColor: "#db2777",
    backgroundColor: "#fdf2f8",
    fontKey: "geist",
  },
  {
    key: "rose-gold",
    name: "Rose Gold",
    brandColor: "#be185d",
    accentColor: "#d97706",
    backgroundColor: "#fff7ed",
    fontKey: "playfair",
  },
  {
    key: "lavender",
    name: "Lavender",
    brandColor: "#7c3aed",
    accentColor: "#a855f7",
    backgroundColor: "#f5f3ff",
    fontKey: "poppins",
  },
  {
    key: "ocean",
    name: "Ocean",
    brandColor: "#0284c7",
    accentColor: "#06b6d4",
    backgroundColor: "#f0f9ff",
    fontKey: "inter",
  },
  {
    key: "sage",
    name: "Sage",
    brandColor: "#4d7c0f",
    accentColor: "#ca8a04",
    backgroundColor: "#f7f8f2",
    fontKey: "poppins",
  },
  {
    key: "stone-gold",
    name: "Stone & Gold",
    brandColor: "#57534e",
    accentColor: "#b45309",
    backgroundColor: "#fafaf9",
    fontKey: "playfair",
  },
] as const;

/** Matches the current values against a preset, if any preset is an exact match. */
export function matchingPresetKey(values: {
  brandColor: string;
  accentColor: string;
  backgroundColor: string;
  fontKey: string;
}): string | null {
  const hit = APPEARANCE_PRESETS.find(
    (p) =>
      p.brandColor === values.brandColor &&
      p.accentColor === values.accentColor &&
      p.backgroundColor === values.backgroundColor &&
      p.fontKey === values.fontKey
  );
  return hit?.key ?? null;
}
