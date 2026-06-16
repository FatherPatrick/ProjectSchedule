import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withAdminJson } from "@/lib/http/withAdmin";
import { serviceReorderSchema } from "@/lib/validation/adminJson";

/**
 * Persist a new ordering of services. Body: `{ ids: string[] }`. The order in
 * which ids appear becomes their `sortOrder` (0-based). Ids missing from the
 * payload are not modified.
 */
export const POST = withAdminJson(serviceReorderSchema, async (data) => {
  await prisma.$transaction(
    data.ids.map((id, sortOrder) =>
      prisma.service.update({ where: { id }, data: { sortOrder } })
    )
  );
  return NextResponse.json({ ok: true });
});
