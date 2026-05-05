"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface PrettyTimeFieldProps {
  name?: string;
  defaultValue?: string; // HH:MM (24h)
  value?: string; // HH:MM (24h) — controlled
  onChange?: (hhmm: string) => void;
  minuteStep?: number; // default 5
  className?: string;
  disabled?: boolean;
  required?: boolean;
  ariaLabel?: string;
  /** Extra props forwarded to the <input>. */
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parse(hhmm: string | undefined): { h24: number; m: number } {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return { h24: 9, m: 0 };
  const [h, m] = hhmm.split(":").map(Number);
  return { h24: clamp(h || 0, 0, 23), m: clamp(m || 0, 0, 59) };
}

function from24(h24: number) {
  const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { h12, period };
}

function to24(h12: number, period: "AM" | "PM") {
  if (h12 === 12) return period === "AM" ? 0 : 12;
  return period === "AM" ? h12 : h12 + 12;
}

/**
 * Renders a real <input type="time"> (so the closed look exactly matches the
 * rest of the app's globally-styled time inputs) but replaces the native OS
 * picker that drops down with a custom, on-brand popover.
 */
export function PrettyTimeField({
  name,
  defaultValue,
  value,
  onChange,
  minuteStep = 5,
  className,
  disabled,
  required,
  ariaLabel,
  inputProps,
}: PrettyTimeFieldProps) {
  const isControlled = value !== undefined;
  const inputRef = useRef<HTMLInputElement>(null);

  // The input's current value drives state. For uncontrolled mode we keep an
  // internal mirror so the popover updates instantly without waiting on
  // re-render of an external owner.
  const [internalValue, setInternalValue] = useState<string>(
    defaultValue ?? value ?? ""
  );
  const current = isControlled ? value ?? "" : internalValue;
  const { h24, m } = parse(current);
  const { h12, period } = from24(h24);

  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({ top: 0, left: 0, width: 0 });
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  const setValue = useCallback(
    (next: string) => {
      if (!isControlled) setInternalValue(next);
      onChange?.(next);
      // Reflect the value on the underlying input so server-action <form>
      // submissions and uncontrolled consumers see the change immediately.
      const el = inputRef.current;
      if (el && el.value !== next) {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        )?.set;
        setter?.call(el, next);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    },
    [isControlled, onChange]
  );

  const positionMenu = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuStyle({
      top: rect.bottom + window.scrollY + 6,
      left: rect.left + window.scrollX,
      width: Math.max(rect.width, 220),
    });
  }, []);

  useLayoutEffect(() => {
    if (open) positionMenu();
  }, [open, positionMenu]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => positionMenu();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, positionMenu]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (inputRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Suppress the native time picker. Browsers expose `showPicker()` and call
  // it implicitly on focus/click of the calendar indicator. We intercept the
  // pointer events that would trigger it and open our own popover instead.
  // Keyboard editing of the field segments is preserved.
  function suppressNativePicker(e: React.MouseEvent<HTMLInputElement>) {
    if (disabled) return;
    e.preventDefault();
    setOpen((o) => !o);
    // Keep the input focused so keyboard segment editing still works after
    // the popover closes.
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    if (e.key === "ArrowDown" && (e.altKey || e.metaKey)) {
      e.preventDefault();
      setOpen(true);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  }

  const hours = useMemo(
    () => Array.from({ length: 12 }, (_, i) => i + 1), // 1..12
    []
  );
  // Cheap to recompute on each render (~12 items). React Compiler will
  // memoize this automatically; doing it manually here trips the compiler
  // (`m` may be "modified later").
  const step = clamp(Math.floor(minuteStep), 1, 30);
  const minutes: number[] = [];
  for (let v = 0; v < 60; v += step) minutes.push(v);
  if (!minutes.includes(m)) {
    minutes.push(m);
    minutes.sort((a, b) => a - b);
  }

  const updateHour = (newH12: number) => {
    setValue(`${pad(to24(newH12, period))}:${pad(m)}`);
  };
  const updateMinute = (newM: number) => {
    setValue(`${pad(h24)}:${pad(newM)}`);
  };
  const updatePeriod = (newPeriod: "AM" | "PM") => {
    setValue(`${pad(to24(h12, newPeriod))}:${pad(m)}`);
  };

  return (
    <span className={cn("relative inline-block", className)}>
      <input
        ref={inputRef}
        type="time"
        name={name}
        defaultValue={isControlled ? undefined : defaultValue}
        value={isControlled ? value : undefined}
        onChange={(e) => {
          // Allows keyboard segment editing to flow through normally.
          if (!isControlled) setInternalValue(e.target.value);
          onChange?.(e.target.value);
        }}
        onMouseDown={suppressNativePicker}
        onClick={(e) => e.preventDefault()}
        onKeyDown={onInputKeyDown}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-controls={open ? popoverId : undefined}
        className="rounded-lg border border-neutral-300 px-2 py-1"
        {...inputProps}
      />

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              id={popoverId}
              role="dialog"
              aria-label={ariaLabel ?? "Pick time"}
              style={{
                position: "absolute",
                top: menuStyle.top,
                left: menuStyle.left,
                minWidth: menuStyle.width,
              }}
              className="z-50 rounded-2xl border border-pink-200 bg-white/95 p-3 shadow-xl shadow-pink-200/40 backdrop-blur"
            >
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-pink-600">
                  Pick a time
                </p>
                <p className="text-sm font-mono text-neutral-700">
                  {pad(h12)}:{pad(m)}{" "}
                  <span className="text-pink-600 font-semibold">{period}</span>
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <ScrollColumn
                  label="Hour"
                  values={hours}
                  selected={h12}
                  onPick={updateHour}
                />
                <ScrollColumn
                  label="Min"
                  values={minutes}
                  selected={m}
                  onPick={updateMinute}
                />
                <ScrollColumn
                  label="AM/PM"
                  values={["AM", "PM"]}
                  selected={period}
                  onPick={(v) => updatePeriod(v as "AM" | "PM")}
                />
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full px-3 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:from-pink-600 hover:to-rose-600"
                >
                  Done
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </span>
  );
}

function ScrollColumn<V extends string | number>({
  label,
  values,
  selected,
  onPick,
}: {
  label: string;
  values: ReadonlyArray<V>;
  selected: V;
  onPick: (v: V) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const didCenterRef = useRef(false);

  // Center the selected item ONCE, when the column first mounts (i.e. when
  // the popover opens). Re-running this on every selection change — or
  // every parent re-render caused by an unrelated state change — would
  // fight the user's own wheel/touch scrolling and make the list feel
  // un-scrollable. We also scroll the inner list directly instead of using
  // scrollIntoView, which would scroll ancestor scroll containers (the
  // window/body) and cause the page to jump.
  useEffect(() => {
    if (didCenterRef.current) return;
    const list = listRef.current;
    if (!list) return;
    const idx = values.indexOf(selected);
    if (idx < 0) return;
    const item = list.children[idx] as HTMLElement | undefined;
    if (!item) return;
    list.scrollTop =
      item.offsetTop - list.clientHeight / 2 + item.clientHeight / 2;
    didCenterRef.current = true;
  }, [values, selected]);

  return (
    <div className="flex flex-col items-stretch">
      <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
        {label}
      </p>
      <ul
        ref={listRef}
        className="h-44 overflow-y-auto no-scrollbar rounded-xl border border-pink-100 bg-pink-50/30 p-1"
      >
        {values.map((v) => {
          const isSelected = v === selected;
          return (
            <li key={String(v)}>
              <button
                type="button"
                onClick={() => onPick(v)}
                aria-pressed={isSelected}
                className={cn(
                  "block w-full rounded-lg px-2 py-1 text-center text-sm transition-colors",
                  isSelected
                    ? "bg-gradient-to-r from-pink-500 to-rose-500 font-semibold text-white shadow-sm"
                    : "text-neutral-700 hover:bg-pink-100 hover:text-pink-800"
                )}
              >
                {typeof v === "number" ? pad(v) : v}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
