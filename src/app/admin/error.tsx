"use client";

/**
 * Scoped error boundary for the /admin segment.
 *
 * Without this file, a render-time crash inside any admin page bubbles
 * to `src/app/error.tsx` (the global root boundary), which loses the
 * admin chrome — the user is dumped onto a bare error screen with no
 * nav and no obvious way back into the dashboard. By exporting an
 * `error.tsx` at this segment, Next.js scopes the boundary so the
 * surrounding admin layout (nav + sign-out) stays mounted and the user
 * can recover (Try again) or navigate elsewhere without a hard refresh.
 *
 * Server-side errors that originate inside a route handler don't reach
 * this — those still flow through the API responses + server logs.
 */
import { useEffect } from "react";
import Link from "next/link";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Mirrors the global handler. The `digest` (when present) is
    // Next.js's correlation id between this client surface and the
    // server log line that captured the same throw.
    console.error("[admin]", error);
  }, [error]);

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
      <h2 className="text-lg font-semibold text-rose-900">
        Something went wrong in the admin dashboard
      </h2>
      <p className="mt-2 text-sm text-rose-900">
        {error.message ||
          "We hit an unexpected error. You can try again or jump back to the dashboard."}
        {error.digest ? (
          <span className="ml-1 font-mono text-xs text-rose-700">
            (ref: {error.digest})
          </span>
        ) : null}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
        >
          Try again
        </button>
        <Link
          href="/admin"
          className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-medium text-rose-900 hover:bg-rose-100"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
