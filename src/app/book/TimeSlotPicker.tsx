import { cn } from "@/lib/utils";
import { PrettyTimeField } from "@/components/PrettyTimeField";
import { Card } from "@/components/Card";
import { TextInput } from "@/components/TextInput";
import { Textarea } from "@/components/Textarea";
import type { Slot } from "./types";

interface TimeSlotPickerProps {
  slotsLoading: boolean;
  displaySlots: Slot[];
  startISO: string | null;
  proposeMode: boolean;
  onSelectSlot: (iso: string) => void;
  onEnterPropose: () => void;
  onExitPropose: () => void;
  customDate: string;
  customTime: string;
  customNotes: string;
  onCustomDateChange: (value: string) => void;
  onCustomTimeChange: (value: string) => void;
  onCustomNotesChange: (value: string) => void;
  minProposeDate: string;
  maxProposeDate: string;
  showLeadWarning: boolean;
  showWindowWarning: boolean;
  /** Whether the salon has the waitlist turned on — hides the CTA otherwise. */
  waitlistEnabled: boolean;
  onJoinWaitlist: () => void;
}

export function TimeSlotPicker({
  slotsLoading,
  displaySlots,
  startISO,
  proposeMode,
  onSelectSlot,
  onEnterPropose,
  onExitPropose,
  customDate,
  customTime,
  customNotes,
  onCustomDateChange,
  onCustomTimeChange,
  onCustomNotesChange,
  minProposeDate,
  maxProposeDate,
  showLeadWarning,
  showWindowWarning,
  waitlistEnabled,
  onJoinWaitlist,
}: TimeSlotPickerProps) {
  return (
    <Card as="fieldset" className="space-y-3">
      <legend className="px-2 text-sm font-medium">3. Pick a time</legend>
      {slotsLoading ? (
        <p className="text-sm text-neutral-500">Loading times…</p>
      ) : displaySlots.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-neutral-500">
            No openings on that day. Try another date or propose a custom time
            below.
          </p>
          {waitlistEnabled && (
            <button
              type="button"
              onClick={onJoinWaitlist}
              className="text-sm rounded-full border border-brand-soft text-brand px-3 py-1.5 hover:bg-brand-soft"
            >
              Notify me when a spot opens up
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {displaySlots.map((slot) => (
            <button
              key={slot.startISO}
              type="button"
              onClick={() => onSelectSlot(slot.startISO)}
              className={cn(
                "rounded-lg border px-2 py-2 text-sm",
                !proposeMode && startISO === slot.startISO
                  ? "border-brand bg-brand-soft text-brand"
                  : "border-neutral-200 hover:bg-neutral-50"
              )}
            >
              {slot.label}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-neutral-200 pt-3">
        {!proposeMode ? (
          <button
            type="button"
            onClick={onEnterPropose}
            className="text-sm rounded-full border border-brand-soft text-brand px-3 py-1.5 hover:bg-brand-soft"
          >
            None of these work? Propose a custom time
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Propose a custom time</p>
              <button
                type="button"
                onClick={onExitPropose}
                className="text-xs text-neutral-600 underline underline-offset-2"
              >
                Cancel
              </button>
            </div>
            <p className="text-xs text-neutral-500">
              Choose any date/time at least 24 hours from now. We&apos;ll review
              your request and email you to confirm.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="text-sm flex flex-col gap-1">
                Date
                <TextInput
                  type="date"
                  value={customDate}
                  min={minProposeDate}
                  max={maxProposeDate || undefined}
                  onChange={(e) => onCustomDateChange(e.target.value)}
                />
              </label>
              <label className="text-sm flex flex-col gap-1">
                Time
                <PrettyTimeField
                  value={customTime}
                  onChange={onCustomTimeChange}
                  ariaLabel="Proposed time"
                  className="w-full"
                  inputProps={{
                    className: "w-full rounded-lg border border-neutral-300 px-3 py-2",
                  }}
                />
              </label>
            </div>
            <label className="text-sm flex flex-col gap-1">
              Notes (optional)
              <Textarea
                value={customNotes}
                onChange={(e) => onCustomNotesChange(e.target.value)}
                rows={2}
                placeholder="Anything we should know about this request?"
              />
            </label>
            {showLeadWarning && (
              <p className="text-xs text-amber-700">
                Proposed time must be at least 24 hours from now.
              </p>
            )}
            {showWindowWarning && (
              <p className="text-xs text-amber-700">
                That date is further out than we&apos;re currently booking.
                Please choose a sooner date.
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
