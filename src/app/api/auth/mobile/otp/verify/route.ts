import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { toE164 } from "@/lib/phone";
import { isAdminPhone } from "@/lib/admin";
import { checkOtp } from "@/lib/integrations/verify";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
} from "@/lib/auth/mobileTokens";

const schema = z.object({
  phone: z.string().min(7).max(32),
  code: z.string().min(4).max(10),
  deviceLabel: z.string().max(64).optional(),
});

/**
 * Verifies an OTP and, on success, creates a new MobileSession and returns:
 *   { accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt,
 *     user: { id, role } }
 *
 * The refresh token is shown only once; only its hash is persisted.
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

  const phone = toE164(parsed.data.phone);
  if (!phone || !isAdminPhone(phone)) {
    // Same generic 401 whether non-admin or wrong code.
    return NextResponse.json({ error: "Invalid code." }, { status: 401 });
  }

  const ok = await checkOtp(phone, parsed.data.code);
  if (!ok) {
    return NextResponse.json({ error: "Invalid code." }, { status: 401 });
  }

  // Upsert admin user keyed by phone (mirrors src/auth.ts).
  const existing = await prisma.user.findFirst({ where: { phone } });
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { role: "ADMIN" },
      })
    : await prisma.user.create({
        data: {
          phone,
          role: "ADMIN",
          email: `${phone.replace(/\D/g, "")}@phone.local`,
        },
      });

  const refreshToken = generateRefreshToken();
  const session = await prisma.mobileSession.create({
    data: {
      userId: user.id,
      refreshHash: hashRefreshToken(refreshToken),
      deviceLabel: parsed.data.deviceLabel ?? null,
      expiresAt: refreshTokenExpiry(),
    },
  });

  // Cap the number of live sessions per admin to bound the blast-radius of
  // a leaked refresh token. Revoke oldest non-revoked sessions beyond the cap.
  const MAX_LIVE_SESSIONS = 10;
  const live = await prisma.mobileSession.findMany({
    where: { userId: user.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (live.length > MAX_LIVE_SESSIONS) {
    const toRevoke = live.slice(MAX_LIVE_SESSIONS).map((s) => s.id);
    await prisma.mobileSession.updateMany({
      where: { id: { in: toRevoke } },
      data: { revokedAt: new Date() },
    });
  }

  const access = signAccessToken({
    userId: user.id,
    sessionId: session.id,
    role: "ADMIN",
  });

  return NextResponse.json({
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt.toISOString(),
    accessTokenTtlSeconds: ACCESS_TOKEN_TTL_SECONDS,
    refreshToken,
    refreshTokenExpiresAt: session.expiresAt.toISOString(),
    user: { id: user.id, role: "ADMIN" as const },
  });
}
