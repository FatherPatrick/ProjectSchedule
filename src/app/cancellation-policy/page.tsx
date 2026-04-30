import { BUSINESS_NAME, CANCELLATION_WINDOW_HOURS } from "@/lib/config";

export const metadata = { title: "Cancellation Policy" };

export default function Cancellation() {
  return (
    <article className="prose max-w-none">
      <h1>Cancellation Policy</h1>
      <p>
        We respect your time and ask that you respect ours. Please review our
        cancellation rules below before booking with {BUSINESS_NAME}.
      </p>

      <h2>Self-service cancellations</h2>
      <p>
        You may cancel your appointment online up to{" "}
        <strong>{CANCELLATION_WINDOW_HOURS} hours</strong> before the start
        time using the link in your confirmation email or text.
      </p>

      <h2>Late cancellations</h2>
      <p>
        Inside the {CANCELLATION_WINDOW_HOURS}-hour window, please call or
        text the studio directly so we can do our best to fill the slot.
      </p>

      <h2>No-shows</h2>
      <p>
        Repeated no-shows may result in a deposit being required for future
        bookings, or a refusal to take additional bookings.
      </p>

      <p className="text-sm text-neutral-500">
        This template is provided as a starting point and is not legal advice.
      </p>
    </article>
  );
}
