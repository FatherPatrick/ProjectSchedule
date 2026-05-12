/** Comma-separated list of admin phone numbers in E.164. */
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { verifyAccessToken } from "@/lib/auth/mobileTokens";
import { toE164 } from "@/lib/phone";

export const ADMIN_PHONES: ReadonlySet<string> = new Set(
  (process.env.ADMIN_PHONES ?? "")
    .split(",")
    .map((s) => toE164(s.trim()))
    .filter((v): v is string => Boolean(v))
);

export function isAdminPhone(phoneE164: string): boolean {
  return ADMIN_PHONES.has(phoneE164);
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
