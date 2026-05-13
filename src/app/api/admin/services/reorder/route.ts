import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdminEither } from "@/lib/auth/admin";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
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
  const body = await parseJsonBody(req);
  if (!body.ok) return body.response;
  const parsed = serviceReorderSchema.safeParse(body.data);
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
