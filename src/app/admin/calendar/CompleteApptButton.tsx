"use client";

import { Button } from "@/components/Button";
import { useAdminAction } from "@/app/admin/useAdminAction";

export function CompleteApptButton({
  id,
  appointmentLabel,
}: {
  id: string;
  appointmentLabel?: string;
}) {
  const { pending, error, run } = useAdminAction();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending}
        aria-label={
          appointmentLabel
            ? `Mark appointment complete for ${appointmentLabel}`
            : "Mark complete"
        }
        onClick={() =>
          run({
            request: () =>
              fetch(`/api/admin/appointments/${id}/complete`, {
                method: "POST",
              }),
            success: "Appointment marked complete.",
            failure: "Could not mark complete.",
          })
        }
      >
        {pending ? "…" : "Complete"}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-red-700">
          {error}
        </span>
      )}
    </div>
  );
}
