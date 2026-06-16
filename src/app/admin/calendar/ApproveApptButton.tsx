"use client";

import { Button } from "@/components/Button";
import { useAdminAction } from "@/app/admin/useAdminAction";

export function ApproveApptButton({
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
        variant="success"
        size="sm"
        disabled={pending}
        aria-label={
          appointmentLabel
            ? `Approve appointment for ${appointmentLabel}`
            : "Approve"
        }
        onClick={() =>
          run({
            request: () =>
              fetch(`/api/admin/appointments/${id}/approve`, {
                method: "POST",
              }),
            success: "Appointment approved.",
            failure: "Could not approve.",
          })
        }
      >
        {pending ? "…" : "Approve"}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-red-700">
          {error}
        </span>
      )}
    </div>
  );
}
