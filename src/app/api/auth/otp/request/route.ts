import { NextResponse } from "next/server";
import { z } from "zod";
import { toE164 } from "@/lib/phone";
import { isAdminPhone } from "@/lib/auth/admin";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { sendOtp } from "@/lib/integrations/verify";
import { reportError } from "@/lib/observability/reportError";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponseInit,
} from "@/lib/rateLimit";

const schema = z.object({ phone: z.string().min(7).max(32) });

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

  // Don't reveal whether a phone is admin or not — always pretend success.
  // Only actually send if it's an allow-listed admin phone.
  if (await isAdminPhone(e164)) {
    try {
      await sendOtp(e164);
    } catch (err) {
      reportError(err, { where: "otp.request.send", phone: e164 });
      return NextResponse.json(
        { error: "Could not send code. Try again shortly." },
        { status: 500 }
      );
    }
  } else {
    console.warn("[otp] request for non-admin phone", e164);
  }

  return NextResponse.json({ ok: true });
}
