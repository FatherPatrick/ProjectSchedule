import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getSettings, updateSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const GRANULARITY_OPTIONS = [
  { value: 15, label: "Every 15 minutes" },
  { value: 30, label: "Every 30 minutes" },
  { value: 60, label: "Every hour" },
];

async function assertAdmin() {
  const s = await auth();
  if (!s?.user || s.user.role !== "ADMIN") throw new Error("Unauthorized");
}

async function saveHours(formData: FormData) {
  "use server";
  await assertAdmin();
  for (let d = 0; d < 7; d++) {
    const active = formData.get(`active-${d}`) === "on";
    const open = String(formData.get(`open-${d}`) ?? "09:00");
    const close = String(formData.get(`close-${d}`) ?? "18:00");
    const openMin = toMin(open);
    const closeMin = toMin(close);
    await prisma.businessHours.upsert({
      where: { dayOfWeek: d },
      update: { active, openMin, closeMin },
      create: { dayOfWeek: d, active, openMin, closeMin },
    });
  }
  const granularity = Number(formData.get("granularity"));
  if ([15, 30, 60].includes(granularity)) {
    await updateSettings({ slotGranularityMin: granularity });
  }
  revalidatePath("/admin/hours");
}

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function fromMin(min: number) {
  const h = String(Math.floor(min / 60)).padStart(2, "0");
  const m = String(min % 60).padStart(2, "0");
  return `${h}:${m}`;
}

export default async function HoursAdmin() {
  const [rows, settings] = await Promise.all([
    prisma.businessHours.findMany(),
    getSettings(),
  ]);
  const byDay = new Map(rows.map((r) => [r.dayOfWeek, r]));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Business hours & booking interval
      </h1>
      <form
        action={saveHours}
        className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-4"
      >
        <div className="space-y-3">
          {DOWS.map((label, d) => {
          const r = byDay.get(d);
          return (
            <div
              key={d}
              className="flex flex-wrap items-center gap-3 border-b border-neutral-100 last:border-0 pb-2"
            >
              <label className="w-28 flex items-center gap-2">
                <input
                  type="checkbox"
                  name={`active-${d}`}
                  defaultChecked={r?.active ?? false}
                />
                <span className="font-medium">{label}</span>
              </label>
              <label className="text-sm flex items-center gap-1">
                Open
                <input
                  type="time"
                  name={`open-${d}`}
                  defaultValue={fromMin(r?.openMin ?? 9 * 60)}
                  className="rounded-lg border border-neutral-300 px-2 py-1"
                />
              </label>
              <label className="text-sm flex items-center gap-1">
                Close
                <input
                  type="time"
                  name={`close-${d}`}
                  defaultValue={fromMin(r?.closeMin ?? 18 * 60)}
                  className="rounded-lg border border-neutral-300 px-2 py-1"
                />
              </label>
            </div>
          );
        })}
        </div>

        <div className="border-t border-neutral-200 pt-3">
          <label className="text-sm font-medium">Booking interval</label>
          <p className="text-xs text-neutral-500 mb-2">
            How often a booking start time is offered to clients.
          </p>
          <select
            name="granularity"
            defaultValue={settings.slotGranularityMin}
            className="rounded-lg border border-neutral-300 px-3 py-2"
          >
            {GRANULARITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <button className="rounded-full bg-pink-600 text-white px-4 py-2 font-medium">
          Save changes
        </button>
      </form>
    </div>
  );
}
