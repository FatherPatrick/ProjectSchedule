import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdminEither } from "@/lib/auth/admin";
import { serviceReorderSchema } from "@/lib/validation/adminJson";

/**
 * Persist a new ordering of services. Body: `{ ids: string[] }`. The order in
 * which ids appear becomes their `sortOrder` (0-based). Ids missing from the
 * payload are not modified.
 */
export async function POST(req: Request) {
  if (!(await requireAdminEither(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = serviceReorderSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  await prisma.$transaction(
    parsed.data.ids.map((id, sortOrder) =>
      prisma.service.update({ where: { id }, data: { sortOrder } })
    )
  );
  return NextResponse.json({ ok: true });
}
