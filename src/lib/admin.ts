/** Comma-separated list of admin phone numbers in E.164. */
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
