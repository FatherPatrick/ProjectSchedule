import twilio from "twilio";

const sid = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;
const from = process.env.TWILIO_FROM_NUMBER;

const client = sid && token ? twilio(sid, token) : null;

export interface SendSMSArgs {
  to: string;
  body: string;
}

export async function sendSMS(args: SendSMSArgs) {
  if (!client || !from) {
    console.warn("[sms] Twilio not configured — skipping send", args.to);
    return { sid: null as string | null, skipped: true as const };
  }
  const msg = await client.messages.create({
    from,
    to: args.to,
    body: args.body,
  });
  return { sid: msg.sid, skipped: false as const };
}

/** Append the legally required STOP/HELP footer to outbound SMS. */
export function withSmsFooter(body: string) {
  return `${body}\n\nReply STOP to opt out. HELP for help. Msg & data rates may apply.`;
}
