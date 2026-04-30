import { BUSINESS_NAME } from "@/lib/config";

export const metadata = { title: "Terms of Service" };

export default function Terms() {
  return (
    <article className="prose max-w-none">
      <h1>Terms of Service</h1>
      <p>
        <strong>Last updated:</strong> {new Date().toLocaleDateString()}
      </p>
      <p>
        By booking an appointment with {BUSINESS_NAME} through this website,
        you agree to these Terms.
      </p>

      <h2>Booking</h2>
      <p>
        Submitting a booking creates a request that is automatically
        confirmed if the time is available. We may decline or cancel a
        booking at our discretion.
      </p>

      <h2>Communications</h2>
      <p>
        You consent to receive transactional email about your booking. If you
        opt in to SMS, you also consent to receive text messages such as
        confirmations and 24-hour reminders. Reply <strong>STOP</strong> to
        opt out of SMS at any time. Reply <strong>HELP</strong> for help.
        Message and data rates may apply.
      </p>

      <h2>Cancellations and no-shows</h2>
      <p>
        See our <a href="/cancellation-policy">Cancellation Policy</a>. We
        reserve the right to refuse future bookings to repeat no-shows.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        The site is provided &ldquo;as is&rdquo;. To the maximum extent
        allowed by law, we are not liable for indirect or consequential
        damages arising from use of this site.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these Terms from time to time. Continued use of the
        site constitutes acceptance of the updated Terms.
      </p>

      <p className="text-sm text-neutral-500">
        This template is provided as a starting point and is not legal advice.
        Please review with a qualified attorney before publishing.
      </p>
    </article>
  );
}
