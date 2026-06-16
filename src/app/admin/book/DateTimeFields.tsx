import { PrettyTimeField } from "@/components/PrettyTimeField";
import { Card } from "@/components/Card";
import { TextInput } from "@/components/TextInput";

export function DateTimeFields({
  date,
  time,
  todayKey,
  onDateChange,
  onTimeChange,
}: {
  date: string;
  time: string;
  todayKey: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
}) {
  return (
    <Card as="fieldset" className="space-y-3">
      <legend className="px-2 text-sm font-medium">Date &amp; time</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm flex flex-col gap-1">
          Date
          <TextInput
            type="date"
            value={date}
            min={todayKey}
            onChange={(e) => onDateChange(e.target.value)}
          />
        </label>
        <label className="text-sm flex flex-col gap-1">
          Time
          <PrettyTimeField
            value={time}
            onChange={onTimeChange}
            ariaLabel="Appointment time"
            className="w-full"
            inputProps={{
              className: "w-full rounded-lg border border-neutral-300 px-3 py-2",
            }}
          />
        </label>
      </div>
    </Card>
  );
}
