import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { withAdmin } from "@/lib/http/withAdmin";
import { reportError } from "@/lib/observability/reportError";

export const DELETE = withAdmin(
  async (_req, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    try {
      await prisma.blackout.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    } catch (err) {
      // Prisma maps "record to delete does not exist" to P2025. That is a
      // legitimate 404 (the row was already gone, e.g. a double-click), not
      // a server fault — and shouldn't be reported.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      reportError(err, { where: "admin.blackouts.delete", blackoutId: id });
      return NextResponse.json(
        { error: "Could not remove blackout." },
        { status: 500 }
      );
    }
  }
);
