import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withAdmin, withAdminJson } from "@/lib/http/withAdmin";
import { serviceJsonCreateSchema } from "@/lib/validation/adminJson";
import { createServiceForSingleSalon } from "@/lib/domain/services";
import type {
  ServiceCreateResponse,
  ServicesListResponse,
} from "@/lib/api-types";

export const GET = withAdmin(async (req) => {
  const url = new URL(req.url);
  const includeInactive = url.searchParams.get("includeInactive") !== "false";

  const rows = await prisma.service.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({
    data: rows.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      durationMinutes: s.durationMinutes,
      priceCents: s.priceCents,
      active: s.active,
      sortOrder: s.sortOrder,
    })),
  } satisfies ServicesListResponse);
});

export const POST = withAdminJson(serviceJsonCreateSchema, async (input) => {
  const id = await createServiceForSingleSalon(input);
  return NextResponse.json(
    { data: { id } } satisfies ServiceCreateResponse,
    { status: 201 }
  );
});
