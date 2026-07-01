/**
 * CORS allow-list for mobile/admin JSON endpoints.
 *
 * The web admin runs on the same origin as the API and never triggers CORS.
 * The Expo mobile app, however, runs on a different origin during dev (the
 * Expo Go process or a LAN URL) and needs explicit CORS headers.
 *
 * Allowed origins:
 *   - The platform domain and any tenant subdomain of it
 *     (`APP_BASE_DOMAIN`, e.g. `app.com` or `<slug>.app.com`).
 *   - `http://localhost:8081` (Expo web).
 *   - Anything in `MOBILE_DEV_ORIGINS` (comma-separated, e.g.
 *     `http://192.168.1.50:8081,http://192.168.1.50:19006`).
 *
 * In dev, when `MOBILE_DEV_ORIGINS` is unset, we additionally accept any
 * `http://192.168.*` / `http://10.*` origin to avoid configuration overhead
 * on a fresh laptop.
 */
import { APP_BASE_DOMAIN } from "./config";

const STATIC_ALLOW = new Set<string>(
  [
    "http://localhost:8081",
    "http://localhost:19006",
    ...(process.env.MOBILE_DEV_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ].filter(Boolean)
);

const LAN_DEV_REGEX = /^https?:\/\/(192\.168|10\.|127\.0\.0\.1|localhost)(\.|:)/;

// Matches the platform apex domain and any tenant subdomain of it, e.g.
// `https://app.com` or `https://polished.app.com` (or their localhost
// equivalents in dev, since APP_BASE_DOMAIN defaults to "localhost:3000").
const escapedDomain = APP_BASE_DOMAIN.replace(/[.*+^${}()|[\]\\]/g, "\\$&");
const TENANT_ORIGIN_REGEX = new RegExp(
  `^https?://([a-z0-9-]+\\.)?${escapedDomain}$`
);

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (STATIC_ALLOW.has(origin)) return true;
  if (TENANT_ORIGIN_REGEX.test(origin)) return true;
  if (process.env.NODE_ENV !== "production" && LAN_DEV_REGEX.test(origin)) {
    return true;
  }
  return false;
}

/**
 * Build the CORS headers for a given request. Returns an empty object when
 * the origin is not allowed (the response simply lacks CORS headers, which
 * the browser will treat as a CORS failure).
 */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!isAllowedOrigin(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin!,
    Vary: "Origin",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

/** Standard 204 response for an `OPTIONS` preflight request. */
export function preflightResponse(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}
