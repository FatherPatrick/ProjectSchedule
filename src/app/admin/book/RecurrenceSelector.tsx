import { Card } from "@/components/Card";
import { PrettySelect } from "@/components/PrettySelect";
import type { RecurrenceRule } from "./types";

const RULE_OPTIONS: { value: "" | RecurrenceRule; label: string }[] = [
  { value: "", label: "Doesn't repeat" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "BIWEEKLY", label: "Every 2 weeks" },
  { value: "MONTHLY", label: "Monthly" },
];

const OCCURRENCE_OPTIONS = Array.from({ length: 11 }, (_, i) => {
  const value = String(i + 2); // 2..12
  return { value, label: `${value} visits` };
});

export function RecurrenceSelector({
  rule,
  occurrences,
  disabled,
  onRuleChange,
  onOccurrencesChange,
}: {
  rule: RecurrenceRule | "";
  occurrences: number;
  /** True when add-ons are selected — recurring bookings can't carry add-ons. */
  disabled: boolean;
  onRuleChange: (rule: RecurrenceRule | "") => void;
  onOccurrencesChange: (occurrences: number) => void;
}) {
  return (
    <Card as="fieldset" className="space-y-2">
      <legend className="px-2 text-sm font-medium">Repeat</legend>
      {disabled && (
        <p className="text-xs text-amber-700">
          Remove add-ons to book a repeating series.
        </p>
      )}
      <div className="grid sm:grid-cols-2 gap-2">
        <PrettySelect
          value={rule}
          onChange={(v) => onRuleChange(v as RecurrenceRule | "")}
          ariaLabel="Repeat cadence"
          disabled={disabled}
          options={RULE_OPTIONS}
        />
        {rule && (
          <PrettySelect
            value={String(occurrences)}
            onChange={(v) => onOccurrencesChange(Number(v))}
            ariaLabel="Number of visits"
            options={OCCURRENCE_OPTIONS}
          />
        )}
      </div>
      {rule && (
        <p className="text-xs text-neutral-500">
          Books {occurrences} visits starting at the date/time below. A slot
          that&apos;s already taken is skipped, not booked.
        </p>
      )}
    </Card>
  );
}
