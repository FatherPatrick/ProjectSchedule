import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { findClientIdByEmail } from "@/lib/domain/clients";
import { verifyTurnstileToken } from "@/lib/integrations/captcha";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponseInit,
} from "@/lib/rateLimit";
import { waitlistJoinSchema } from "@/lib/validation/waitlist";
import { getSettings } from "@/lib/domain/settings";
import { getPublicSalon } from "@/lib/domain/salon";
import { joinWaitlist } from "@/lib/domain/waitlist";
import type { WaitlistJoinResponse } from "@/lib/api-types";

const WAITLIST_IP_LIMIT = 5;
const WAITLIST_WINDOW_MS = 10 * 60_000;

export async function POST(req: Request) {
  const result = await getPublicSalon(req);
  if (!result.ok) return result.response;
  const { salon } = result;

  const settings = await getSettings(salon.id);
  if (!settings.waitlistEnabled) {
    return NextResponse.json(
      { error: "The waitlist isn't open right now." },
      { status: 404 }
    );
  }

  const ip = getClientIp(req);
  const ipCheck = checkRateLimit({
    bucket: "waitlist:join:ip",
    key: ip,
    limit: WAITLIST_IP_LIMIT,
    windowMs: WAITLIST_WINDOW_MS,
  });
  if (!ipCheck.ok) {
    const init = rateLimitResponseInit(ipCheck);
    return NextResponse.json(init.body, { status: 429, headers: init.headers });
  }

  const body = await parseJsonBody(req);
  if (!body.ok) return body.response;
  const raw = body.data;

  const captchaToken =
    typeof raw === "object" && raw !== null && "captchaToken" in raw
      ? (raw as { captchaToken?: unknown }).captchaToken
      : undefined;
  const captcha = await verifyTurnstileToken(
    typeof captchaToken === "string" ? captchaToken : undefined,
    ip
  );
  if (!captcha.ok) {
    return NextResponse.json({ error: captcha.error }, { status: 400 });
  }

  const parsed = waitlistJoinSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const data = parsed.data;

  const service = await prisma.service.findUnique({
    where: { id: data.serviceId },
  });
  if (!service || !service.active || service.salonId !== salon.id) {
    return NextResponse.json({ error: "Service not found." }, { status: 404 });
  }

  const email = data.email?.trim().toLowerCase() ?? "";
  const existingId = email ? await findClientIdByEmail(salon.id, email) : null;
  const client = await prisma.client.upsert({
    where: { id: existingId ?? "__nope__" },
    create: {
      salonId: salon.id,
      name: data.name,
      email,
      phone: data.phone,
      smsOptIn: data.smsOptIn,
      emailOptIn: Boolean(email),
    },
    update: {
      name: data.name,
      phone: data.phone,
      smsOptIn: data.smsOptIn,
    },
  });

  await joinWaitlist(salon.id, service.id, client.id);

  return NextResponse.json({ ok: true } satisfies WaitlistJoinResponse);
}
