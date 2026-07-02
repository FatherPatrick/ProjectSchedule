import { formatDuration, formatPrice, cn } from "@/lib/utils";
import { Card } from "@/components/Card";
import type { ServiceLite } from "./types";

export function AddOnPicker({
  addOns,
  selectedIds,
  onToggle,
}: {
  /** Other active services the client can bundle into the same visit. */
  addOns: ServiceLite[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  if (addOns.length === 0) return null;

  return (
    <Card as="fieldset" className="space-y-2">
      <legend className="px-2 text-sm font-medium">
        2. Add extra services (optional)
      </legend>
      <div className="grid gap-2 sm:grid-cols-2 items-stretch">
        {addOns.map((s) => {
          const checked = selectedIds.includes(s.id);
          return (
            <label
              key={s.id}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3 cursor-pointer min-w-0 h-full",
                checked ? "border-brand bg-brand-soft" : "border-neutral-200"
              )}
            >
              <input
                type="checkbox"
                className="mt-1 shrink-0"
                checked={checked}
                onChange={() => onToggle(s.id)}
              />
              <span className="flex-1 min-w-0">
                <span className="block font-medium break-words">{s.name}</span>
                <span className="block text-xs text-neutral-500">
                  +{formatDuration(s.durationMinutes)} · +{formatPrice(s.priceCents)}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </Card>
  );
}
