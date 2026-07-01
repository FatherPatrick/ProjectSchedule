import type { DefaultSession, DefaultJWT } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "CLIENT" | "ADMIN";
      /** The salon this admin manages. Null for platform super-admins (future). */
      salonId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role?: "CLIENT" | "ADMIN";
    salonId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    uid?: string;
    role?: "CLIENT" | "ADMIN";
    salonId?: string | null;
  }
}
