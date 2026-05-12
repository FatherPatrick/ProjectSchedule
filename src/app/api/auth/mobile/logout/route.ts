import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { hashRefreshToken } from "@/lib/auth/mobileTokens";

const schema = z.object({ refreshToken: z.string().min(20).max(200) });

/**
 * Revokes the mobile session backing a refresh token. Always returns
 * `{ ok: true }` so clients can call this fire-and-forget on sign-out.
 */
export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: true });

  await prisma.mobileSession.updateMany({
    where: {
      refreshHash: hashRefreshToken(parsed.data.refreshToken),
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
