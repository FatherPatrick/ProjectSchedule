/**
 * Hex validation + WCAG contrast helpers for the salon appearance theme.
 * Shared by the root-layout theme injection and the admin appearance UI so
 * both agree on what "readable" means for an arbitrary admin-picked color.
 */

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isValidHex(v: string): boolean {
  return HEX_RE.test(v);
}

function srgbToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance in [0, 1] (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const [rl, gl, bl] = [r, g, b].map(srgbToLinear);
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const WCAG_AA_NORMAL_TEXT = 4.5;

/**
 * Picks white or black text for the given background — whichever passes
 * WCAG AA (4.5:1) for normal text, or whichever has the better ratio if
 * neither does. This is the guardrail that keeps a guided color picker from
 * producing unreadable buttons: invalid input falls back to white.
 */
export function contrastTextColor(bgHex: string): "#ffffff" | "#000000" {
  if (!isValidHex(bgHex)) return "#ffffff";
  const bgL = relativeLuminance(bgHex);
  const whiteRatio = contrastRatio(bgL, 1);
  const blackRatio = contrastRatio(bgL, 0);
  return whiteRatio >= blackRatio ? "#ffffff" : "#000000";
}

/** True when white-on-`bgHex` meets WCAG AA — used to warn admins picking a light brand/accent color. */
export function passesWhiteTextAA(bgHex: string): boolean {
  if (!isValidHex(bgHex)) return false;
  return contrastRatio(relativeLuminance(bgHex), 1) >= WCAG_AA_NORMAL_TEXT;
}
