import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withAdmin } from "@/lib/http/withAdmin";
import type { ClientSearchResponse } from "@/lib/api-types";

/**
 * Typeahead search for the admin "book for a client" picker. Matches `q`
 * against client name / email / phone (case-insensitive), most-recently-active
 * first. Returns at most 10 rows. An empty query yields an empty list.
 */
const MAX_ROWS = 10;

export const GET = withAdmin(async (req) => {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 1) {
    return NextResponse.json({ data: [] } satisfies ClientSearchResponse);
  }

  const rows = await prisma.client.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: MAX_ROWS,
    select: { id: true, name: true, email: true, phone: true },
  });

  return NextResponse.json({ data: rows } satisfies ClientSearchResponse);
});
