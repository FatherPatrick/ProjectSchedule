import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { assertAdmin } from "@/lib/auth/admin";
import { getSettings, updateSettings } from "@/lib/domain/settings";
import { hhmmToMinutes, minutesToHhmm } from "@/lib/domain/dates";
import {
  ALLOWED_GRANULARITIES,
  parseBusinessHoursSaveForm,
  parseScheduledChangeCreateForm,
  parseScheduledChangeDeleteForm,
} from "@/lib/validation/admin";
import { bizDateKey, formatBiz } from "@/lib/timezone";
import { PrettySelect } from "@/components/PrettySelect";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { UnsavedChangesGuard } from "@/components/UnsavedChangesGuard";
import { DayHoursRow } from "./DayHoursRow";

export const dynamic = "force-dynamic";

const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const GRANULARITY_OPTIONS = ALLOWED_GRANULARITIES.map((value) => ({
  value,
  label:
    value === 60
      ? "Every hour"
      : value < 60
        ? `Every ${value} minutes`
        : value % 60 === 0
          ? `Every ${value / 60} hours`
          : `Every ${(value / 60).toFixed(1)} hours`,
}));

// "Max book-out" options. Values are strings ("none" = no limit) so the
// PrettySelect hidden input posts cleanly into the server action; the form
// validator maps "none" → null and the rest to a day count.
const MAX_ADVANCE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "7", label: "1 week" },
  { value: "14", label: "2 weeks" },
  { value: "21", label: "3 weeks" },
  { value: "30", label: "1 month" },
  { value: "90", label: "3 months" },
  { value: "180", label: "6 months" },
  { value: "365", label: "1 year" },
  { value: "none", label: "No limit" },
];

async function saveHours(formData: FormData) {
  "use server";
  await assertAdmin();
  const { granularity, maxAdvanceDays, days } =
    parseBusinessHoursSaveForm(formData);
  await prisma.$transaction([
    ...days.map((day, d) =>
      prisma.businessHours.upsert({
        where: { dayOfWeek: d },
        update: {
          active: day.active,
          openMin: hhmmToMinutes(day.open),
          closeMin: hhmmToMinutes(day.close),
        },
        create: {
          dayOfWeek: d,
          active: day.active,
          openMin: hhmmToMinutes(day.open),
          closeMin: hhmmToMinutes(day.close),
        },
      })
    ),
  ]);
  await updateSettings({ slotGranularityMin: granularity, maxAdvanceDays });
  revalidatePath("/admin/hours");
  redirect("/admin/hours?saved=hours");
}

async function addScheduledChange(formData: FormData) {
  "use server";
  await assertAdmin();
  const { effectiveFrom: dateStr, note, days } =
    parseScheduledChangeCreateForm(formData);
  const today = bizDateKey(new Date());
  if (dateStr <= today) {
    throw new Error("Effective date must be in the future");
  }
  const effectiveFrom = new Date(`${dateStr}T00:00:00.000Z`);

  await prisma.$transaction(
    days.map((day, d) =>
      prisma.businessHoursSchedule.upsert({
        where: {
          effectiveFrom_dayOfWeek: { effectiveFrom, dayOfWeek: d },
        },
        update: {
          openMin: hhmmToMinutes(day.open),
          closeMin: hhmmToMinutes(day.close),
          active: day.active,
          note,
        },
        create: {
          effectiveFrom,
          dayOfWeek: d,
          openMin: hhmmToMinutes(day.open),
          closeMin: hhmmToMinutes(day.close),
          active: day.active,
          note,
        },
      })
    )
  );
  revalidatePath("/admin/hours");
  redirect("/admin/hours?saved=schedule");
}

async function deleteScheduledChange(formData: FormData) {
  "use server";
  await assertAdmin();
  const { effectiveFrom: dateStr } = parseScheduledChangeDeleteForm(formData);
  const effectiveFrom = new Date(`${dateStr}T00:00:00.000Z`);
  await prisma.businessHoursSchedule.deleteMany({ where: { effectiveFrom } });
  revalidatePath("/admin/hours");
  redirect("/admin/hours?saved=deleted");
}

export default async function HoursAdmin({
  searchParams,
}: {
  searchParams?: Promise<{ saved?: string }>;
}) {
  // searchParams is awaited just to keep this page dynamic; the AdminToaster
  // in the layout reads `?saved=...` and shows the confirmation toast.
  await searchParams;
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
      <Card
        as="form"
        id="hours-form"
        key={`hours-${settings.slotGranularityMin}-${settings.maxAdvanceDays ?? "none"}`}
        action={saveHours}
        className="space-y-4"
      >
        <UnsavedChangesGuard />
        <div className="space-y-3">
          {DOWS.map((label, d) => {
            const r = byDay.get(d);
            return (
              <DayHoursRow
                key={d}
                label={label}
                dayIndex={d}
                active={r?.active ?? false}
                openMin={r?.openMin ?? 9 * 60}
                closeMin={r?.closeMin ?? 18 * 60}
              />
            );
          })}
        </div>

        <div className="border-t border-neutral-200 pt-3">
          <label className="text-sm font-medium">Booking interval</label>
          <p className="text-xs text-neutral-500 mb-2">
            How often a booking start time is offered to clients.
          </p>
          <PrettySelect
            key={settings.slotGranularityMin}
            name="granularity"
            ariaLabel="Booking interval"
            defaultValue={settings.slotGranularityMin}
            triggerClassName="min-w-[14rem]"
            options={GRANULARITY_OPTIONS}
          />
        </div>

        <div className="border-t border-neutral-200 pt-3">
          <label className="text-sm font-medium">Max book-out time</label>
          <p className="text-xs text-neutral-500 mb-2">
            How far in advance clients can book. Stops bookings way out in the
            future (e.g. two years from now).
          </p>
          <PrettySelect
            key={settings.maxAdvanceDays ?? "none"}
            name="maxAdvanceDays"
            ariaLabel="Max book-out time"
            defaultValue={
              settings.maxAdvanceDays == null
                ? "none"
                : String(settings.maxAdvanceDays)
            }
            triggerClassName="min-w-[14rem]"
            options={MAX_ADVANCE_OPTIONS}
          />
        </div>

        <Button type="submit">Save changes</Button>
      </Card>

      <Card as="section" className="space-y-4">
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
                        aria-label={`Delete scheduled change effective ${display}`}
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
                        : `${minutesToHhmm(r.openMin)} – ${minutesToHhmm(r.closeMin)}`;
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
          <form
            id="scheduled-change-form"
            action={addScheduledChange}
            className="mt-3 space-y-3"
          >
            <UnsavedChangesGuard />
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
                  aria-label="Scheduled change note (optional)"
                  placeholder="Optional reason (e.g. summer hours)"
                  className="rounded-lg border border-neutral-300 px-2 py-1 w-full"
                />
              </label>
            </div>
            <div className="space-y-2">
              {DOWS.map((label, d) => {
                const r = byDay.get(d);
                return (
                  <DayHoursRow
                    key={d}
                    label={label}
                    dayIndex={d}
                    scheduled
                    active={r?.active ?? false}
                    openMin={r?.openMin ?? 9 * 60}
                    closeMin={r?.closeMin ?? 18 * 60}
                  />
                );
              })}
            </div>
            <Button type="submit">Schedule change</Button>
          </form>
        </details>
      </Card>
    </div>
  );
}
