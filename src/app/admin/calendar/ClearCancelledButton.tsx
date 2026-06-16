"use client";

import { Button } from "@/components/Button";
import { useAdminAction } from "@/app/admin/useAdminAction";

/**
 * Deletes every cancelled appointment (all time) after a confirm. `count` is
 * the current cancelled total, shown on the button and in the confirm prompt.
 */
export function ClearCancelledButton({ count }: { count: number }) {
  const { pending, run } = useAdminAction();
  const noun = `cancelled appointment${count === 1 ? "" : "s"}`;

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="py-1.5 text-neutral-600"
      disabled={pending}
      onClick={() => {
        if (
          !window.confirm(
            `Permanently remove ${count} ${noun}? This can't be undone.`
          )
        ) {
          return;
        }
        run({
          request: () =>
            fetch("/api/admin/appointments/clear-cancelled", { method: "POST" }),
          success: async (res) => {
            const j = (await res.json().catch(() => ({}))) as { count?: number };
            const cleared = j.count ?? count;
            return `Cleared ${cleared} cancelled appointment${cleared === 1 ? "" : "s"}.`;
          },
          failure: "Could not clear cancelled appointments.",
        });
      }}
    >
      {pending ? "Clearing…" : `Clear cancelled (${count})`}
    </Button>
  );
}
