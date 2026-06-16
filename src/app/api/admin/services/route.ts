import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { withAdmin, withAdminJson } from "@/lib/http/withAdmin";
import { serviceJsonCreateSchema } from "@/lib/validation/adminJson";
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
  const { sortOrder, ...rest } = input;
  const data: Prisma.ServiceCreateInput = {
    ...rest,
    sortOrder: sortOrder ?? 0,
  };
  const created = await prisma.service.create({ data });
  return NextResponse.json(
    { data: { id: created.id } } satisfies ServiceCreateResponse,
    { status: 201 }
  );
});
