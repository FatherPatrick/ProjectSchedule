"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";

export function ClaimButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function claim() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/waitlist/${token}/claim`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not claim this spot.");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={claim} disabled={busy} size="lg">
        {busy ? "Claiming…" : "Claim this spot"}
      </Button>
      {err && <p className="text-sm text-red-700">{err}</p>}
    </div>
  );
}
