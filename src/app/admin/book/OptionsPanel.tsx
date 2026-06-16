import { Card } from "@/components/Card";
import { Textarea } from "@/components/Textarea";

export function OptionsPanel({
  notify,
  notes,
  onNotifyChange,
  onNotesChange,
}: {
  notify: boolean;
  notes: string;
  onNotifyChange: (value: boolean) => void;
  onNotesChange: (value: string) => void;
}) {
  return (
    <Card as="fieldset" className="space-y-3">
      <legend className="px-2 text-sm font-medium">Options</legend>
      <label className="flex items-start gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          className="mt-1"
          checked={notify}
          onChange={(e) => onNotifyChange(e.target.checked)}
        />
        <span>
          Send the client a confirmation now and a 24-hour reminder. Uncheck to
          book silently.
        </span>
      </label>
      <label className="text-sm flex flex-col gap-1">
        Notes (optional)
        <Textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={2}
          placeholder="Internal note for this appointment"
        />
      </label>
    </Card>
  );
}
