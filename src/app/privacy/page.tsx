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
        &ldquo;us&rdquo;) collects, uses, and shares information when you use
        this website to schedule appointments.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Contact information</strong> you provide when booking: name,
          email address, mobile phone number.
        </li>
        <li>
          <strong>Appointment details:</strong> service selected, date, time,
          and any notes you add.
        </li>
        <li>
          <strong>Communication preferences:</strong> whether you have
          opted in to email and SMS notifications.
        </li>
        <li>
          <strong>Technical data:</strong> standard server logs and
          privacy-friendly analytics (page views, device type) that do not
          identify you personally.
        </li>
      </ul>

      <h2>How we use your information</h2>
      <ul>
        <li>To create, manage, and remind you of your appointment.</li>
        <li>To send transactional confirmations and 24-hour reminders.</li>
        <li>
          To comply with legal obligations and to protect our rights and
          safety.
        </li>
      </ul>

      <h2>Sharing</h2>
      <p>
        We share data only with the service providers needed to operate the
        site, such as our hosting provider, database provider, email provider
        (Resend), and SMS provider (Twilio). We do not sell your personal
        information.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>You can reply <strong>STOP</strong> to any text message to opt out of SMS.</li>
        <li>You can request deletion of your data by contacting us.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        Questions? Email us at <a href="mailto:hello@example.com">hello@example.com</a>.
      </p>

      <p className="text-sm text-neutral-500">
        This template is provided as a starting point and is not legal advice.
        Please review with a qualified attorney before publishing.
      </p>
    </article>
  );
}
