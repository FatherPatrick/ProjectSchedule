import { Card } from "@/components/Card";
import { TextInput } from "@/components/TextInput";
import { POLICIES } from "@/lib/policies";

interface ContactFieldsProps {
  name: string;
  phone: string;
  smsOptIn: boolean;
  agree: boolean;
  agreePolicies: boolean;
  onNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onSmsOptInChange: (value: boolean) => void;
  onAgreeChange: (value: boolean) => void;
  onAgreePoliciesChange: (value: boolean) => void;
}

export function ContactFields({
  name,
  phone,
  smsOptIn,
  agree,
  agreePolicies,
  onNameChange,
  onPhoneChange,
  onSmsOptInChange,
  onAgreeChange,
  onAgreePoliciesChange,
}: ContactFieldsProps) {
  return (
    <Card as="fieldset" className="space-y-3">
      <legend className="px-2 text-sm font-medium">4. Your info</legend>
      <TextInput
        required
        placeholder="Full name"
        className="w-full"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
      />
      <TextInput
        required
        type="tel"
        placeholder="Mobile phone (e.g. +1 555 123 4567)"
        className="w-full"
        value={phone}
        onChange={(e) => onPhoneChange(e.target.value)}
      />
      <label className="flex items-start gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          className="mt-1"
          checked={smsOptIn}
          onChange={(e) => onSmsOptInChange(e.target.checked)}
        />
        <span>
          <strong>Yes, text me </strong>appointment confirmations and a reminder
          before my visit at the mobile number above. Message frequency varies;
          msg &amp; data rates may apply. Reply STOP to opt out or HELP for help.
          Consent is not a condition of booking.
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          className="mt-1"
          checked={agree}
          onChange={(e) => onAgreeChange(e.target.checked)}
        />
        <span>
          I agree to the{" "}
          <a href="/terms" className="underline">
            Terms
          </a>
          ,{" "}
          <a href="/privacy" className="underline">
            Privacy Policy
          </a>
          , and{" "}
          <a href="/cancellation-policy" className="underline">
            Cancellation Policy
          </a>
          .
        </span>
      </label>

      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
        <p className="mb-1 text-sm font-medium text-neutral-700">
          Studio policies
        </p>
        <ul className="max-h-44 list-disc space-y-1 overflow-auto pl-5 text-xs text-neutral-600">
          {POLICIES.map((policy) => (
            <li key={policy}>{policy}</li>
          ))}
        </ul>
        <label className="mt-2 flex items-start gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            className="mt-1"
            checked={agreePolicies}
            onChange={(e) => onAgreePoliciesChange(e.target.checked)}
          />
          <span>I have read and agree to the studio policies above.</span>
        </label>
      </div>
    </Card>
  );
}
