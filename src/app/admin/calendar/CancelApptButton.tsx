"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { useAdminAction } from "@/app/admin/useAdminAction";

export function CancelApptButton({
  id,
  label = "Cancel",
  appointmentLabel,
}: {
  id: string;
  label?: string;
  /** Optional human-readable appointment description (e.g. "Jane Doe at 3:00 PM")
   *  used to disambiguate this button for screen readers. */
  appointmentLabel?: string;
}) {
  const { pending, error: err, run, clearError } = useAdminAction();
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");

  const isDecline = label === "Decline";

  function submit() {
    const note = message.trim();
    run({
      request: () =>
        fetch(`/api/admin/appointments/${id}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(note ? { message: note } : {}),
        }),
      success: isDecline ? "Request declined." : "Appointment cancelled.",
      failure: "Could not cancel.",
      onSuccess: () => {
        setShowForm(false);
        setMessage("");
      },
    });
  }

  if (showForm) {
    return (
      <div className="flex flex-col items-end gap-2 rounded-lg border border-red-200 bg-red-50 p-2 w-72">
        <label className="w-full text-xs text-red-900">
          Optional message to client (sent via email{" "}
          <span className="opacity-75">/ SMS if opted in</span>):
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            maxLength={280}
            placeholder={
              isDecline
                ? "Sorry, that time doesn’t work — please pick another…"
                : "Sorry, I need to reschedule — please rebook…"
            }
            className="mt-1 w-full rounded-md border border-red-200 bg-white px-2 py-1 text-sm text-neutral-800"
            disabled={pending}
          />
          <span className="mt-0.5 block text-[10px] text-red-700/70">
            {message.trim().length}/280
          </span>
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setShowForm(false);
              setMessage("");
              clearError();
            }}
            className="text-xs rounded-full border border-neutral-300 px-3 py-1 hover:bg-neutral-100 disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={submit}
            className="text-xs rounded-full bg-red-600 text-white px-3 py-1 hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? "…" : isDecline ? "Decline & notify" : "Cancel & notify"}
          </button>
        </div>
        {err && (
          <span role="alert" className="text-xs text-red-700">
            {err}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="danger"
        size="sm"
        disabled={pending}
        aria-label={
          appointmentLabel
            ? `${label} appointment for ${appointmentLabel}`
            : label
        }
        onClick={() => {
          clearError();
          setShowForm(true);
        }}
      >
        {pending ? "…" : label}
      </Button>
      {err && (
        <span role="alert" className="text-xs text-red-700">
          {err}
        </span>
      )}
    </div>
  );
}
