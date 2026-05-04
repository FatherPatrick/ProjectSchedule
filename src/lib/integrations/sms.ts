import twilio from "twilio";

const sid = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;
const from = process.env.TWILIO_FROM_NUMBER;
// Preferred for A2P 10DLC: Messaging Service SID. If set, overrides `from`.
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

export const twilioClient = sid && token ? twilio(sid, token) : null;

export interface SendSMSArgs {
  to: string;
  body: string;
}

export async function sendSMS(args: SendSMSArgs) {
  if (!twilioClient || (!from && !messagingServiceSid)) {
    console.warn("[sms] Twilio not configured — skipping send", args.to);
    return { sid: null as string | null, skipped: true as const };
  }
  const msg = await twilioClient.messages.create({
    ...(messagingServiceSid
      ? { messagingServiceSid }
      : { from: from as string }),
    to: args.to,
    body: args.body,
  });
  return { sid: msg.sid, skipped: false as const };
}

/** Append the legally required STOP/HELP footer to outbound SMS. */
export function withSmsFooter(body: string) {
  return `${body}\n\nReply STOP to opt out. HELP for help. Msg & data rates may apply.`;
}
