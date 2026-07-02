export function AdminBookingResultCard({
  done,
  notify,
  onReset,
}: {
  done: {
    when: string;
    serviceName: string;
    createdCount?: number;
    skippedCount?: number;
  };
  notify: boolean;
  onReset: () => void;
}) {
  const isRecurring = done.createdCount != null;
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
      <h2 className="text-xl font-semibold text-emerald-900">
        Appointment booked
      </h2>
      <p className="mt-2 text-emerald-900">
        <strong>{done.serviceName}</strong> is confirmed for{" "}
        <strong>{done.when}</strong>
        {notify ? " — the client has been notified." : "."}
      </p>
      {isRecurring && (
        <p className="mt-1 text-emerald-900">
          Booked {done.createdCount} visit{done.createdCount === 1 ? "" : "s"}{" "}
          in the series.
          {Boolean(done.skippedCount) &&
            ` ${done.skippedCount} occurrence${done.skippedCount === 1 ? "" : "s"} were skipped because that time was already taken.`}
        </p>
      )}
      <button
        type="button"
        onClick={onReset}
        className="mt-4 rounded-full border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-100"
      >
        Book another
      </button>
    </div>
  );
}
