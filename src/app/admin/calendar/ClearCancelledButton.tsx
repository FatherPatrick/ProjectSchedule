"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { notifyAdminToast } from "@/app/admin/AdminToaster";

/**
 * Deletes every cancelled appointment (all time) after a confirm. `count` is
 * the current cancelled total, shown on the button and in the confirm prompt.
 */
export function ClearCancelledButton({ count }: { count: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const noun = `cancelled appointment${count === 1 ? "" : "s"}`;

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (
          !window.confirm(
            `Permanently remove ${count} ${noun}? This can't be undone.`
          )
        ) {
          return;
        }
        start(async () => {
          const res = await fetch(
            "/api/admin/appointments/clear-cancelled",
            { method: "POST" }
          );
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            notifyAdminToast({
              kind: "error",
              message: j.error ?? "Could not clear cancelled appointments.",
            });
            return;
          }
          const j = (await res.json().catch(() => ({}))) as { count?: number };
          router.refresh();
          const cleared = j.count ?? count;
          notifyAdminToast({
            message: `Cleared ${cleared} cancelled appointment${cleared === 1 ? "" : "s"}.`,
          });
        });
      }}
      className="text-sm rounded-full border border-neutral-300 text-neutral-600 px-3 py-1.5 hover:bg-neutral-50 disabled:opacity-50"
    >
      {pending ? "Clearing…" : `Clear cancelled (${count})`}
    </button>
  );
}
