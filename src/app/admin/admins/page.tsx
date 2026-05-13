/**
 * Admin allow-list management page.
 *
 * Lists every phone that can sign into the admin area — both DB-managed
 * entries (added here, deletable here) and env-bootstrap entries (from
 * the legacy `ADMIN_PHONES` env var, surfaced read-only).
 *
 * Server actions are used for both add and remove so the page works
 * without client-side JS and so the existing `assertAdmin` server-side
 * guard applies to every mutation.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import {
  ENV_ADMIN_PHONES,
  addAdminPhone,
  assertAdmin,
  listAdminPhones,
  removeAdminPhone,
  requireAdmin,
} from "@/lib/auth/admin";
import { toE164 } from "@/lib/phone";
import { UnsavedChangesGuard } from "@/components/UnsavedChangesGuard";

export const dynamic = "force-dynamic";

async function inviteAdmin(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  if (!session) throw new Error("Unauthorized");

  const raw = String(formData.get("phone") ?? "").trim();
  const phone = toE164(raw);
  if (!phone) {
    redirect("/admin/admins?error=invalid");
  }
  await addAdminPhone(phone, session.user.id);
  revalidatePath("/admin/admins");
  redirect("/admin/admins?saved=added");
}

async function revokeAdmin(phone: string) {
  "use server";
  const session = await requireAdmin();
  if (!session) throw new Error("Unauthorized");

  // Mirror the API guardrails so the server action can't be used to
  // bypass them by directly submitting the form.
  if (ENV_ADMIN_PHONES.has(phone)) {
    redirect("/admin/admins?error=env");
  }
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { phone: true },
  });
  if (me?.phone === phone) {
    redirect("/admin/admins?error=self");
  }
  await removeAdminPhone(phone);
  revalidatePath("/admin/admins");
  redirect("/admin/admins?saved=removed");
}

async function maskedInviter(id: string | null): Promise<string> {
  if (!id) return "—";
  const u = await prisma.user.findUnique({
    where: { id },
    select: { phone: true, email: true },
  });
  return u?.phone ?? u?.email ?? "—";
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "That doesn't look like a valid phone number.",
  env: "This phone is managed via the ADMIN_PHONES env var and can't be removed here.",
  self: "You can't remove your own admin access.",
};

const SAVED_MESSAGES: Record<string, string> = {
  added: "Admin added.",
  removed: "Admin removed.",
};

export default async function AdminsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await assertAdmin();
  const { saved, error } = await searchParams;
  const admins = await listAdminPhones();

  // Pre-resolve inviter labels server-side so the JSX stays sync.
  const inviterLabels = await Promise.all(
    admins.map((a) => maskedInviter(a.createdById))
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Admins</h1>

      {saved && SAVED_MESSAGES[saved] ? (
        <div
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          {SAVED_MESSAGES[saved]}
        </div>
      ) : null}
      {error && ERROR_MESSAGES[error] ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"
        >
          {ERROR_MESSAGES[error]}
        </div>
      ) : null}

      <form
        id="invite-admin-form"
        action={inviteAdmin}
        className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3"
      >
        <UnsavedChangesGuard />
        <label className="block text-sm font-medium text-neutral-700">
          Invite admin by phone
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            name="phone"
            type="tel"
            required
            placeholder="+15555551212"
            aria-label="Phone number in E.164 format"
            className="flex-1 min-w-[14rem] rounded-lg border border-neutral-300 px-3 py-2"
          />
          <button
            type="submit"
            className="rounded-full bg-pink-600 text-white px-4 py-2 font-medium"
          >
            Add admin
          </button>
        </div>
        <p className="text-xs text-neutral-500">
          They'll be able to sign in via SMS code the next time they
          request one. No notification is sent.
        </p>
      </form>

      <ul className="divide-y divide-neutral-200 rounded-2xl bg-white border border-neutral-200">
        {admins.map((a, i) => (
          <li
            key={a.phone}
            className="flex items-center justify-between gap-3 p-4"
          >
            <div className="min-w-0">
              <div className="font-medium text-neutral-900">{a.phone}</div>
              <div className="text-xs text-neutral-500">
                {a.source === "env" ? (
                  <span>From ADMIN_PHONES env var</span>
                ) : (
                  <span>
                    Added {a.createdAt.toLocaleDateString()}
                    {inviterLabels[i] !== "—" ? ` by ${inviterLabels[i]}` : ""}
                  </span>
                )}
              </div>
            </div>
            {a.source === "db" ? (
              <form action={revokeAdmin.bind(null, a.phone)}>
                <button
                  type="submit"
                  aria-label={`Remove admin ${a.phone}`}
                  className="text-sm rounded-full border border-red-200 text-red-700 px-3 py-1 hover:bg-red-50"
                >
                  Remove
                </button>
              </form>
            ) : (
              <span
                className="text-xs rounded-full border border-neutral-200 px-3 py-1 text-neutral-500"
                title="Managed via the ADMIN_PHONES env var"
              >
                env-managed
              </span>
            )}
          </li>
        ))}
        {admins.length === 0 ? (
          <li className="p-4 text-sm text-neutral-500">
            No admins configured. Add one above or set ADMIN_PHONES.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
