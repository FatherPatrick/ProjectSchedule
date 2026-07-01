/**
 * Admin allow-list management page.
 *
 * Lists every phone that can sign into this salon's admin area.
 * Server actions are used for both add and remove so the page works
 * without client-side JS and so the server-side admin guard applies
 * to every mutation.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import {
  addAdminPhone,
  listAdminPhones,
  removeAdminPhone,
  requireAdmin,
  setAdminNotify,
} from "@/lib/auth/admin";
import { toE164 } from "@/lib/phone";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { TextInput } from "@/components/TextInput";
import { UnsavedChangesGuard } from "@/components/UnsavedChangesGuard";
import { ERROR_MESSAGES, SAVED_MESSAGES } from "@/app/admin/toastMessages";

export const dynamic = "force-dynamic";

async function inviteAdmin(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  if (!session?.user.salonId) throw new Error("Unauthorized");

  const raw = String(formData.get("phone") ?? "").trim();
  const phone = toE164(raw);
  if (!phone) {
    redirect("/admin/admins?error=invalid");
  }
  await addAdminPhone(session.user.salonId, phone, session.user.id);
  revalidatePath("/admin/admins");
  redirect("/admin/admins?saved=added");
}

async function revokeAdmin(phone: string) {
  "use server";
  const session = await requireAdmin();
  if (!session?.user.salonId) throw new Error("Unauthorized");

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { phone: true },
  });
  if (me?.phone === phone) {
    redirect("/admin/admins?error=self");
  }
  await removeAdminPhone(session.user.salonId, phone);
  revalidatePath("/admin/admins");
  redirect("/admin/admins?saved=removed");
}

async function setNotify(phone: string, next: boolean) {
  "use server";
  const session = await requireAdmin();
  if (!session?.user.salonId) throw new Error("Unauthorized");
  await setAdminNotify(session.user.salonId, phone, next);
  revalidatePath("/admin/admins");
  redirect("/admin/admins?saved=notify");
}

async function maskedInviter(id: string | null): Promise<string> {
  if (!id) return "—";
  const u = await prisma.user.findUnique({
    where: { id },
    select: { phone: true, email: true },
  });
  return u?.phone ?? u?.email ?? "—";
}

export default async function AdminsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const adminSession = await requireAdmin();
  if (!adminSession?.user.salonId) redirect("/auth/sign-in?callbackUrl=/admin/admins");

  const { saved, error } = await searchParams;
  const admins = await listAdminPhones(adminSession.user.salonId);

  const inviterLabels = await Promise.all(
    admins.map((a) => maskedInviter(a.createdById))
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Admins</h1>

      {saved && SAVED_MESSAGES[saved] ? (
        <Alert tone="success" role="status" className="p-3">
          {SAVED_MESSAGES[saved]}
        </Alert>
      ) : null}
      {error && ERROR_MESSAGES[error] ? (
        <Alert tone="error" role="alert" className="p-3">
          {ERROR_MESSAGES[error]}
        </Alert>
      ) : null}

      <Card
        as="form"
        id="invite-admin-form"
        action={inviteAdmin}
        className="space-y-3"
      >
        <UnsavedChangesGuard />
        <label className="block text-sm font-medium text-neutral-700">
          Invite admin by phone
        </label>
        <div className="flex flex-wrap gap-2">
          <TextInput
            name="phone"
            type="tel"
            required
            placeholder="+15555551212"
            aria-label="Phone number in E.164 format"
            className="flex-1 min-w-[14rem]"
          />
          <Button type="submit">Add admin</Button>
        </div>
        <p className="text-xs text-neutral-500">
          They&apos;ll be able to sign in via SMS code the next time they
          request one. No notification is sent.
        </p>
      </Card>

      <ul className="divide-y divide-neutral-200 rounded-2xl bg-white border border-neutral-200">
        {admins.map((a, i) => (
          <li
            key={a.phone}
            className="flex items-center justify-between gap-3 p-4"
          >
            <div className="min-w-0">
              <div className="font-medium text-neutral-900">{a.phone}</div>
              <div className="text-xs text-neutral-500">
                Added {a.createdAt.toLocaleDateString()}
                {inviterLabels[i] !== "—" ? ` by ${inviterLabels[i]}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <form action={setNotify.bind(null, a.phone, !a.notify)}>
                <button
                  type="submit"
                  aria-pressed={a.notify}
                  aria-label={`${a.notify ? "Disable" : "Enable"} booking alerts for ${a.phone}`}
                  className={
                    a.notify
                      ? "text-xs rounded-full border border-emerald-300 bg-emerald-50 text-emerald-800 px-3 py-1 hover:bg-emerald-100"
                      : "text-xs rounded-full border border-neutral-200 text-neutral-500 px-3 py-1 hover:bg-neutral-50"
                  }
                  title="Toggle SMS alerts when a client books or requests an appointment"
                >
                  {a.notify ? "Alerts on" : "Alerts off"}
                </button>
              </form>
              <form action={revokeAdmin.bind(null, a.phone)}>
                <Button
                  type="submit"
                  variant="danger"
                  size="sm"
                  aria-label={`Remove admin ${a.phone}`}
                >
                  Remove
                </Button>
              </form>
            </div>
          </li>
        ))}
        {admins.length === 0 ? (
          <li className="p-4 text-sm text-neutral-500">
            No admins configured. Add one above.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
