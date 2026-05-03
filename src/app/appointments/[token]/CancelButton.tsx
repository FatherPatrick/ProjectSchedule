"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CancelButton({
  token,
  label = "Cancel appointment",
}: {
  token: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function cancel() {
    if (
      !confirm(
        label === "Withdraw request"
          ? "Withdraw this request?"
          : "Cancel this appointment?"
      )
    )
      return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/appointments/${token}/cancel`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Could not cancel.");
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={cancel}
        disabled={busy}
        className="rounded-full bg-red-600 text-white px-5 py-2 font-medium disabled:bg-neutral-300"
      >
        {busy ? "Working…" : label}
      </button>
      {err && <p className="text-sm text-red-700">{err}</p>}
    </div>
  );
}
