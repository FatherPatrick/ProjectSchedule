import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { Card } from "@/components/Card";

type DayPickerProps = React.ComponentProps<typeof DayPicker>;

export function DatePicker({
  selected,
  onSelect,
  disabled,
  modifiers,
  modifiersClassNames,
  endMonth,
}: {
  selected: Date | undefined;
  onSelect: (date: Date | undefined) => void;
  disabled: DayPickerProps["disabled"];
  modifiers: DayPickerProps["modifiers"];
  modifiersClassNames: DayPickerProps["modifiersClassNames"];
  /** Last navigable month — the month of the max-book-out date. Caps forward
   *  paging so users can't scroll into a fully non-bookable month. */
  endMonth?: Date;
}) {
  return (
    <Card as="fieldset">
      <legend className="px-2 text-sm font-medium">2. Pick a date</legend>
      <div className="overflow-x-auto">
        <DayPicker
          mode="single"
          selected={selected}
          onSelect={(d) => onSelect(d)}
          disabled={disabled}
          modifiers={modifiers}
          modifiersClassNames={modifiersClassNames}
          endMonth={endMonth}
          showOutsideDays
          fixedWeeks
        />
        <p className="mt-2 text-xs text-neutral-500">
          Greyed-out days are normally closed. You can still pick one and
          propose a custom time for review.
        </p>
      </div>
    </Card>
  );
}
