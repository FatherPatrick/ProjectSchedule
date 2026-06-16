"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { notifyAdminToast } from "@/app/admin/AdminToaster";

interface RunOptions {
  /** Fires the mutation request. */
  request: () => Promise<Response>;
  /**
   * Success toast message. A function form receives the (ok) Response so the
   * message can depend on the parsed body (e.g. "Cleared N appointments").
   */
  success: string | ((res: Response) => string | Promise<string>);
  /** Fallback error message when the response has no `{ error }`. */
  failure?: string;
  /** Runs after a successful response, before the toast (e.g. close a form). */
  onSuccess?: () => void;
}

/**
 * Shared flow for admin client mutation buttons: a pending transition, a local
 * error string, and the fetch → `res.ok` branch → `notifyAdminToast` +
 * `router.refresh()` plumbing that was duplicated across the calendar and
 * blackout action buttons. On failure it surfaces the server's `{ error }`
 * (or `failure`) both as the returned `error` and as an error toast, and skips
 * the refresh.
 */
export function useAdminAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    (opts: RunOptions) => {
      setError(null);
      start(async () => {
        const res = await opts.request();
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          const msg = body.error ?? opts.failure ?? "Something went wrong.";
          setError(msg);
          notifyAdminToast({ kind: "error", message: msg });
          return;
        }
        opts.onSuccess?.();
        const message =
          typeof opts.success === "function"
            ? await opts.success(res)
            : opts.success;
        router.refresh();
        notifyAdminToast({ message });
      });
    },
    [router]
  );

  return { pending, error, run, clearError: () => setError(null) };
}
