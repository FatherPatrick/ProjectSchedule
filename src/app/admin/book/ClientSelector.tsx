import { Card } from "@/components/Card";
import { TextInput } from "@/components/TextInput";
import { cn } from "@/lib/utils";
import type { ClientLiteDTO } from "@/lib/api-types";
import type { ClientMode } from "./types";

interface ClientSelectorProps {
  mode: ClientMode;
  onModeChange: (mode: ClientMode) => void;
  // Existing-client search (driven by the parent's debounced effect).
  selected: ClientLiteDTO | null;
  query: string;
  results: ClientLiteDTO[];
  searching: boolean;
  onQueryChange: (value: string) => void;
  onSelect: (client: ClientLiteDTO) => void;
  onClearSelected: () => void;
  // New-client fields.
  name: string;
  phone: string;
  smsOptIn: boolean;
  onNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onSmsOptInChange: (value: boolean) => void;
}

export function ClientSelector({
  mode,
  onModeChange,
  selected,
  query,
  results,
  searching,
  onQueryChange,
  onSelect,
  onClearSelected,
  name,
  phone,
  smsOptIn,
  onNameChange,
  onPhoneChange,
  onSmsOptInChange,
}: ClientSelectorProps) {
  return (
    <Card as="fieldset" className="space-y-3">
      <legend className="px-2 text-sm font-medium">Client</legend>
      <div className="inline-flex rounded-full border border-neutral-200 p-0.5 text-sm">
        {(["existing", "new"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            className={cn(
              "rounded-full px-3 py-1 font-medium transition-colors",
              mode === m
                ? "bg-pink-600 text-white"
                : "text-neutral-600 hover:text-pink-700"
            )}
          >
            {m === "existing" ? "Existing client" : "New client"}
          </button>
        ))}
      </div>

      {mode === "existing" ? (
        <div className="space-y-2">
          {selected ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-pink-200 bg-pink-50 p-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{selected.name}</div>
                <div className="text-xs text-neutral-600 truncate">
                  {[selected.email, selected.phone].filter(Boolean).join(" · ")}
                </div>
              </div>
              <button
                type="button"
                onClick={onClearSelected}
                className="text-xs text-pink-700 underline underline-offset-2 shrink-0"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="relative">
              <TextInput
                type="text"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Search by name, email, or phone"
                className="w-full"
              />
              {query.trim() && (
                <ul className="mt-1 max-h-56 overflow-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
                  {searching && results.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-neutral-500">
                      Searching…
                    </li>
                  ) : results.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-neutral-500">
                      No matches. Use “New client” to add them.
                    </li>
                  ) : (
                    results.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => onSelect(c)}
                          className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-pink-50"
                        >
                          <span className="font-medium">{c.name}</span>
                          <span className="text-xs text-neutral-500">
                            {[c.email, c.phone].filter(Boolean).join(" · ")}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <TextInput
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className="w-full"
          />
          <TextInput
            type="tel"
            placeholder="Mobile phone (e.g. +1 555 123 4567)"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            className="w-full"
          />
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={smsOptIn}
              onChange={(e) => onSmsOptInChange(e.target.checked)}
            />
            Client agreed to appointment texts
          </label>
        </div>
      )}
    </Card>
  );
}
