import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Resend from "next-auth/providers/resend";
import { prisma } from "@/lib/db/prisma";
import { EMAIL_FROM } from "@/lib/integrations/email";

const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: EMAIL_FROM,
    }),
  ],
  pages: {
    signIn: "/auth/sign-in",
    verifyRequest: "/auth/check-email",
  },
  callbacks: {
    async signIn({ user }) {
      if (user.email && adminEmails.includes(user.email.toLowerCase())) {
        try {
          await prisma.user.update({
            where: { email: user.email },
            data: { role: "ADMIN" },
          });
        } catch {
          // user not yet persisted; PrismaAdapter creates after this hook
        }
      }
      return true;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = (user as { role?: "CLIENT" | "ADMIN" }).role ?? "CLIENT";
      }
      return session;
    },
  },
});
