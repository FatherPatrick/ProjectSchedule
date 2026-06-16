import { formatDuration, formatPrice, cn } from "@/lib/utils";
import { Card } from "@/components/Card";
import type { ServiceLite } from "./types";

export function ServicePicker({
  services,
  serviceId,
  onSelect,
}: {
  services: ServiceLite[];
  serviceId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <Card as="fieldset">
      <legend className="px-2 text-sm font-medium">1. Choose a service</legend>
      <div className="grid gap-2 sm:grid-cols-2 items-stretch">
        {services.map((s) => {
          const isSelected = serviceId === s.id;
          return (
            <label
              key={s.id}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3 cursor-pointer min-w-0 h-full",
                isSelected ? "border-pink-600 bg-pink-50" : "border-neutral-200"
              )}
            >
              <input
                type="radio"
                name="service"
                className="mt-1 shrink-0"
                checked={isSelected}
                onChange={() => onSelect(s.id)}
              />
              <span className="flex-1 min-w-0">
                <span className="block font-medium break-words">{s.name}</span>
                <span className="block text-xs text-neutral-500">
                  {formatDuration(s.durationMinutes)} ·{" "}
                  {formatPrice(s.priceCents)}
                </span>
                {isSelected && s.description && (
                  <span className="mt-2 block text-xs text-neutral-700 whitespace-pre-line break-words">
                    {s.description}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </Card>
  );
}
