"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

interface ColorFieldProps {
  name: string;
  label: string;
  defaultValue: string;
  onChange?: (hex: string) => void;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * A guided color control: a native color-picker swatch paired with an
 * editable hex text field, kept in sync. The text field carries the form
 * field `name` so either input method posts the same value.
 */
export function ColorField({ name, label, defaultValue, onChange }: ColorFieldProps) {
  const [value, setValue] = useState(defaultValue);
  const id = useId();

  function update(next: string) {
    setValue(next);
    if (HEX_RE.test(next)) onChange?.(next);
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="w-28 shrink-0 text-sm font-medium text-neutral-700">
        {label}
      </label>
      <input
        type="color"
        value={HEX_RE.test(value) ? value : defaultValue}
        onChange={(e) => update(e.target.value)}
        aria-label={`${label} color picker`}
        className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-neutral-300 p-0.5"
      />
      <input
        id={id}
        type="text"
        name={name}
        value={value}
        onChange={(e) => update(e.target.value)}
        pattern="^#[0-9a-fA-F]{6}$"
        maxLength={7}
        className={cn(
          "w-28 rounded-lg border px-2 py-1.5 text-sm font-mono",
          HEX_RE.test(value) ? "border-neutral-300" : "border-red-300 bg-red-50"
        )}
        aria-label={`${label} hex value`}
      />
    </div>
  );
}
