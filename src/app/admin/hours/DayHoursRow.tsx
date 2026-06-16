import { PrettyTimeField } from "@/components/PrettyTimeField";
import { minutesToHhmm } from "@/lib/domain/dates";

interface DayHoursRowProps {
  label: string;
  dayIndex: number;
  active: boolean;
  openMin: number;
  closeMin: number;
  /** When true, use the scheduled-change field names (`s-…`) and aria labels. */
  scheduled?: boolean;
}

/**
 * One weekday's active toggle + open/close time fields. Shared between the
 * default-hours form and the scheduled-change form, which differ only in
 * input name prefix and aria wording. On mobile the Open/Close fields stack
 * vertically and align; from `sm` up they sit inline.
 */
export function DayHoursRow({
  label,
  dayIndex,
  active,
  openMin,
  closeMin,
  scheduled = false,
}: DayHoursRowProps) {
  const prefix = scheduled ? "s-" : "";
  const qualifier = scheduled ? "scheduled " : "";
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-neutral-100 last:border-0 pb-2">
      <label className="w-28 flex items-center gap-2">
        <input
          type="checkbox"
          name={`${prefix}active-${dayIndex}`}
          defaultChecked={active}
        />
        <span className="font-medium">{label}</span>
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        <label className="text-sm flex items-center gap-1">
          <span className="w-12">Open</span>
          <PrettyTimeField
            name={`${prefix}open-${dayIndex}`}
            defaultValue={minutesToHhmm(openMin)}
            ariaLabel={`${label} ${qualifier}open time`}
          />
        </label>
        <label className="text-sm flex items-center gap-1">
          <span className="w-12">Close</span>
          <PrettyTimeField
            name={`${prefix}close-${dayIndex}`}
            defaultValue={minutesToHhmm(closeMin)}
            ariaLabel={`${label} ${qualifier}close time`}
          />
        </label>
      </div>
    </div>
  );
}
