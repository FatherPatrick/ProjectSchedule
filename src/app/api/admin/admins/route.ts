import { NextResponse } from "next/server";
import { z } from "zod";
import {
  addAdminPhone,
  listAdminPhones,
  requireAdmin,
} from "@/lib/auth/admin";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { toE164 } from "@/lib/phone";

/**
 * Admin allow-list management endpoints (cookie-session admins only —
 * this is a sensitive management surface, not exposed to the mobile
 * Bearer flow). The GET returns DB-managed entries for the caller's salon.
 */

const addAdminSchema = z.object({
  phone: z.string().min(7).max(32),
});

export async function GET() {
  const session = await requireAdmin();
  if (!session?.user.salonId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admins = await listAdminPhones(session.user.salonId);
  return NextResponse.json({
    admins: admins.map((a) => ({
      phone: a.phone,
      notify: a.notify,
      createdAt: a.createdAt.toISOString(),
      createdById: a.createdById,
    })),
  });
}

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session?.user.salonId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await parseJsonBody(req);
  if (!body.ok) return body.response;
  const parsed = addAdminSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  const phone = toE164(parsed.data.phone);
  if (!phone) {
    return NextResponse.json(
      { error: "Phone must be a valid number." },
      { status: 400 }
    );
  }
  await addAdminPhone(session.user.salonId, phone, session.user.id);
  return NextResponse.json({ ok: true, phone });
}
