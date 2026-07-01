/**
 * Next.js middleware (Next 16 entrypoint: proxy.ts / proxy()).
 *
 * Two responsibilities:
 *  1. Parse the Host header → extract tenant slug → forward as `x-salon-slug`
 *     request header so server components and route handlers can resolve the
 *     salon without touching the Edge-incompatible Prisma client.
 *  2. Add CORS headers (and serve OPTIONS preflights) for the mobile admin API
 *     paths that the Expo app calls cross-origin.
 */
import { NextResponse, type NextRequest } from "next/server";
import { corsHeaders, preflightResponse } from "@/lib/cors";

// ---------------------------------------------------------------------------
// Tenant slug extraction
// ---------------------------------------------------------------------------

/** Subdomains that are platform routes, not tenant salons. */
const RESERVED_SLUGS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "signup",
  "assets",
  "help",
  "support",
  "blog",
  "status",
  "mail",
]);

/**
 * Extracts the tenant slug from a Host header value.
 *
 * Examples:
 *   polished.app.com        → "polished"
 *   polished.localhost:3000 → "polished"   (local dev)
 *   localhost:3000          → null         (no subdomain)
 *   app.com                 → null         (apex)
 */
function extractSlug(host: string): string | null {
  const hostname = host.split(":")[0].toLowerCase();

  // Local dev: <slug>.localhost
  if (hostname.endsWith(".localhost")) {
    const candidate = hostname.slice(0, -".localhost".length);
    // Reject multi-level subdomains (e.g. a.b.localhost)
    return candidate.includes(".") ? null : candidate;
  }

  // Bare localhost — no subdomain
  if (hostname === "localhost") return null;

  // Production: requires at least three parts (slug.apex.tld)
  const parts = hostname.split(".");
  if (parts.length < 3) return null;

  return parts[0];
}

// ---------------------------------------------------------------------------
// Middleware config & handler
// ---------------------------------------------------------------------------

export const config = {
  matcher: [
    // Run on every route except Next.js internals and common static assets.
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
  ],
};

export function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const isCorsPath =
    pathname.startsWith("/api/admin/") ||
    pathname.startsWith("/api/auth/mobile/");

  if (req.method === "OPTIONS" && isCorsPath) {
    return preflightResponse(req);
  }

  // Extract tenant slug and forward it as a request header so downstream
  // server components / route handlers can resolve the salon from the DB.
  const slug = extractSlug(req.headers.get("host") ?? "");
  const requestHeaders = new Headers(req.headers);
  if (slug && !RESERVED_SLUGS.has(slug)) {
    requestHeaders.set("x-salon-slug", slug);
  } else {
    requestHeaders.delete("x-salon-slug");
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });

  // CORS headers are only needed for the mobile admin API paths.
  if (isCorsPath) {
    for (const [k, v] of Object.entries(corsHeaders(req))) {
      res.headers.set(k, v);
    }
  }

  return res;
}
