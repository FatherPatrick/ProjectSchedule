import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { toE164 } from "@/lib/phone";
import { sendOtp } from "@/lib/integrations/verify";
import { verifyTurnstileToken } from "@/lib/integrations/captcha";
import { reportError } from "@/lib/observability/reportError";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponseInit,
} from "@/lib/rateLimit";

// Keep in sync with proxy.ts RESERVED_SLUGS and the client-side validator.
export const RESERVED_SLUGS = new Set([
  "www", "app", "api", "admin", "signup", "assets",
  "help", "support", "blog", "status", "mail",
]);

export const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

export function validateSlug(slug: string): string | null {
  if (slug.length < 3) return "URL must be at least 3 characters.";
  if (slug.length > 50) return "URL must be 50 characters or fewer.";
  if (!SLUG_RE.test(slug)) {
    return "URL may only contain lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen.";
  }
  if (RESERVED_SLUGS.has(slug)) return "That URL is reserved. Please choose a different one.";
  return null;
}

const schema = z.object({
  salonName: z.string().min(1).max(100).trim(),
  slug: z.string().min(1).max(60),
  phone: z.string().min(7).max(32),
  captchaToken: z.string().optional(),
});

const IP_LIMIT = 5;
const WINDOW_MS = 10 * 60_000;

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const ipCheck = checkRateLimit({
    bucket: "signup:request:ip",
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
  const { salonName, slug, phone, captchaToken } = parsed.data;

  const captcha = await verifyTurnstileToken(captchaToken, ip);
  if (!captcha.ok) {
    return NextResponse.json({ error: captcha.error }, { status: 400 });
  }

  const slugError = validateSlug(slug);
  if (slugError) {
    return NextResponse.json({ error: slugError }, { status: 400 });
  }

  if (!salonName.trim()) {
    return NextResponse.json({ error: "Salon name is required." }, { status: 400 });
  }

  const e164 = toE164(phone);
  if (!e164) {
    return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
  }

  // Check slug availability.
  const existing = await prisma.salon.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "That URL is already taken. Please choose a different one." },
      { status: 409 }
    );
  }

  try {
    await sendOtp(e164);
  } catch (err) {
    reportError(err, { where: "signup.request.sendOtp", phone: e164 });
    return NextResponse.json(
      { error: "Could not send code. Try again shortly." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
