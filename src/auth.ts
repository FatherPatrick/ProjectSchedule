import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { toE164 } from "@/lib/phone";
import { isAdminPhone } from "@/lib/auth/admin";
import { checkOtp } from "@/lib/integrations/verify";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // trustHost allows NextAuth to serve multiple subdomains correctly.
  // Do NOT set cookies.sessionToken.options.domain to ".app.com" — host-only
  // cookies are the correct default and prevent cross-tenant session leaks.
  trustHost: true,
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

        // Resolve the salon for this host via the x-salon-slug header set by
        // the proxy middleware. Authorize is a server-side function so
        // headers() is available here.
        const headersList = await headers();
        const slug = headersList.get("x-salon-slug");
        if (!slug) return null;

        const salon = await prisma.salon.findUnique({
          where: { slug },
          select: { id: true },
        });
        if (!salon) return null;

        // Host-scoped gate: only allow-listed admins of THIS salon may sign in.
        if (!(await isAdminPhone(salon.id, phone))) return null;

        const ok = await checkOtp(phone, code);
        if (!ok) return null;

        // Upsert the admin user, setting their salonId so the JWT carries it.
        const existing = await prisma.user.findFirst({ where: { phone } });
        const user = existing
          ? await prisma.user.update({
              where: { id: existing.id },
              data: { role: "ADMIN", salonId: salon.id },
            })
          : await prisma.user.create({
              data: {
                phone,
                role: "ADMIN",
                salonId: salon.id,
                email: `${phone.replace(/\D/g, "")}@phone.local`,
              },
            });

        return {
          id: user.id,
          name: user.name ?? null,
          email: user.email,
          role: user.role,
          salonId: user.salonId ?? null,
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
        token.salonId =
          (user as { salonId?: string | null }).salonId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? session.user.id;
        session.user.role =
          (token.role as "CLIENT" | "ADMIN" | undefined) ?? "CLIENT";
        session.user.salonId = (token.salonId as string | null | undefined) ?? null;
      }
      return session;
    },
  },
});
