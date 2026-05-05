"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ServiceRow({
  name,
  active,
  meta,
  description,
  actions,
}: {
  name: string;
  active: boolean;
  meta: string;
  description: string | null;
  actions: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const expandable = Boolean(description);

  return (
    <li className="p-0">
      <div className="p-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => expandable && setOpen((o) => !o)}
          aria-expanded={expandable ? open : undefined}
          disabled={!expandable}
          className={cn(
            "flex-1 text-left rounded-lg -mx-1 px-1 py-0.5",
            expandable && "hover:bg-neutral-50 cursor-pointer",
            !expandable && "cursor-default"
          )}
        >
          <div className="font-medium flex items-center gap-2">
            <span>{name}</span>
            {!active && (
              <span className="text-xs text-neutral-500">(inactive)</span>
            )}
            {expandable && (
              <span
                aria-hidden
                className={cn(
                  "ml-1 text-xs text-neutral-400 transition-transform",
                  open && "rotate-90"
                )}
              >
                ▶
              </span>
            )}
          </div>
          <div className="text-sm text-neutral-500">{meta}</div>
        </button>
        <div className="flex gap-2 shrink-0">{actions}</div>
      </div>
      {expandable && open && (
        <div className="px-3 pb-3 -mt-1 text-sm text-neutral-700 whitespace-pre-line">
          {description}
        </div>
      )}
    </li>
  );
}
