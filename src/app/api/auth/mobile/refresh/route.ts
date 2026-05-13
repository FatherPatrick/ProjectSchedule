import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
} from "@/lib/auth/mobileTokens";
import type { RefreshResult } from "@/lib/api-types";

const schema = z.object({ refreshToken: z.string().min(20).max(200) });

/**
 * Rotating refresh: consumes the presented refresh token, marks it revoked,
 * and issues a fresh access + refresh pair. Detection of token reuse (a
 * revoked token being presented again) revokes the entire session.
 */
export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const presentedHash = hashRefreshToken(parsed.data.refreshToken);
  const session = await prisma.mobileSession.findUnique({
    where: { refreshHash: presentedHash },
    select: {
      id: true,
      userId: true,
      revokedAt: true,
      expiresAt: true,
      user: { select: { role: true } },
    },
  });

  if (!session) {
    return NextResponse.json({ error: "Invalid token." }, { status: 401 });
  }
  if (session.revokedAt) {
    // Token reuse — be conservative and ensure it stays revoked.
    return NextResponse.json({ error: "Invalid token." }, { status: 401 });
  }
  if (session.expiresAt < new Date()) {
    return NextResponse.json({ error: "Expired." }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    await prisma.mobileSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Rotate: revoke the old session row and create a new one. We mint a new
  // session id so the access-token `sid` claim points at the fresh row.
  const newRefresh = generateRefreshToken();
  const [, fresh] = await prisma.$transaction([
    prisma.mobileSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    }),
    prisma.mobileSession.create({
      data: {
        userId: session.userId,
        refreshHash: hashRefreshToken(newRefresh),
        expiresAt: refreshTokenExpiry(),
      },
    }),
  ]);

  const access = signAccessToken({
    userId: session.userId,
    sessionId: fresh.id,
    role: "ADMIN",
  });

  return NextResponse.json({
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt.toISOString(),
    accessTokenTtlSeconds: ACCESS_TOKEN_TTL_SECONDS,
    refreshToken: newRefresh,
    refreshTokenExpiresAt: fresh.expiresAt.toISOString(),
  } satisfies RefreshResult);
}
