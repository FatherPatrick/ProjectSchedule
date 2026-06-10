/**
 * Admin allow-list + auth helpers.
 *
 * The allow-list now lives in the `AdminPhone` table (DB) so admins can
 * be added / removed at runtime via the admin UI. The legacy
 * `ADMIN_PHONES` env var is kept as a *bootstrap* fallback so:
 *
 *   - existing deployments keep working without a data backfill, and
 *   - a fresh deploy with an empty `AdminPhone` table can still produce
 *     its first admin (the env entry signs in, then can invite others
 *     into the DB list, then the env can be cleared).
 *
 * `isAdminPhone` is async; it does one indexed PK lookup per call. The
 * env fallback is consulted only when the DB lookup misses.
 */
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { verifyAccessToken } from "@/lib/auth/mobileTokens";
import { toE164 } from "@/lib/phone";

/** Phones inherited from the `ADMIN_PHONES` env var, normalised to E.164. */
export const ENV_ADMIN_PHONES: ReadonlySet<string> = new Set(
  (process.env.ADMIN_PHONES ?? "")
    .split(",")
    .map((s) => toE164(s.trim()))
    .filter((v): v is string => Boolean(v))
);

export async function isAdminPhone(phoneE164: string): Promise<boolean> {
  const row = await prisma.adminPhone.findUnique({
    where: { phone: phoneE164 },
    select: { phone: true },
  });
  if (row) return true;
  return ENV_ADMIN_PHONES.has(phoneE164);
}

export interface AdminPhoneRow {
  phone: string;
  createdAt: Date;
  createdById: string | null;
  /** Whether this admin receives booking/request SMS alerts. */
  notify: boolean;
  /** "db" = managed via the AdminPhone table; "env" = legacy bootstrap. */
  source: "db" | "env";
}

/**
 * Returns the union of DB-managed admin phones and any env-bootstrap phones.
 * A phone present in `ADMIN_PHONES` is always reported as `source: "env"`
 * (non-removable) even when a DB row exists to carry its `notify` setting.
 */
export async function listAdminPhones(): Promise<AdminPhoneRow[]> {
  const dbRows = await prisma.adminPhone.findMany({
    orderBy: { createdAt: "asc" },
    select: { phone: true, createdAt: true, createdById: true, notify: true },
  });
  const dbPhones = new Set(dbRows.map((r) => r.phone));

  const rows: AdminPhoneRow[] = dbRows.map((r) => ({
    phone: r.phone,
    createdAt: r.createdAt,
    createdById: r.createdById,
    notify: r.notify,
    source: ENV_ADMIN_PHONES.has(r.phone) ? "env" : "db",
  }));

  // Env phones that don't yet have a DB settings row — default notify=on.
  for (const phone of ENV_ADMIN_PHONES) {
    if (dbPhones.has(phone)) continue;
    rows.push({
      phone,
      createdAt: new Date(0),
      createdById: null,
      notify: true,
      source: "env",
    });
  }
  return rows;
}

/**
 * Enable/disable booking SMS alerts for an admin phone. Upserts a row so the
 * flag also works for env-bootstrap phones that have no DB row yet (the row is
 * created purely to carry the setting; it stays env-managed).
 */
export async function setAdminNotify(
  phoneE164: string,
  notify: boolean
): Promise<void> {
  await prisma.adminPhone.upsert({
    where: { phone: phoneE164 },
    create: { phone: phoneE164, notify, createdById: null },
    update: { notify },
  });
}

/**
 * Admin phones that should receive a booking/request SMS — every admin whose
 * `notify` flag isn't false. Env phones without a row default to on.
 */
export async function getNotifiableAdminPhones(): Promise<string[]> {
  const rows = await listAdminPhones();
  return rows.filter((r) => r.notify).map((r) => r.phone);
}

export async function addAdminPhone(
  phoneE164: string,
  addedById: string | null
): Promise<void> {
  // Idempotent: re-inviting an existing admin is a no-op rather than an
  // error so the UI doesn't have to special-case the race.
  await prisma.adminPhone.upsert({
    where: { phone: phoneE164 },
    create: { phone: phoneE164, createdById: addedById },
    update: {},
  });
}

/**
 * Removes a phone from the DB allow-list. Returns `true` on success,
 * `false` if no row was deleted (already absent). Env entries cannot be
 * removed via this helper — they're tied to the deployment env.
 */
export async function removeAdminPhone(phoneE164: string): Promise<boolean> {
  const result = await prisma.adminPhone.deleteMany({
    where: { phone: phoneE164 },
  });
  return result.count > 0;
}

/**
 * Returns the current session iff the caller is an authenticated admin,
 * otherwise `null`. Use this in route handlers so you can return a 401.
 */
export async function requireAdmin() {
  const s = await auth();
  if (!s?.user || s.user.role !== "ADMIN") return null;
  return s;
}

/**
 * Throws `Error("Unauthorized")` if the caller is not an authenticated admin.
 * Use this in server actions where there's no HTTP response to shape.
 */
export async function assertAdmin() {
  const s = await auth();
  if (!s?.user || s.user.role !== "ADMIN") {
    throw new Error("Unauthorized");
  }
}

/**
 * Validates an `Authorization: Bearer <accessToken>` header issued to the
 * mobile admin app. Returns `{ userId, sessionId }` on success, or `null` if
 * the header is missing/invalid, the token is expired, the underlying mobile
 * session has been revoked, or the user is no longer an admin.
 *
 * Use in route handlers that mobile clients call (return 401 on null).
 */
export async function requireAdminFromBearer(
  req: Request
): Promise<{ userId: string; sessionId: string } | null> {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return null;
  const payload = verifyAccessToken(m[1]);
  if (!payload || payload.role !== "ADMIN") return null;

  // Cheap freshness check: the mobile session must still exist and not be
  // revoked. This costs one indexed lookup per request, which is acceptable
  // and gives us instant logout on revoke.
  const session = await prisma.mobileSession.findUnique({
    where: { id: payload.sid },
    select: { id: true, userId: true, revokedAt: true, expiresAt: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.userId !== payload.sub) return null;

  // Confirm the user is still an admin (cheap; no joins).
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { role: true },
  });
  if (!user || user.role !== "ADMIN") return null;

  return { userId: payload.sub, sessionId: payload.sid };
}

/**
 * Authorize an admin request from EITHER the existing cookie session OR a
 * mobile Bearer token. Returns `true` if either succeeds, `false` otherwise.
 *
 * Use in `/api/admin/*` route handlers that should serve both the web admin
 * UI and the mobile admin app:
 *
 * ```ts
 * if (!(await requireAdminEither(req))) {
 *   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 * }
 * ```
 */
export async function requireAdminEither(req: Request): Promise<boolean> {
  // Bearer first — it's a single signature check + two indexed lookups, and
  // avoids touching NextAuth's cookie machinery for mobile-only callers.
  if (await requireAdminFromBearer(req)) return true;
  return Boolean(await requireAdmin());
}
