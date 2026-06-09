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
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PrettySelectOption<V extends string | number> {
  value: V;
  label: string;
  description?: string;
}

interface PrettySelectProps<V extends string | number> {
  /** Stable form field name. A hidden input is rendered so this works in plain
   * <form action={serverAction}> without needing client state plumbing. */
  name?: string;
  value?: V;
  defaultValue?: V;
  onChange?: (value: V) => void;
  options: ReadonlyArray<PrettySelectOption<V>>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Visual width hint for the trigger; the menu auto-matches trigger width. */
  triggerClassName?: string;
  ariaLabel?: string;
}

/**
 * Lightweight, styled replacement for <select>.
 *
 * - Renders a button trigger that mirrors the native styled inputs, plus a
 *   floating menu portaled into <body> so it isn't clipped by overflow:hidden
 *   ancestors.
 * - Tracks selection internally when uncontrolled and exposes a hidden
 *   <input name=...> so it works inside server-action forms.
 */
export function PrettySelect<V extends string | number>({
  name,
  value,
  defaultValue,
  onChange,
  options,
  placeholder = "Select…",
  disabled,
  className,
  triggerClassName,
  ariaLabel,
}: PrettySelectProps<V>) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState<V | undefined>(defaultValue);
  const current = isControlled ? value : internal;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [menuStyle, setMenuStyle] = useState<{
    top: number;
    left: number;
    width: number;
  }>({ top: 0, left: 0, width: 0 });
  const listboxId = useId();

  const selectedIndex = useMemo(
    () => options.findIndex((o) => o.value === current),
    [options, current]
  );
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const select = useCallback(
    (next: V) => {
      if (!isControlled) setInternal(next);
      onChange?.(next);
      setOpen(false);
      // Return focus to the trigger so keyboard flow stays sane. preventScroll
      // stops the browser from jumping the page to the (already-visible) trigger.
      requestAnimationFrame(() =>
        triggerRef.current?.focus({ preventScroll: true })
      );
    },
    [isControlled, onChange]
  );

  // Position the floating menu under the trigger.
  const positionMenu = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuStyle({
      top: rect.bottom + window.scrollY + 6,
      left: rect.left + window.scrollX,
      width: rect.width,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    positionMenu();
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

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // When opening, set active index to the current selection (or 0).
  // Defer via queueMicrotask so React Compiler doesn't flag a synchronous
  // setState-in-effect cascade.
  useEffect(() => {
    if (open) {
      queueMicrotask(() =>
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
      );
    }
  }, [open, selectedIndex]);

  // Keep the active item visible *within the menu* by adjusting the list's own
  // scrollTop. We deliberately avoid element.scrollIntoView(), which also
  // scrolls every scrollable ancestor (including <body>) and was causing the
  // whole page to jump when a dropdown opened.
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const item = list.querySelectorAll<HTMLElement>("[role='option']")[
      activeIndex
    ];
    if (!item) return;
    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;
    if (itemTop < list.scrollTop) {
      list.scrollTop = itemTop;
    } else if (itemBottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = itemBottom - list.clientHeight;
    }
  }, [open, activeIndex]);

  function onTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (
      e.key === "ArrowDown" ||
      e.key === "ArrowUp" ||
      e.key === "Enter" ||
      e.key === " "
    ) {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onListKeyDown(e: React.KeyboardEvent<HTMLUListElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const opt = options[activeIndex];
      if (opt) select(opt.value);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  // When the listbox opens, move focus into it for keyboard nav. preventScroll
  // stops the browser from scrolling the page toward the portaled menu.
  useEffect(() => {
    if (open) listRef.current?.focus({ preventScroll: true });
  }, [open]);

  // Hidden input that carries the value into <form>. We dispatch a real
  // `input`+`change` event on it whenever the value updates, so listeners
  // (e.g. the UnsavedChangesGuard) can detect changes; a hidden input does
  // not fire those events on its own when React updates `value`.
  const hiddenRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = hiddenRef.current;
    if (!el) return;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, [current]);

  return (
    <div className={cn("relative inline-block", className)}>
      {name !== undefined ? (
        <input
          ref={hiddenRef}
          type="hidden"
          name={name}
          value={current ?? ""}
        />
      ) : null}

      <button
        type="button"
        ref={triggerRef}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          "inline-flex w-full items-center justify-between gap-2 rounded-xl border border-pink-300 bg-gradient-to-b from-white to-pink-50/60 px-3.5 py-2 text-left text-sm text-neutral-800 shadow-sm transition",
          "hover:border-pink-400 hover:from-white hover:to-pink-100",
          "focus:outline-none focus-visible:border-pink-600 focus-visible:ring-2 focus-visible:ring-pink-300/60",
          open && "border-pink-600 ring-2 ring-pink-300/60",
          disabled && "cursor-not-allowed opacity-60",
          triggerClassName
        )}
      >
        <span
          className={cn(
            "truncate",
            !selected && "text-neutral-400 italic font-normal"
          )}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "h-4 w-4 text-pink-600 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={listRef}
              id={listboxId}
              role="listbox"
              aria-label={ariaLabel}
              aria-activedescendant={
                activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
              }
              tabIndex={-1}
              onKeyDown={onListKeyDown}
              style={{
                position: "absolute",
                top: menuStyle.top,
                left: menuStyle.left,
                minWidth: menuStyle.width,
              }}
              className="z-50 max-h-72 overflow-auto rounded-2xl border border-pink-200 bg-white/95 p-1 shadow-xl shadow-pink-200/40 backdrop-blur focus:outline-none"
            >
              {options.map((opt, i) => {
                const isSelected = opt.value === current;
                const isActive = i === activeIndex;
                return (
                  <li
                    key={String(opt.value)}
                    id={`${listboxId}-opt-${i}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIndex(i)}
                    onMouseDown={(e) => {
                      // mousedown to beat the outside-click listener
                      e.preventDefault();
                      select(opt.value);
                    }}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-xl px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-gradient-to-r from-pink-100 to-rose-100 text-pink-900"
                        : "text-neutral-800",
                      isSelected && !isActive && "bg-pink-50 text-pink-900"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center"
                      )}
                    >
                      {isSelected ? (
                        <Check className="h-4 w-4 text-pink-600" />
                      ) : null}
                    </span>
                    <span className="flex-1">
                      <span
                        className={cn(
                          "block",
                          isSelected ? "font-semibold" : "font-medium"
                        )}
                      >
                        {opt.label}
                      </span>
                      {opt.description ? (
                        <span className="block text-xs text-neutral-500">
                          {opt.description}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>,
            document.body
          )
        : null}
    </div>
  );
}
