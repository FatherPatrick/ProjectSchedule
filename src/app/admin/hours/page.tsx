import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import SaveToast from "./SaveToast";
import {
  BOOKING_INTERVAL_OPTIONS,
  getSettings,
  updateSettings,
} from "@/lib/settings";

export const dynamic = "force-dynamic";

const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function formatGranularityLabel(value: number) {
  if (value < 60) return `Every ${value} minutes`;
  if (value === 60) return "Every hour";

  const hours = value / 60;
  const isWhole = Number.isInteger(hours);
  const pretty = isWhole ? String(hours) : hours.toFixed(1);
  const unit = hours === 1 ? "hour" : "hours";
  return `Every ${pretty} ${unit}`;
}

const GRANULARITY_OPTIONS = BOOKING_INTERVAL_OPTIONS.map((value) => ({
  value,
  label: formatGranularityLabel(value),
}));
const ALLOWED_GRANULARITIES = new Set<number>(BOOKING_INTERVAL_OPTIONS);

async function assertAdmin() {
  const s = await auth();
  if (!s?.user || s.user.role !== "ADMIN") throw new Error("Unauthorized");
}

async function saveHours(formData: FormData) {
  "use server";
  await assertAdmin();
  try {
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
    const allowStartAtClose = formData.get("allowStartAtClose") === "on";
    if (ALLOWED_GRANULARITIES.has(granularity)) {
      await updateSettings({ slotGranularityMin: granularity, allowStartAtClose });
    } else {
      await updateSettings({ allowStartAtClose });
    }
  } catch {
    redirect("/admin/hours?saved=error");
  }
  revalidatePath("/admin/hours");
  redirect("/admin/hours?saved=success");
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

export default async function HoursAdmin({
  searchParams,
}: {
  searchParams: Promise<{ saved?: "success" | "error" }>;
}) {
  const { saved } = await searchParams;
  const [rows, settings] = await Promise.all([
    prisma.businessHours.findMany(),
    getSettings(),
  ]);
  const byDay = new Map(rows.map((r) => [r.dayOfWeek, r]));

  return (
    <div className="space-y-6">
      {saved === "success" || saved === "error" ? (
        <SaveToast status={saved} />
      ) : null}
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
          <label className="mt-3 flex items-start gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              name="allowStartAtClose"
              defaultChecked={settings.allowStartAtClose}
              className="mt-1"
            />
            <span>
              Allow appointments to start at closing time.
              <span className="block text-xs text-neutral-500">
                If enabled, a long appointment may end after the listed close
                time.
              </span>
            </span>
          </label>
        </div>

        <button className="rounded-full bg-pink-600 text-white px-4 py-2 font-medium">
          Save changes
        </button>
      </form>
    </div>
  );
}
