"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { notifyAdminToast } from "@/app/admin/AdminToaster";

export function CancelApptButton({
  id,
  label = "Cancel",
}: {
  id: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        disabled={pending}
        onClick={() => {
          if (
            !confirm(
              label === "Decline"
                ? "Decline this request?"
                : "Cancel this appointment and notify the client?"
            )
          )
            return;
          start(async () => {
            const res = await fetch(`/api/admin/appointments/${id}/cancel`, {
              method: "POST",
            });
            if (!res.ok) {
              const j = await res.json().catch(() => ({}));
              setErr(j.error ?? "Could not cancel.");
              notifyAdminToast({ kind: "error", message: j.error ?? "Could not cancel." });
              return;
            }
            router.refresh();
            notifyAdminToast({
              message: label === "Decline" ? "Request declined." : "Appointment cancelled.",
            });
          });
        }}
        className="text-sm rounded-full border border-red-200 text-red-700 px-3 py-1 hover:bg-red-50 disabled:opacity-50"
      >
        {pending ? "…" : label}
      </button>
      {err && <span className="text-xs text-red-700">{err}</span>}
    </div>
  );
}
