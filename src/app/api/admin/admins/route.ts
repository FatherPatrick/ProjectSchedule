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
 * Admin-allow-list management endpoints (cookie-session admins only —
 * we deliberately don't expose this to the mobile Bearer flow). The
 * GET returns the union of DB-managed entries and env-bootstrap
 * entries; only DB entries are deletable via the [phone] DELETE route.
 */

const addAdminSchema = z.object({
  phone: z.string().min(7).max(32),
});

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admins = await listAdminPhones();
  return NextResponse.json({
    admins: admins.map((a) => ({
      phone: a.phone,
      source: a.source,
      // The env-source sentinel `new Date(0)` is dropped client-side; we
      // still emit a real ISO so the JSON shape stays uniform.
      createdAt: a.createdAt.toISOString(),
      createdById: a.createdById,
    })),
  });
}

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) {
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
  await addAdminPhone(phone, session.user.id);
  return NextResponse.json({ ok: true, phone });
}
