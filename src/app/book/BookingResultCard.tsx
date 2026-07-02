import { cn } from "@/lib/utils";

interface BookingResultCardProps {
  done: {
    when: string;
    serviceName: string;
    pending: boolean;
    /** True when this is a waitlist-join confirmation, not a booking. */
    waitlisted?: boolean;
  };
  onReset: () => void;
}

export function BookingResultCard({ done, onReset }: BookingResultCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-6",
        done.waitlisted
          ? "border-brand-soft bg-brand-soft"
          : done.pending
            ? "border-amber-200 bg-amber-50"
            : "border-emerald-200 bg-emerald-50"
      )}
    >
      <h2
        className={cn(
          "text-xl font-semibold",
          done.waitlisted ? "text-brand" : done.pending ? "text-amber-900" : "text-emerald-900"
        )}
      >
        {done.waitlisted ? "You're on the waitlist!" : done.pending ? "Request received!" : "You're booked!"}
      </h2>
      <p
        className={cn(
          "mt-2",
          done.waitlisted ? "text-brand" : done.pending ? "text-amber-900" : "text-emerald-900"
        )}
      >
        {done.waitlisted ? (
          <>
            You&apos;re on the waitlist for <strong>{done.serviceName}</strong>.
            We&apos;ll email/text you a link to claim the spot the moment one
            opens up — first come, first served.
          </>
        ) : done.pending ? (
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
