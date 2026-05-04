import { BUSINESS_NAME } from "@/lib/config";

export const metadata = { title: "Privacy Policy" };

export default function Privacy() {
  return (
    <article className="prose max-w-none">
      <h1>Privacy Policy</h1>
      <p>
        <strong>Last updated:</strong> {new Date().toLocaleDateString()}
      </p>
      <p>
        This Privacy Policy describes how {BUSINESS_NAME} (&ldquo;we&rdquo;,
        &ldquo;us&rdquo;, &ldquo;our&rdquo;) collects, uses, and shares
        information when you use this website to schedule appointments and,
        if you opt in, when you receive text messages from us.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Contact information</strong> you provide when booking: name,
          email address, and mobile phone number.
        </li>
        <li>
          <strong>Appointment details:</strong> service selected, date, time,
          and any notes you add.
        </li>
        <li>
          <strong>Communication preferences and consent records:</strong>{" "}
          whether you opted in to email and/or SMS notifications, the date and
          time of that opt-in, and the page on which it was given.
        </li>
        <li>
          <strong>Message activity:</strong> delivery status of email and SMS
          messages we send you, and any keyword replies you send back to us
          (such as STOP, START, or HELP).
        </li>
        <li>
          <strong>Technical data:</strong> standard server logs and
          privacy-friendly analytics (page views, device type) that do not
          identify you personally.
        </li>
      </ul>

      <h2>How we use your information</h2>
      <ul>
        <li>To create, manage, modify, and remind you of your appointment.</li>
        <li>
          To send transactional confirmations, reschedule notices, and 24-hour
          reminders by email and (if opted in) SMS.
        </li>
        <li>
          To respond to questions you send us and to provide customer support.
        </li>
        <li>
          To maintain records of consent and message activity as required by
          telecommunications regulations.
        </li>
        <li>
          To comply with legal obligations and to protect our rights and
          safety.
        </li>
      </ul>

      <h2>SMS / Text messaging program</h2>
      <p>
        If you check the SMS opt-in box during booking, you expressly consent
        to receive text messages from {BUSINESS_NAME} at the mobile number you
        provided. This is a transactional messaging program tied to your
        appointments only.
      </p>
      <ul>
        <li>
          <strong>Program (campaign) name:</strong> {BUSINESS_NAME}{" "}
          appointment notifications.
        </li>
        <li>
          <strong>Message types:</strong> booking confirmations, reschedule or
          cancellation notices, and a 24-hour appointment reminder.
        </li>
        <li>
          <strong>Message frequency:</strong> recurring, but limited &mdash;
          typically 1&ndash;4 messages per appointment. Frequency varies based
          on your bookings.
        </li>
        <li>
          <strong>Cost:</strong> Message and data rates may apply. Check with
          your mobile carrier for details.
        </li>
        <li>
          <strong>Opt out:</strong> Reply <strong>STOP</strong> to any text
          message to unsubscribe. You will receive a single confirmation
          message and no further texts.
        </li>
        <li>
          <strong>Help:</strong> Reply <strong>HELP</strong> to any text
          message, or contact us using the email address below.
        </li>
        <li>
          <strong>Carriers:</strong> Carriers (including but not limited to
          AT&amp;T, T-Mobile, Verizon, and their affiliates) are not liable
          for delayed or undelivered messages.
        </li>
      </ul>
      <p>
        <strong>
          No mobile information will be shared with third parties or
          affiliates for marketing or promotional purposes.
        </strong>{" "}
        Sharing with the subprocessors that help us operate the SMS program
        (described below) is permitted solely so they can deliver the
        messages on our behalf.
      </p>

      <h2>How we share information</h2>
      <p>
        We do not sell your personal information and we do not share your
        mobile number or SMS opt-in data with third parties for their own
        marketing. We share data only with the service providers we use to
        operate this site and your appointments, including:
      </p>
      <ul>
        <li>
          <strong>Hosting and database:</strong> our hosting and database
          providers, used to run the website and store appointment records.
        </li>
        <li>
          <strong>Email delivery:</strong> Resend, used to send transactional
          email.
        </li>
        <li>
          <strong>SMS delivery:</strong> Twilio, used solely to transmit the
          appointment-related text messages described above.
        </li>
      </ul>
      <p>
        These providers act as data processors on our behalf and are
        contractually limited to using the information for the purpose of
        delivering their service to us. We may also disclose information when
        required by law, subpoena, or to protect our rights.
      </p>

      <h2>Data retention</h2>
      <p>
        We retain appointment and contact records for as long as needed to
        provide the service, resolve disputes, and meet legal or accounting
        requirements. SMS consent and opt-out records are retained for the
        period required by applicable telecommunications regulations.
      </p>

      <h2>Security</h2>
      <p>
        We use industry-standard safeguards to protect your information,
        including encryption in transit. No method of transmission or storage
        is 100% secure, and we cannot guarantee absolute security.
      </p>

      <h2>Your choices and rights</h2>
      <ul>
        <li>
          You can opt out of SMS at any time by replying <strong>STOP</strong>{" "}
          to any text message.
        </li>
        <li>
          You can unsubscribe from non-essential email using the link in the
          email or by contacting us.
        </li>
        <li>
          You can request access to, correction of, or deletion of your
          personal information by contacting us at the address below. We will
          respond within the time required by applicable law.
        </li>
      </ul>

      <h2>Children&rsquo;s privacy</h2>
      <p>
        This site and SMS program are intended for individuals 18 years of age
        or older, or for minors with parent or guardian consent. We do not
        knowingly collect personal information from children under 13.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. The &ldquo;Last
        updated&rdquo; date at the top reflects the most recent version.
        Material changes to the SMS program will be communicated before they
        take effect.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this Privacy Policy or the SMS program? Email us at{" "}
        <a href="mailto:hello@example.com">hello@example.com</a>. See also our{" "}
        <a href="/terms">Terms of Service</a>.
      </p>

      <p className="text-sm text-neutral-500">
        This template is provided as a starting point and is not legal advice.
        Please review with a qualified attorney before publishing.
      </p>
    </article>
  );
}
