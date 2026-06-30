import { prisma } from "../db/prisma";

export interface SalonContext {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  instagram: string | null;
  themeColor: string;
  status: "ACTIVE" | "SUSPENDED" | "PENDING";
}

// Phase 2: returns the single active salon.
// Uses $queryRawUnsafe because the Prisma client is not yet regenerated after
// the Phase 1 schema migrations — prisma.salon doesn't exist in the type
// system until `prisma generate` runs.
// Phase 3: replace resolveDefaultSalon with getSalonBySlug(slugFromHost).
async function resolveDefaultSalon(): Promise<SalonContext | null> {
  const rows = await prisma.$queryRawUnsafe<SalonContext[]>(
    `SELECT id, slug, name, timezone, instagram, "themeColor", status
     FROM "Salon" WHERE status = 'ACTIVE' ORDER BY "createdAt" ASC LIMIT 1`
  );
  return rows[0] ?? null;
}

/**
 * Returns the salon context for a given request.
 * Phase 2: hardcoded to the single active salon — request is unused.
 * Phase 3: will parse the Host header → slug → DB lookup.
 */
export async function getSalonFromRequest(
  _request: Request
): Promise<SalonContext | null> {
  return resolveDefaultSalon();
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
 * Returns the salonId for admin operations.
 * Phase 2: resolves to the single active salon.
 * Phase 4: replaced by requireAdminSalon() which reads session.user.salonId.
 */
export async function getAdminSalonId(): Promise<string> {
  const salon = await resolveDefaultSalon();
  if (!salon) throw new Error("No active salon configured.");
  return salon.id;
}

/**
 * Returns the salonId for server components (public + admin pages).
 * Phase 2/3: same source as getAdminSalonId.
 * Phase 3+: public components will use the Host header; admin will use session.
 */
export const getDefaultSalonId = getAdminSalonId;
