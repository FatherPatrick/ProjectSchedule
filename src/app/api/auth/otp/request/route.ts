import { NextResponse } from "next/server";
import { z } from "zod";
import { toE164 } from "@/lib/phone";
import { isAdminPhone } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { sendOtp } from "@/lib/integrations/verify";
import { reportError } from "@/lib/observability/reportError";
import { logger } from "@/lib/observability/logger";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponseInit,
} from "@/lib/rateLimit";

const schema = z.object({
  phone: z.string().min(7).max(32),
  // Dev-only: opt into a real Twilio Verify send instead of the bypass code.
  // Honored only when NODE_ENV !== "production" (see below).
  devRealSend: z.boolean().optional(),
});

// Twilio Verify costs real money per send. Keep this strict.
const IP_LIMIT = 5;
const PHONE_LIMIT = 3;
const WINDOW_MS = 10 * 60_000;

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const ipCheck = checkRateLimit({
    bucket: "otp:request:ip",
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
  const e164 = toE164(parsed.data.phone);
  if (!e164) {
    return NextResponse.json(
      { error: "Enter a valid phone number." },
      { status: 400 }
    );
  }

  const phoneCheck = checkRateLimit({
    bucket: "otp:request:phone",
    key: e164,
    limit: PHONE_LIMIT,
    windowMs: WINDOW_MS,
  });
  if (!phoneCheck.ok) {
    const init = rateLimitResponseInit(phoneCheck);
    return NextResponse.json(init.body, { status: 429, headers: init.headers });
  }

  // Resolve the salon from the x-salon-slug header set by the proxy.
  const slug = req.headers.get("x-salon-slug");
  const salon = slug
    ? await prisma.salon.findUnique({ where: { slug }, select: { id: true } })
    : null;

  // Don't reveal whether a phone is admin or not — always pretend success.
  // Only actually send if it's an allow-listed admin phone for this salon.
  if (salon && (await isAdminPhone(salon.id, e164))) {
    const forceReal =
      process.env.NODE_ENV !== "production" && parsed.data.devRealSend === true;
    try {
      await sendOtp(e164, { forceReal });
    } catch (err) {
      reportError(err, { where: "otp.request.send", phone: e164 });
      return NextResponse.json(
        { error: "Could not send code. Try again shortly." },
        { status: 500 }
      );
    }
  } else {
    logger.warn("[otp] request for non-admin phone or unknown salon", {
      phone: e164,
      slug,
    });
  }

  return NextResponse.json({ ok: true });
}
