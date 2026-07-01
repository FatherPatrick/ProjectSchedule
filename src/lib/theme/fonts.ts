/**
 * Curated, bundled font set for salon appearance theming (locked decision:
 * bundle via next/font, switch by CSS variable — no runtime Google Fonts
 * request, no FOUT). `next/font/google` calls must be literal top-level
 * calls for Next's compiler to statically extract them, so every curated
 * font is loaded unconditionally here regardless of which salons use it.
 *
 * Import this module only from code that runs inside Next's build pipeline
 * (e.g. the root layout) — `next/font/google` throws outside of it (see
 * ./fontKeys.ts, which holds the dependency-free metadata for everything
 * else, like validation schemas).
 */
import { Geist, Inter, Playfair_Display, Poppins } from "next/font/google";

const geistFont = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const playfairFont = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});
const poppinsFont = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const interFont = Inter({ variable: "--font-inter", subsets: ["latin"] });

export { CURATED_FONTS, FONT_KEYS, fontCssVar, isFontKey, type FontKey } from "./fontKeys";

/** Space-joined font `variable` classNames — apply once on <html>. */
export function fontVariableClassNames(): string {
  return [geistFont.variable, playfairFont.variable, poppinsFont.variable, interFont.variable].join(
    " "
  );
}
