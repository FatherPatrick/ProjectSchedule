import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
export const resend = apiKey ? new Resend(apiKey) : null;

export const EMAIL_FROM =
  process.env.EMAIL_FROM ?? "Polished Nail Studio <onboarding@resend.dev>";

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(args: SendEmailArgs) {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping send", args.subject);
    return { id: null, skipped: true as const };
  }
  const res = await resend.emails.send({
    from: EMAIL_FROM,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
  });
  if (res.error) throw new Error(res.error.message);
  return { id: res.data?.id ?? null, skipped: false as const };
}
