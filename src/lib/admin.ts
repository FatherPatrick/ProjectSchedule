/** Comma-separated list of admin phone numbers in E.164. */
import { auth } from "@/auth";
import { toE164 } from "./phone";

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
