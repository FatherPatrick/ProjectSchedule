"use client";

import { Button } from "@/components/Button";
import { useAdminAction } from "@/app/admin/useAdminAction";

export function RemoveWaitlistButton({
  id,
  clientName,
}: {
  id: string;
  clientName: string;
}) {
  const { pending, run } = useAdminAction();

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Remove ${clientName} from the waitlist?`)) return;
        run({
          request: () => fetch(`/api/admin/waitlist/${id}`, { method: "DELETE" }),
          success: `Removed ${clientName} from the waitlist.`,
          failure: "Could not remove this entry.",
        });
      }}
    >
      {pending ? "Removing…" : "Remove"}
    </Button>
  );
}
