"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DayPicker, type DateRange } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { format } from "date-fns";
import { PrettyTimeField } from "@/components/PrettyTimeField";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { TextInput } from "@/components/TextInput";
import { notifyAdminToast } from "@/app/admin/AdminToaster";

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
        notifyAdminToast({ kind: "error", message: j.error ?? "Could not save blackout." });
        return;
      }
      reset();
      router.refresh();
      notifyAdminToast({ message: "Blackout added." });
    });
  }

  const summary = range?.from
    ? range.to && range.to.getTime() !== range.from.getTime()
      ? `${format(range.from, "MMM d")} → ${format(range.to, "MMM d, yyyy")}`
      : format(range.from, "EEEE, MMM d, yyyy")
    : "Select one or more days";

  return (
    <Card className="space-y-3">
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
            <PrettyTimeField
              value={startTime}
              onChange={setStartTime}
              ariaLabel="Blackout start time"
            />
          </label>
          <label className="flex items-center gap-1">
            To
            <PrettyTimeField
              value={endTime}
              onChange={setEndTime}
              ariaLabel="Blackout end time"
            />
          </label>
        </div>
      )}

      <TextInput
        aria-label="Blackout reason (optional)"
        placeholder="Reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full"
      />

      {error && (
        <p
          role="alert"
          className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2"
        >
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          onClick={submit}
          disabled={pending || !range?.from}
        >
          {pending ? "Saving…" : "Add blackout"}
        </Button>
        {range?.from && (
          <Button
            type="button"
            variant="secondary"
            onClick={reset}
            className="text-sm"
          >
            Clear
          </Button>
        )}
      </div>
    </Card>
  );
}

export function DeleteBlackoutButton({
  id,
  label,
}: {
  id: string;
  /** Optional human-readable description used to disambiguate the button
   *  for screen readers (e.g. "Friday, May 15"). */
  label?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="danger"
      size="sm"
      disabled={pending}
      aria-label={label ? `Remove blackout ${label}` : "Remove blackout"}
      onClick={() => {
        if (!confirm("Remove this blackout?")) return;
        start(async () => {
          const res = await fetch(`/api/admin/blackouts/${id}`, { method: "DELETE" });
          router.refresh();
          if (res.ok) {
            notifyAdminToast({ message: "Blackout removed." });
          } else {
            notifyAdminToast({ kind: "error", message: "Could not remove blackout." });
          }
        });
      }}
    >
      {pending ? "…" : "Remove"}
    </Button>
  );
}
