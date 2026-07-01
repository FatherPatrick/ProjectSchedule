import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { toE164 } from "@/lib/phone";
import { checkOtp } from "@/lib/integrations/verify";
import { reportError } from "@/lib/observability/reportError";
import { DEFAULT_BUSINESS_HOURS } from "@/lib/config";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponseInit,
} from "@/lib/rateLimit";
import { validateSlug } from "../request/route";

const schema = z.object({
  salonName: z.string().min(1).max(100).trim(),
  slug: z.string().min(1).max(60),
  phone: z.string().min(7).max(32),
  otp: z.string().length(6),
});

const IP_LIMIT = 10;
const WINDOW_MS = 10 * 60_000;

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const ipCheck = checkRateLimit({
    bucket: "signup:verify:ip",
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
  const { salonName, slug, phone, otp } = parsed.data;

  const slugError = validateSlug(slug);
  if (slugError) {
    return NextResponse.json({ error: slugError }, { status: 400 });
  }

  const e164 = toE164(phone);
  if (!e164) {
    return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
  }

  // Per-phone rate limit to prevent OTP brute-force.
  const phoneCheck = checkRateLimit({
    bucket: "signup:verify:phone",
    key: e164,
    limit: 5,
    windowMs: WINDOW_MS,
  });
  if (!phoneCheck.ok) {
    const init = rateLimitResponseInit(phoneCheck);
    return NextResponse.json(init.body, { status: 429, headers: init.headers });
  }

  const valid = await checkOtp(e164, otp);
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid or expired code. Try requesting a new one." },
      { status: 400 }
    );
  }

  // Re-check slug availability (race condition: someone else may have taken it).
  const existingSlug = await prisma.salon.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (existingSlug) {
    return NextResponse.json(
      { error: "That URL was just taken. Please go back and choose a different one." },
      { status: 409 }
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      const salon = await tx.salon.create({
        data: { name: salonName.trim(), slug, status: "ACTIVE" },
      });

      await tx.setting.create({
        data: {
          id: salon.id,
          salonId: salon.id,
          slotGranularityMin: 15,
          maxAdvanceDays: 30,
        },
      });

      await tx.businessHours.createMany({
        data: DEFAULT_BUSINESS_HOURS.map((h) => ({
          salonId: salon.id,
          dayOfWeek: h.dayOfWeek,
          openMin: h.openMin,
          closeMin: h.closeMin,
          active: h.active,
        })),
      });

      await tx.adminPhone.create({
        data: { salonId: salon.id, phone: e164 },
      });
    });
  } catch (err) {
    reportError(err, { where: "signup.verify.create", slug });
    return NextResponse.json(
      { error: "Could not create your salon. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, slug });
}
