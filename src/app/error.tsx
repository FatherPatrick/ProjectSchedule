"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
        <h1 className="text-xl font-semibold text-rose-900">
          Something went wrong
        </h1>
        <p className="mt-2 text-rose-900">
          We hit an unexpected error. You can try again, or head back home.
        </p>
        <div className="mt-4 flex gap-3">
          <button
            onClick={reset}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-medium text-rose-900 hover:bg-rose-100"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
