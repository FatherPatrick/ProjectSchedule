import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdminFromBearer } from "@/lib/auth/admin";
import { pushRegisterSchema } from "@/lib/validation/adminJson";

/**
 * Stores an Expo push token on the caller's `MobileSession`. Bearer-only
 * (cookie sessions don't have a sessionId to attach the token to).
 */
export async function POST(req: Request) {
  const session = await requireAdminFromBearer(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = pushRegisterSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  await prisma.mobileSession.update({
    where: { id: session.sessionId },
    data: {
      pushToken: parsed.data.pushToken,
      deviceLabel: parsed.data.platform,
    },
  });
  return NextResponse.json({ ok: true });
}
