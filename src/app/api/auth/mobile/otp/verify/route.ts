import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { toE164 } from "@/lib/phone";
import { isAdminPhone } from "@/lib/auth/admin";
import { checkOtp } from "@/lib/integrations/verify";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
} from "@/lib/auth/mobileTokens";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponseInit,
} from "@/lib/rateLimit";
import type { OtpVerifyResult } from "@/lib/api-types";

const schema = z.object({
  phone: z.string().min(7).max(32),
  code: z.string().min(4).max(10),
  deviceLabel: z.string().max(64).optional(),
});

const IP_LIMIT = 10;
const PHONE_LIMIT = 5;
const WINDOW_MS = 10 * 60_000;

/**
 * Verifies an OTP and, on success, creates a new MobileSession and returns:
 *   { accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt,
 *     user: { id, role, salonId } }
 *
 * The refresh token is shown only once; only its hash is persisted.
 */
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const ipCheck = checkRateLimit({
    bucket: "mobile-otp:verify:ip",
    key: ip,
    limit: IP_LIMIT,
    windowMs: WINDOW_MS,
  });
  if (!ipCheck.ok) {
    const init = rateLimitResponseInit(ipCheck);
    return NextResponse.json(init.body, { status: 429, headers: init.headers });
  }

  const body = await parseJsonBody(req);
  if (!body.ok) return body.response;
  const parsed = schema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const phone = toE164(parsed.data.phone);
  if (!phone) {
    return NextResponse.json({ error: "Invalid code." }, { status: 401 });
  }

  // Resolve salon from the subdomain — required for host-scoped admin check.
  const slug = req.headers.get("x-salon-slug");
  const salon = slug
    ? await prisma.salon.findUnique({ where: { slug }, select: { id: true } })
    : null;
  if (!salon || !(await isAdminPhone(salon.id, phone))) {
    return NextResponse.json({ error: "Invalid code." }, { status: 401 });
  }

  const phoneCheck = checkRateLimit({
    bucket: "mobile-otp:verify:phone",
    key: phone,
    limit: PHONE_LIMIT,
    windowMs: WINDOW_MS,
  });
  if (!phoneCheck.ok) {
    const init = rateLimitResponseInit(phoneCheck);
    return NextResponse.json(init.body, { status: 429, headers: init.headers });
  }

  const ok = await checkOtp(phone, parsed.data.code);
  if (!ok) {
    return NextResponse.json({ error: "Invalid code." }, { status: 401 });
  }

  // Upsert admin user keyed by phone; set salonId so the token carries it.
  const existing = await prisma.user.findFirst({ where: { phone } });
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { role: "ADMIN", salonId: salon.id },
      })
    : await prisma.user.create({
        data: {
          phone,
          role: "ADMIN",
          salonId: salon.id,
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
    salonId: salon.id,
  });

  return NextResponse.json({
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt.toISOString(),
    accessTokenTtlSeconds: ACCESS_TOKEN_TTL_SECONDS,
    refreshToken,
    refreshTokenExpiresAt: session.expiresAt.toISOString(),
    user: { id: user.id, role: "ADMIN" as const, salonId: salon.id },
  } satisfies OtpVerifyResult);
}
