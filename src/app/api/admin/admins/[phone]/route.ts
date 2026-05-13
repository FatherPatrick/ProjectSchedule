import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ENV_ADMIN_PHONES,
  removeAdminPhone,
  requireAdmin,
} from "@/lib/auth/admin";
import { toE164 } from "@/lib/phone";

/**
 * Revoke an admin phone from the DB allow-list. Path param is the
 * URL-encoded E.164 number (the `+` arrives encoded as `%2B`).
 *
 * Guardrails:
 *   - Cookie-session admin only (no mobile Bearer — this is a sensitive
 *     management action).
 *   - You can't revoke your own phone (last-admin lockout protection
 *     would require a join against the User table that's out of scope
 *     here; refusing self-removal is the cheap version of that).
 *   - Env-managed phones (from `ADMIN_PHONES`) can't be removed via
 *     this endpoint — they live in the deployment config, not the DB.
 *     Returns 409 in that case so the UI can show a useful message.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ phone: string }> }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { phone: raw } = await params;
  const phone = toE164(decodeURIComponent(raw));
  if (!phone) {
    return NextResponse.json(
      { error: "Phone must be a valid number." },
      { status: 400 }
    );
  }
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { phone: true },
  });
  if (me?.phone === phone) {
    return NextResponse.json(
      { error: "You can't remove your own admin access." },
      { status: 409 }
    );
  }
  if (ENV_ADMIN_PHONES.has(phone)) {
    return NextResponse.json(
      {
        error:
          "This phone is managed via the ADMIN_PHONES env var and can't be removed here.",
      },
      { status: 409 }
    );
  }
  const removed = await removeAdminPhone(phone);
  if (!removed) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
