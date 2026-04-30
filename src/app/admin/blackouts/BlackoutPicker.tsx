"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DayPicker, type DateRange } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { format } from "date-fns";

export function BlackoutPicker() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [range, setRange] = useState<DateRange | undefined>();
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setRange(undefined);
    setAllDay(true);
    setStartTime("09:00");
    setEndTime("18:00");
    setReason("");
  }

  async function submit() {
    setError(null);
    if (!range?.from) {
      setError("Pick at least one day on the calendar.");
      return;
    }
    const fromDay = format(range.from, "yyyy-MM-dd");
    const toDay = format(range.to ?? range.from, "yyyy-MM-dd");
    start(async () => {
      const res = await fetch("/api/admin/blackouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromDay,
          toDay,
          allDay,
          startTime: allDay ? null : startTime,
          endTime: allDay ? null : endTime,
          reason: reason.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Could not save blackout.");
        return;
      }
      reset();
      router.refresh();
    });
  }

  const summary = range?.from
    ? range.to && range.to.getTime() !== range.from.getTime()
      ? `${format(range.from, "MMM d")} → ${format(range.to, "MMM d, yyyy")}`
      : format(range.from, "EEEE, MMM d, yyyy")
    : "Select one or more days";

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3">
      <div className="text-sm font-medium">{summary}</div>

      <div className="overflow-x-auto">
        <DayPicker
          mode="range"
          selected={range}
          onSelect={setRange}
          disabled={{ before: new Date() }}
          numberOfMonths={1}
          showOutsideDays
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={allDay}
          onChange={(e) => setAllDay(e.target.checked)}
        />
        Block the entire day(s)
      </label>

      {!allDay && (
        <div className="flex flex-wrap gap-2 text-sm">
          <label className="flex items-center gap-1">
            From
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="rounded-lg border border-neutral-300 px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-1">
            To
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="rounded-lg border border-neutral-300 px-2 py-1"
            />
          </label>
        </div>
      )}

      <input
        placeholder="Reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full rounded-lg border border-neutral-300 px-3 py-2"
      />

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !range?.from}
          className="rounded-full bg-pink-600 text-white px-4 py-2 font-medium disabled:bg-neutral-300"
        >
          {pending ? "Saving…" : "Add blackout"}
        </button>
        {range?.from && (
          <button
            type="button"
            onClick={reset}
            className="rounded-full border border-neutral-300 px-4 py-2 text-sm"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

export function DeleteBlackoutButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!confirm("Remove this blackout?")) return;
        start(async () => {
          await fetch(`/api/admin/blackouts/${id}`, { method: "DELETE" });
          router.refresh();
        });
      }}
      className="text-sm rounded-full border border-red-200 text-red-700 px-3 py-1 hover:bg-red-50 disabled:opacity-50"
    >
      {pending ? "…" : "Remove"}
    </button>
  );
}
