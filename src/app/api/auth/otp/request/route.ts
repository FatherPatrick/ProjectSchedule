import { NextResponse } from "next/server";
import { z } from "zod";
import { toE164 } from "@/lib/phone";
import { isAdminPhone } from "@/lib/admin";
import { sendOtp } from "@/lib/integrations/verify";

const schema = z.object({ phone: z.string().min(7).max(32) });

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
  const e164 = toE164(parsed.data.phone);
  if (!e164) {
    return NextResponse.json(
      { error: "Enter a valid phone number." },
      { status: 400 }
    );
  }

  // Don't reveal whether a phone is admin or not — always pretend success.
  // Only actually send if it's an allow-listed admin phone.
  if (isAdminPhone(e164)) {
    try {
      await sendOtp(e164);
    } catch (err) {
      console.error("[otp] send failed", err);
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
