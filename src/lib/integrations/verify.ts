import { twilioClient } from "./sms";

const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
const isProd = process.env.NODE_ENV === "production";

/**
 * The dev bypass code. When NODE_ENV !== "production", entering this code
 * always succeeds (Twilio Verify is not called) — useful for local dev and
 * for previewing without burning Verify quota.
 */
export const DEV_BYPASS_CODE = "000000";

/**
 * Send a one-time code via SMS. Throws on transport errors.
 *
 * In dev the real Twilio Verify call is skipped (use {@link DEV_BYPASS_CODE})
 * unless `opts.forceReal` is set — the sign-in form's "send a real text" dev
 * toggle uses this to exercise the actual Verify path against a real handset.
 * The bypass code still works in dev regardless.
 */
export async function sendOtp(
  phoneE164: string,
  opts?: { forceReal?: boolean }
): Promise<{ skipped: boolean }> {
  if (!isProd && !opts?.forceReal) {
    console.log(
      `[verify:dev] Pretending to send OTP to ${phoneE164}. Use code ${DEV_BYPASS_CODE}.`
    );
    return { skipped: true };
  }
  if (!twilioClient || !verifyServiceSid) {
    throw new Error(
      "Twilio Verify not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_VERIFY_SERVICE_SID."
    );
  }
  await twilioClient.verify.v2
    .services(verifyServiceSid)
    .verifications.create({ to: phoneE164, channel: "sms" });
  return { skipped: false };
}

/** Verify a one-time code. Returns true iff the code is valid + unused. */
export async function checkOtp(phoneE164: string, code: string): Promise<boolean> {
  if (!isProd && code === DEV_BYPASS_CODE) return true;
  if (!twilioClient || !verifyServiceSid) return false;
  try {
    const r = await twilioClient.verify.v2
      .services(verifyServiceSid)
      .verificationChecks.create({ to: phoneE164, code });
    return r.status === "approved";
  } catch (err) {
    console.warn("[verify] check failed", err);
    return false;
  }
}
