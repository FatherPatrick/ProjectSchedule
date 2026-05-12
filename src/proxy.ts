/**
 * Adds CORS headers (and serves OPTIONS preflight) for the JSON endpoints
 * that the mobile admin app calls. Only `/api/admin/*` and
 * `/api/auth/mobile/*` are matched; everything else is passed through
 * unchanged so the web admin (same-origin) is unaffected.
 */
import { NextResponse, type NextRequest } from "next/server";
import { corsHeaders, preflightResponse } from "@/lib/cors";

export const config = {
  matcher: ["/api/admin/:path*", "/api/auth/mobile/:path*"],
};

export function proxy(req: NextRequest) {
  if (req.method === "OPTIONS") {
    return preflightResponse(req);
  }
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(corsHeaders(req))) {
    res.headers.set(k, v);
  }
  return res;
}
