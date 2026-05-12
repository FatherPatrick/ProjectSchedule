import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db/prisma";
import { toE164 } from "@/lib/phone";
import { isAdminPhone } from "@/lib/auth/admin";
import { checkOtp } from "@/lib/integrations/verify";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Credentials providers require JWT sessions in NextAuth v5.
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      id: "sms-otp",
      name: "SMS code",
      credentials: {
        phone: { label: "Phone", type: "tel" },
        code: { label: "Code", type: "text" },
      },
      async authorize(creds) {
        const phoneRaw = typeof creds?.phone === "string" ? creds.phone : "";
        const code = typeof creds?.code === "string" ? creds.code : "";
        const phone = toE164(phoneRaw);
        if (!phone || !code) return null;

        // Hard gate: only allow-listed admin phones may sign in.
        if (!isAdminPhone(phone)) return null;

        const ok = await checkOtp(phone, code);
        if (!ok) return null;

        // Upsert the admin user keyed by phone. Email is required + unique on
        // the User model, so synthesize a stable placeholder if needed.
        const existing = await prisma.user.findFirst({ where: { phone } });
        const user = existing
          ? await prisma.user.update({
              where: { id: existing.id },
              data: { role: "ADMIN" },
            })
          : await prisma.user.create({
              data: {
                phone,
                role: "ADMIN",
                email: `${phone.replace(/\D/g, "")}@phone.local`,
              },
            });

        return {
          id: user.id,
          name: user.name ?? null,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  pages: { signIn: "/auth/sign-in" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = (user as { role?: "CLIENT" | "ADMIN" }).role ?? "CLIENT";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? session.user.id;
        session.user.role =
          (token.role as "CLIENT" | "ADMIN" | undefined) ?? "CLIENT";
      }
      return session;
    },
  },
});
