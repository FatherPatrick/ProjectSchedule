import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import AdminNav from "./AdminNav";
import { AdminToaster } from "./AdminToaster";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth/sign-in?callbackUrl=/admin");
  if (session.user.role !== "ADMIN") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900">
        You are signed in but do not have admin access. Ask an existing admin
        to invite your phone number from the Admins page.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminToaster />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminNav />
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 shadow-sm transition hover:border-brand-soft hover:text-brand">
            Sign out
          </button>
        </form>
      </div>
      {children}
    </div>
  );
}
