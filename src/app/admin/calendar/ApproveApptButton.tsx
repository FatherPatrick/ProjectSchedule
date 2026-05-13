"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { notifyAdminToast } from "@/app/admin/AdminToaster";

export function ApproveApptButton({
  id,
  appointmentLabel,
}: {
  id: string;
  appointmentLabel?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        disabled={pending}
        aria-label={
          appointmentLabel
            ? `Approve appointment for ${appointmentLabel}`
            : "Approve"
        }
        onClick={() => {
          start(async () => {
            const res = await fetch(`/api/admin/appointments/${id}/approve`, {
              method: "POST",
            });
            if (!res.ok) {
              const j = await res.json().catch(() => ({}));
              setErr(j.error ?? "Could not approve.");
              notifyAdminToast({ kind: "error", message: j.error ?? "Could not approve." });
              return;
            }
            router.refresh();
            notifyAdminToast({ message: "Appointment approved." });
          });
        }}
        className="text-sm rounded-full border border-emerald-300 text-emerald-800 px-3 py-1 hover:bg-emerald-50 disabled:opacity-50"
      >
        {pending ? "…" : "Approve"}
      </button>
      {err && (
        <span role="alert" className="text-xs text-red-700">
          {err}
        </span>
      )}
    </div>
  );
}
