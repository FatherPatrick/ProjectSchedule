import { cn } from "@/lib/utils";

interface BookingResultCardProps {
  done: { when: string; serviceName: string; pending: boolean };
  onReset: () => void;
}

export function BookingResultCard({ done, onReset }: BookingResultCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-6",
        done.pending
          ? "border-amber-200 bg-amber-50"
          : "border-emerald-200 bg-emerald-50"
      )}
    >
      <h2
        className={cn(
          "text-xl font-semibold",
          done.pending ? "text-amber-900" : "text-emerald-900"
        )}
      >
        {done.pending ? "Request received!" : "You're booked!"}
      </h2>
      <p
        className={cn(
          "mt-2",
          done.pending ? "text-amber-900" : "text-emerald-900"
        )}
      >
        {done.pending ? (
          <>
            Your <strong>{done.serviceName}</strong> proposal for{" "}
            <strong>{done.when}</strong> has been sent for review. We&apos;ll
            email you when it&apos;s confirmed or if we need to suggest a
            different time.
          </>
        ) : (
          <>
            Your <strong>{done.serviceName}</strong> appointment is confirmed
            for <strong>{done.when}</strong>. Check your email and texts for
            confirmation and a 24-hour reminder.
          </>
        )}
      </p>
      <div className="mt-4">
        <button
          type="button"
          onClick={onReset}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-medium",
            done.pending
              ? "border-amber-300 text-amber-900 hover:bg-amber-100"
              : "border-emerald-300 text-emerald-900 hover:bg-emerald-100"
          )}
        >
          Book another appointment
        </button>
      </div>
    </div>
  );
}
