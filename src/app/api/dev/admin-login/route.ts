import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

// Dev-only: skip the magic-link email entirely and create an admin session.
// Refuses to run in production builds.
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (adminEmails.length === 0) {
    return NextResponse.json(
      { error: "Set ADMIN_EMAILS in .env first." },
      { status: 400 }
    );
  }

  const url = new URL(req.url);
  const requested = (url.searchParams.get("email") ?? adminEmails[0]).toLowerCase();
  const email = adminEmails.includes(requested) ? requested : adminEmails[0];

  const user = await prisma.user.upsert({
    where: { email },
    update: { role: "ADMIN", emailVerified: new Date() },
    create: { email, role: "ADMIN", emailVerified: new Date() },
  });

  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: { userId: user.id, sessionToken, expires },
  });

  const cookieStore = await cookies();
  cookieStore.set({
    name: "authjs.session-token",
    value: sessionToken,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires,
    secure: false, // dev only
  });

  const callback = url.searchParams.get("callbackUrl") ?? "/admin";
  return NextResponse.redirect(new URL(callback, url.origin));
}

export const GET = POST;
