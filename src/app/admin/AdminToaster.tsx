"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ERROR_MESSAGES, SAVED_MESSAGES } from "@/app/admin/toastMessages";

type ToastKind = "success" | "error";

interface ToastEventDetail {
  kind?: ToastKind;
  message?: string;
}

const EVENT_NAME = "admin:toast";

/** Fire a toast from any admin client component. */
export function notifyAdminToast(detail?: ToastEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastEventDetail>(EVENT_NAME, { detail }));
}

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const DEFAULT_MESSAGES: Record<ToastKind, string> = {
  success: "Changes saved.",
  error: "Something went wrong.",
};

/**
 * Renders toasts triggered either by:
 *  - a `?saved=...` query param on the URL (set by server actions via
 *    `redirect(\"...?saved=...\")`), or
 *  - a CustomEvent dispatched via `notifyAdminToast()` from any client
 *    component after an action succeeds.
 */
export function AdminToaster() {
  return (
    <Suspense fallback={null}>
      <AdminToasterInner />
    </Suspense>
  );
}

function AdminToasterInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Server-action redirects: detect `?saved=...` (any value) or `?error=...`.
  // We defer the setState via queueMicrotask so React Compiler doesn't flag
  // a synchronous setState-in-effect cascade.
  useEffect(() => {
    const saved = searchParams.get("saved");
    const error = searchParams.get("error");
    if (!saved && !error) return;

    const kind: ToastKind = error ? "error" : "success";
    const message = error
      ? ERROR_MESSAGES[error] ?? error
      : (saved && SAVED_MESSAGES[saved]) || DEFAULT_MESSAGES.success;

    const id = Date.now() + Math.random();
    queueMicrotask(() => {
      setToasts((prev) => [...prev, { id, kind, message }]);
    });

    // Strip the params so reloads don't re-fire the toast.
    const next = new URLSearchParams(searchParams.toString());
    next.delete("saved");
    next.delete("error");
    const qs = next.toString();
    router.replace(window.location.pathname + (qs ? `?${qs}` : ""), {
      scroll: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Custom-event dispatch from client buttons.
  useEffect(() => {
    function onToast(e: Event) {
      const detail = (e as CustomEvent<ToastEventDetail>).detail ?? {};
      const kind: ToastKind = detail.kind ?? "success";
      const message = detail.message ?? DEFAULT_MESSAGES[kind];
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, kind, message }]);
    }
    window.addEventListener(EVENT_NAME, onToast as EventListener);
    return () =>
      window.removeEventListener(EVENT_NAME, onToast as EventListener);
  }, []);

  // Auto-dismiss after 3.5s.
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, 3500)
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [toasts]);

  // Render a stable, always-present live region. Adding `aria-live` only
  // when the first toast appears would mean screen readers miss the very
  // first announcement (live regions must exist before content is added).
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2"
    >
      {toasts.map((t) => {
        const isSuccess = t.kind === "success";
        return (
          <div
            key={t.id}
            role="status"
            className={[
              "pointer-events-auto rounded-2xl border px-4 py-3 shadow-xl backdrop-blur transition-all",
              isSuccess
                ? "border-emerald-200 bg-emerald-50/95 text-emerald-900"
                : "border-rose-200 bg-rose-50/95 text-rose-900",
            ].join(" ")}
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className={[
                  "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                  isSuccess
                    ? "bg-emerald-500 text-white"
                    : "bg-rose-500 text-white",
                ].join(" ")}
              >
                {isSuccess ? "✓" : "!"}
              </span>
              <p className="text-sm font-medium">{t.message}</p>
              <button
                type="button"
                aria-label={`Dismiss notification: ${t.message}`}
                onClick={() =>
                  setToasts((prev) => prev.filter((x) => x.id !== t.id))
                }
                className="text-xs underline underline-offset-2"
              >
                Dismiss
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
