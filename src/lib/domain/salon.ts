import { headers } from "next/headers";
import { prisma } from "../db/prisma";

export interface SalonContext {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  instagram: string | null;
  brandColor: string;
  accentColor: string;
  backgroundColor: string;
  fontKey: string;
  logoUrl: string | null;
  status: "ACTIVE" | "SUSPENDED" | "PENDING";
}

// ---------------------------------------------------------------------------
// In-memory slug cache (5-minute TTL)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000;
const slugCache = new Map<string, { context: SalonContext; expiresAt: number }>();

async function getSalonBySlug(slug: string): Promise<SalonContext | null> {
  const cached = slugCache.get(slug);
  if (cached && cached.expiresAt > Date.now()) return cached.context;

  const salon = await prisma.salon.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      timezone: true,
      instagram: true,
      brandColor: true,
      accentColor: true,
      backgroundColor: true,
      fontKey: true,
      logoUrl: true,
      status: true,
    },
  });

  if (!salon) {
    slugCache.delete(slug);
    return null;
  }

  const context: SalonContext = salon;
  slugCache.set(slug, { context, expiresAt: Date.now() + CACHE_TTL_MS });
  return context;
}

/** Evict a slug from the cache — call this after a salon is updated. */
export function invalidateSalonCache(slug: string): void {
  slugCache.delete(slug);
}

// ---------------------------------------------------------------------------
// Resolution helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the tenant salon for a route handler.
 * Reads the `x-salon-slug` header forwarded by the proxy middleware.
 */
export async function getSalonFromRequest(
  request: Request
): Promise<SalonContext | null> {
  const slug = request.headers.get("x-salon-slug");
  if (!slug) return null;
  return getSalonBySlug(slug);
}

/**
 * Resolves the tenant salon for server components and server actions.
 * Reads the `x-salon-slug` header via `next/headers` (set by the proxy).
 *
 * In development, falls back to the first active salon so that bare
 * `localhost:3000` (no subdomain) keeps working alongside subdomains.
 */
export async function getSalonFromContext(): Promise<SalonContext | null> {
  const headersList = await headers();
  const slug = headersList.get("x-salon-slug");
  if (slug) return getSalonBySlug(slug);

  // Dev-only fallback: bare localhost:3000 without a subdomain.
  // Phase 4 removes this path once the admin session carries salonId.
  if (process.env.NODE_ENV === "development") {
    const rows = await prisma.$queryRawUnsafe<SalonContext[]>(
      `SELECT id, slug, name, timezone, instagram, "brandColor", "accentColor",
              "backgroundColor", "fontKey", "logoUrl", status
       FROM "Salon" WHERE status = 'ACTIVE' ORDER BY "createdAt" ASC LIMIT 1`
    );
    return rows[0] ?? null;
  }

  return null;
}

/**
 * Like getSalonFromRequest but throws a 404-tagged error if no salon is found.
 */
export async function requireSalonFromRequest(
  request: Request
): Promise<SalonContext> {
  const salon = await getSalonFromRequest(request);
  if (!salon)
    throw Object.assign(new Error("Salon not found"), { status: 404 });
  return salon;
}

/**
 * Returns the salon for a public request, or a typed sentinel when the
 * salon is missing or not accepting bookings (SUSPENDED / PENDING).
 *
 * Route handlers should check `result.ok` before proceeding:
 *
 *   const salon = await getPublicSalon(req);
 *   if (!salon.ok) return salon.response;
 */
export async function getPublicSalon(
  request: Request
): Promise<{ ok: true; salon: SalonContext } | { ok: false; response: Response }> {
  const { NextResponse } = await import("next/server");
  const salon = await getSalonFromRequest(request);
  if (!salon) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Salon not found." }, { status: 404 }),
    };
  }
  if (salon.status !== "ACTIVE") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "This salon is not currently accepting bookings." },
        { status: 503 }
      ),
    };
  }
  return { ok: true, salon };
}

/**
 * Returns the salonId for admin operations (server components + route handlers).
 * Phase 3: resolved from the `x-salon-slug` header set by the proxy.
 * Phase 4: will be replaced by a session-based helper that reads
 *           `session.user.salonId` so mobile bearer-auth also works.
 */
export async function getAdminSalonId(): Promise<string> {
  const salon = await getSalonFromContext();
  if (!salon) throw new Error("No active salon configured.");
  return salon.id;
}

/**
 * Alias for server components on both public and admin pages.
 */
export const getDefaultSalonId = getAdminSalonId;
