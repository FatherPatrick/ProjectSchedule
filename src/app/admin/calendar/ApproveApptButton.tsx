"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function ApproveApptButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        disabled={pending}
        onClick={() => {
          start(async () => {
            const res = await fetch(`/api/admin/appointments/${id}/approve`, {
              method: "POST",
            });
            if (!res.ok) {
              const j = await res.json().catch(() => ({}));
              setErr(j.error ?? "Could not approve.");
              return;
            }
            router.refresh();
          });
        }}
        className="text-sm rounded-full border border-emerald-300 text-emerald-800 px-3 py-1 hover:bg-emerald-50 disabled:opacity-50"
      >
        {pending ? "…" : "Approve"}
      </button>
      {err && <span className="text-xs text-red-700">{err}</span>}
    </div>
  );
}
