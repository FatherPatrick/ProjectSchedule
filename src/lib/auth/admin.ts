/**
 * Admin allow-list + auth helpers (Phase 4).
 *
 * The allow-list lives entirely in the `AdminPhone` table keyed by
 * `(salonId, phone)`. The legacy `ADMIN_PHONES` env bootstrap is removed —
 * the first admin is seeded at signup (Phase 6).
 *
 * Every allow-list function now takes `salonId` as its first argument so
 * a phone is only an admin of the specific salon it was added to.
 */
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { verifyAccessToken } from "@/lib/auth/mobileTokens";
import { toE164 } from "@/lib/phone";

export async function isAdminPhone(
  salonId: string,
  phoneE164: string
): Promise<boolean> {
  const row = await prisma.adminPhone.findUnique({
    where: { salonId_phone: { salonId, phone: phoneE164 } },
    select: { phone: true },
  });
  return Boolean(row);
}

export interface AdminPhoneRow {
  phone: string;
  createdAt: Date;
  createdById: string | null;
  /** Whether this admin receives booking/request SMS alerts. */
  notify: boolean;
}

export async function listAdminPhones(salonId: string): Promise<AdminPhoneRow[]> {
  return prisma.adminPhone.findMany({
    where: { salonId },
    orderBy: { createdAt: "asc" },
    select: { phone: true, createdAt: true, createdById: true, notify: true },
  });
}

/**
 * Enable/disable booking SMS alerts for an admin phone. Upserts a row so the
 * setting works even if the row was created by a different path.
 */
export async function setAdminNotify(
  salonId: string,
  phoneE164: string,
  notify: boolean
): Promise<void> {
  await prisma.adminPhone.upsert({
    where: { salonId_phone: { salonId, phone: phoneE164 } },
    create: { salonId, phone: phoneE164, notify, createdById: null },
    update: { notify },
  });
}

/** Admin phones for this salon that should receive a booking/request SMS. */
export async function getNotifiableAdminPhones(salonId: string): Promise<string[]> {
  const rows = await prisma.adminPhone.findMany({
    where: { salonId, notify: true },
    select: { phone: true },
  });
  return rows.map((r) => r.phone);
}

export async function addAdminPhone(
  salonId: string,
  phoneE164: string,
  addedById: string | null
): Promise<void> {
  await prisma.adminPhone.upsert({
    where: { salonId_phone: { salonId, phone: phoneE164 } },
    create: { salonId, phone: phoneE164, createdById: addedById },
    update: {},
  });
}

/**
 * Removes a phone from the allow-list for this salon.
 * Returns `true` on success, `false` if no row was found.
 */
export async function removeAdminPhone(
  salonId: string,
  phoneE164: string
): Promise<boolean> {
  const result = await prisma.adminPhone.deleteMany({
    where: { salonId, phone: phoneE164 },
  });
  return result.count > 0;
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

/**
 * Returns the current session iff the caller is an authenticated admin.
 * Use in route handlers to return a 401 when not authed.
 */
export async function requireAdmin() {
  const s = await auth();
  if (!s?.user || s.user.role !== "ADMIN") return null;
  return s;
}

/**
 * Throws `Error("Unauthorized")` if the caller is not an authenticated admin.
 * Use in server actions where there is no HTTP response to shape.
 */
export async function assertAdmin() {
  const s = await auth();
  if (!s?.user || s.user.role !== "ADMIN") {
    throw new Error("Unauthorized");
  }
}

/**
 * Validates an `Authorization: Bearer <accessToken>` header issued to the
 * mobile admin app. Returns `{ userId, sessionId, salonId }` on success, or
 * `null` if the header is missing/invalid, the token is expired, the
 * underlying mobile session has been revoked, or the user is no longer admin.
 *
 * Tokens issued before Phase 4 (which lack `salonId`) are rejected so stale
 * sessions force a fresh login that produces a Phase-4-compliant token.
 */
export async function requireAdminFromBearer(
  req: Request
): Promise<{ userId: string; sessionId: string; salonId: string } | null> {
  const header =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return null;
  const payload = verifyAccessToken(m[1]);
  // Reject tokens without salonId (issued before Phase 4).
  if (!payload || payload.role !== "ADMIN" || !payload.salonId) return null;

  const session = await prisma.mobileSession.findUnique({
    where: { id: payload.sid },
    select: { id: true, userId: true, revokedAt: true, expiresAt: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.userId !== payload.sub) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { role: true },
  });
  if (!user || user.role !== "ADMIN") return null;

  return { userId: payload.sub, sessionId: payload.sid, salonId: payload.salonId };
}

/**
 * Authorize an admin request from EITHER a cookie session OR a mobile Bearer
 * token. Returns `true` if either succeeds, `false` otherwise.
 */
export async function requireAdminEither(req: Request): Promise<boolean> {
  if (await requireAdminFromBearer(req)) return true;
  return Boolean(await requireAdmin());
}

/**
 * Returns `{ salonId, userId }` for the authenticated admin, or `null`.
 * Tries mobile Bearer first (no cookie overhead for mobile callers), then
 * falls back to the NextAuth cookie session.
 *
 * Use in admin route handlers instead of `getAdminSalonId()` so both
 * web and mobile admin callers are handled correctly.
 */
export async function requireAdminSalon(
  req: Request
): Promise<{ salonId: string; userId: string } | null> {
  const bearer = await requireAdminFromBearer(req);
  if (bearer) return { salonId: bearer.salonId, userId: bearer.userId };

  const session = await requireAdmin();
  if (!session?.user.salonId) return null;
  return { salonId: session.user.salonId, userId: session.user.id };
}

// ---------------------------------------------------------------------------
// Legacy export — kept so that any remaining callers that haven't been
// migrated to requireAdminSalon still compile. Remove in Phase 7 cleanup.
// ---------------------------------------------------------------------------
/** @deprecated use requireAdminSalon(req) in route handlers */
export const toE164Admin = toE164;
