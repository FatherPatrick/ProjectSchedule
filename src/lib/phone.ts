/**
 * Convert user-entered phone strings into E.164 (e.g. "+15551234567").
 * Twilio rejects anything else.
 *
 * Defaults to US (+1) when no country code is present, since this app serves
 * a single US-based studio. If the input already starts with `+`, only the
 * digits are kept and prefixed with `+`.
 *
 * Returns null when the result is not a plausible phone number.
 */
export function toE164(input: string, defaultCountry: "US" = "US"): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D+/g, "");
  if (!digits) return null;

  if (hasPlus) {
    // International: keep as-is. Minimum 8 digits (e.g. country + subscriber).
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  if (defaultCountry === "US") {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    return null;
  }

  return null;
}

/** Throwing variant for places that should hard-fail on bad input. */
export function toE164OrThrow(input: string): string {
  const e = toE164(input);
  if (!e) throw new Error(`Invalid phone number: ${input}`);
  return e;
}
