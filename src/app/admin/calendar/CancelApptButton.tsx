"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function CancelApptButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        disabled={pending}
        onClick={() => {
          if (!confirm("Cancel this appointment and notify the client?")) return;
          start(async () => {
            const res = await fetch(`/api/admin/appointments/${id}/cancel`, {
              method: "POST",
            });
            if (!res.ok) {
              const j = await res.json().catch(() => ({}));
              setErr(j.error ?? "Could not cancel.");
              return;
            }
            router.refresh();
          });
        }}
        className="text-sm rounded-full border border-red-200 text-red-700 px-3 py-1 hover:bg-red-50 disabled:opacity-50"
      >
        {pending ? "…" : "Cancel"}
      </button>
      {err && <span className="text-xs text-red-700">{err}</span>}
    </div>
  );
}
