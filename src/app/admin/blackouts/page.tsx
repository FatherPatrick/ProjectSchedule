import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { formatBiz } from "@/lib/timezone";
import { fromZonedTime } from "date-fns-tz";
import { BUSINESS_TIMEZONE } from "@/lib/config";

export const dynamic = "force-dynamic";

async function assertAdmin() {
  const s = await auth();
  if (!s?.user || s.user.role !== "ADMIN") throw new Error("Unauthorized");
}

async function createBlackout(formData: FormData) {
  "use server";
  await assertAdmin();
  const startLocal = String(formData.get("start") ?? "");
  const endLocal = String(formData.get("end") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!startLocal || !endLocal) return;
  const startsAt = fromZonedTime(startLocal, BUSINESS_TIMEZONE);
  const endsAt = fromZonedTime(endLocal, BUSINESS_TIMEZONE);
  if (endsAt <= startsAt) return;
  await prisma.blackout.create({ data: { startsAt, endsAt, reason } });
  revalidatePath("/admin/blackouts");
}

async function deleteBlackout(id: string) {
  "use server";
  await assertAdmin();
  await prisma.blackout.delete({ where: { id } });
  revalidatePath("/admin/blackouts");
}

export default async function BlackoutsAdmin() {
  const blackouts = await prisma.blackout.findMany({
    where: { endsAt: { gte: new Date() } },
    orderBy: { startsAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Blackout dates</h1>
      <p className="text-sm text-neutral-600">
        Block off vacations, holidays, or breaks. Times are entered in the
        business timezone ({BUSINESS_TIMEZONE}).
      </p>

      <form
        action={createBlackout}
        className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-2"
      >
        <div className="grid sm:grid-cols-2 gap-2">
          <label className="text-sm">
            Start
            <input
              name="start"
              type="datetime-local"
              required
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            End
            <input
              name="end"
              type="datetime-local"
              required
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
            />
          </label>
          <input
            name="reason"
            placeholder="Reason (optional)"
            className="rounded-lg border border-neutral-300 px-3 py-2 sm:col-span-2"
          />
        </div>
        <button className="rounded-full bg-pink-600 text-white px-4 py-2 font-medium">
          Add blackout
        </button>
      </form>

      <ul className="divide-y divide-neutral-200 rounded-2xl bg-white border border-neutral-200">
        {blackouts.map((b) => (
          <li key={b.id} className="p-3 flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">
                {formatBiz(b.startsAt, "MMM d, h:mm a")} →{" "}
                {formatBiz(b.endsAt, "MMM d, h:mm a")}
              </div>
              {b.reason && (
                <div className="text-sm text-neutral-500">{b.reason}</div>
              )}
            </div>
            <form action={deleteBlackout.bind(null, b.id)}>
              <button className="text-sm rounded-full border border-red-200 text-red-700 px-3 py-1 hover:bg-red-50">
                Remove
              </button>
            </form>
          </li>
        ))}
        {blackouts.length === 0 && (
          <li className="p-4 text-sm text-neutral-500">
            No upcoming blackouts.
          </li>
        )}
      </ul>
    </div>
  );
}
