import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/auth";

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
        You are signed in but do not have admin access. Ask the site owner to
        add your email to <code>ADMIN_EMAILS</code>.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 pb-3">
        <nav className="flex flex-wrap gap-3 text-sm">
          <Link href="/admin" className="font-medium">
            Dashboard
          </Link>
          <Link href="/admin/calendar">Calendar</Link>
          <Link href="/admin/services">Services</Link>
          <Link href="/admin/blackouts">Blackouts</Link>
          <Link href="/admin/hours">Hours</Link>
        </nav>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button className="text-sm text-neutral-500 hover:text-neutral-900">
            Sign out
          </button>
        </form>
      </div>
      {children}
    </div>
  );
}
