import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/auth";
import { getSettings, updateSettings } from "@/lib/domain/settings";
import { bizDateKey, formatBiz } from "@/lib/timezone";

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

async function addScheduledChange(formData: FormData) {
  "use server";
  await assertAdmin();
  const dateStr = String(formData.get("effectiveFrom") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error("Invalid effective date");
  }
  const today = bizDateKey(new Date());
  if (dateStr <= today) {
    throw new Error("Effective date must be in the future");
  }
  const effectiveFrom = new Date(`${dateStr}T00:00:00.000Z`);
  const note = String(formData.get("note") ?? "").trim() || null;

  const data = [];
  for (let d = 0; d < 7; d++) {
    const active = formData.get(`s-active-${d}`) === "on";
    const open = String(formData.get(`s-open-${d}`) ?? "09:00");
    const close = String(formData.get(`s-close-${d}`) ?? "18:00");
    data.push({
      effectiveFrom,
      dayOfWeek: d,
      openMin: toMin(open),
      closeMin: toMin(close),
      active,
      note,
    });
  }

  await prisma.$transaction(
    data.map((row) =>
      prisma.businessHoursSchedule.upsert({
        where: {
          effectiveFrom_dayOfWeek: {
            effectiveFrom: row.effectiveFrom,
            dayOfWeek: row.dayOfWeek,
          },
        },
        update: {
          openMin: row.openMin,
          closeMin: row.closeMin,
          active: row.active,
          note: row.note,
        },
        create: row,
      })
    )
  );
  revalidatePath("/admin/hours");
}

async function deleteScheduledChange(formData: FormData) {
  "use server";
  await assertAdmin();
  const dateStr = String(formData.get("effectiveFrom") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
  const effectiveFrom = new Date(`${dateStr}T00:00:00.000Z`);
  await prisma.businessHoursSchedule.deleteMany({ where: { effectiveFrom } });
  revalidatePath("/admin/hours");
}

export default async function HoursAdmin() {
  const todayKey = bizDateKey(new Date());
  const todayMidnightUTC = new Date(`${todayKey}T00:00:00.000Z`);
  const [rows, settings, scheduleRows] = await Promise.all([
    prisma.businessHours.findMany(),
    getSettings(),
    prisma.businessHoursSchedule.findMany({
      where: { effectiveFrom: { gt: todayMidnightUTC } },
      orderBy: [{ effectiveFrom: "asc" }, { dayOfWeek: "asc" }],
    }),
  ]);
  const byDay = new Map(rows.map((r) => [r.dayOfWeek, r]));

  // Group future schedule rows by their effectiveFrom date (YYYY-MM-DD).
  const scheduleGroups = new Map<
    string,
    { note: string | null; days: Map<number, (typeof scheduleRows)[number]> }
  >();
  for (const row of scheduleRows) {
    const key = row.effectiveFrom.toISOString().slice(0, 10);
    let group = scheduleGroups.get(key);
    if (!group) {
      group = { note: row.note, days: new Map() };
      scheduleGroups.set(key, group);
    }
    group.days.set(row.dayOfWeek, row);
  }

  // Default values for the "add scheduled change" form mirror current hours.
  const tomorrow = new Date(todayMidnightUTC.getTime() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

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

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Scheduled future changes
          </h2>
          <p className="text-sm text-neutral-600">
            Define a new weekly schedule that takes effect on a future date.
            On and after that date, these hours replace the defaults above
            until another scheduled change takes effect.
          </p>
        </div>

        {scheduleGroups.size === 0 ? (
          <p className="text-sm text-neutral-500 italic">
            No future changes scheduled.
          </p>
        ) : (
          <ul className="space-y-3">
            {Array.from(scheduleGroups.entries()).map(([dateKey, group]) => {
              const display = formatBiz(
                new Date(`${dateKey}T12:00:00.000Z`),
                "EEEE, MMMM d, yyyy"
              );
              return (
                <li
                  key={dateKey}
                  className="rounded-xl border border-neutral-200 p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">Effective {display}</div>
                      {group.note ? (
                        <div className="text-xs text-neutral-500 mt-0.5">
                          {group.note}
                        </div>
                      ) : null}
                    </div>
                    <form action={deleteScheduledChange}>
                      <input
                        type="hidden"
                        name="effectiveFrom"
                        value={dateKey}
                      />
                      <button
                        type="submit"
                        className="text-xs text-red-700 underline underline-offset-2"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                  <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    {DOWS.map((label, d) => {
                      const r = group.days.get(d);
                      const text = !r
                        ? "(unchanged)"
                        : !r.active || r.openMin >= r.closeMin
                        ? "Closed"
                        : `${fromMin(r.openMin)} – ${fromMin(r.closeMin)}`;
                      return (
                        <li key={d} className="flex justify-between gap-2">
                          <span className="text-neutral-600">{label}</span>
                          <span>{text}</span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}

        <details className="rounded-xl border border-neutral-200 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Add scheduled change
          </summary>
          <form action={addScheduledChange} className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm flex items-center gap-2">
                Effective from
                <input
                  type="date"
                  name="effectiveFrom"
                  required
                  min={tomorrow}
                  defaultValue={tomorrow}
                  className="rounded-lg border border-neutral-300 px-2 py-1"
                />
              </label>
              <label className="text-sm flex items-center gap-2 grow">
                Note
                <input
                  type="text"
                  name="note"
                  placeholder="Optional reason (e.g. summer hours)"
                  className="rounded-lg border border-neutral-300 px-2 py-1 w-full"
                />
              </label>
            </div>
            <div className="space-y-2">
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
                        name={`s-active-${d}`}
                        defaultChecked={r?.active ?? false}
                      />
                      <span className="font-medium">{label}</span>
                    </label>
                    <label className="text-sm flex items-center gap-1">
                      Open
                      <input
                        type="time"
                        name={`s-open-${d}`}
                        defaultValue={fromMin(r?.openMin ?? 9 * 60)}
                        className="rounded-lg border border-neutral-300 px-2 py-1"
                      />
                    </label>
                    <label className="text-sm flex items-center gap-1">
                      Close
                      <input
                        type="time"
                        name={`s-close-${d}`}
                        defaultValue={fromMin(r?.closeMin ?? 18 * 60)}
                        className="rounded-lg border border-neutral-300 px-2 py-1"
                      />
                    </label>
                  </div>
                );
              })}
            </div>
            <button className="rounded-full bg-pink-600 text-white px-4 py-2 font-medium">
              Schedule change
            </button>
          </form>
        </details>
      </section>
    </div>
  );
}
