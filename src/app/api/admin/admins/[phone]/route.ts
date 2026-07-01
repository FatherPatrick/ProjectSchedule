import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  removeAdminPhone,
  requireAdmin,
} from "@/lib/auth/admin";
import { toE164 } from "@/lib/phone";

/**
 * Revoke an admin phone from the DB allow-list for this salon.
 * Path param is the URL-encoded E.164 number (the `+` arrives as `%2B`).
 *
 * Guardrails:
 *   - Cookie-session admin only (sensitive management action).
 *   - Cannot revoke your own phone (last-admin lockout protection).
 *   - Scoped to the caller's salon — cannot revoke a phone from another salon.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ phone: string }> }
) {
  const session = await requireAdmin();
  if (!session?.user.salonId) {
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
  const removed = await removeAdminPhone(session.user.salonId, phone);
  if (!removed) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
