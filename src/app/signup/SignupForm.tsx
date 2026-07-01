"use client";

import { useState } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { TextInput } from "@/components/TextInput";
import { TurnstileWidget } from "@/components/TurnstileWidget";

const RESERVED = new Set([
  "www", "app", "api", "admin", "signup", "assets",
  "help", "support", "blog", "status", "mail",
]);
const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function slugError(slug: string): string | null {
  if (slug.length < 3) return "At least 3 characters required.";
  if (slug.length > 50) return "50 characters maximum.";
  if (!SLUG_RE.test(slug)) return "Lowercase letters, numbers, and hyphens only.";
  if (RESERVED.has(slug)) return "That URL is reserved.";
  return null;
}

export function SignupForm({ baseDomain }: { baseDomain: string }) {
  const [step, setStep] = useState<"details" | "otp">("details");

  // Step 1 fields
  const [salonName, setSalonName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [phone, setPhone] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  // Step 2
  const [otp, setOtp] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewUrl = slug
    ? `${slug}.${baseDomain}`
    : `yoursalon.${baseDomain}`;

  const currentSlugError = slugTouched ? slugError(slug) : null;

  function handleNameChange(val: string) {
    setSalonName(val);
    if (!slugTouched) {
      setSlug(slugify(val));
    }
  }

  function handleSlugChange(val: string) {
    setSlugTouched(true);
    setSlug(val.toLowerCase().replace(/[^a-z0-9-]/g, ""));
  }

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const err = slugError(slug);
    if (err) { setError(err); return; }

    setBusy(true);
    try {
      const res = await fetch("/api/signup/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salonName, slug, phone, captchaToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/signup/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salonName, slug, phone, otp }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      const isLocal =
        baseDomain.startsWith("localhost") ||
        baseDomain.startsWith("127.0.0.1");
      const origin = isLocal
        ? `http://${data.slug}.${baseDomain}`
        : `https://${data.slug}.${baseDomain}`;
      window.location.href = `${origin}/auth/sign-in`;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (step === "otp") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-neutral-600">
          We texted a 6-digit code to <strong>{phone}</strong>.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => { setStep("details"); setOtp(""); setError(null); }}
          >
            Go back
          </button>
        </p>
        <form onSubmit={verifyOtp} className="space-y-3">
          <label className="block text-sm font-medium">Verification code</label>
          <TextInput
            name="otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            placeholder="123456"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            className="w-full tracking-widest text-center text-lg"
          />
          <Button type="submit" fullWidth disabled={busy || otp.length !== 6}>
            {busy ? "Creating your salon…" : "Verify and create salon"}
          </Button>
        </form>
        {error && (
          <Alert tone="error" role="alert" className="rounded-lg px-3 py-2">
            {error}
          </Alert>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={requestOtp} className="space-y-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium">Salon name</label>
          <TextInput
            name="salonName"
            type="text"
            required
            placeholder="Polished Nail Studio"
            value={salonName}
            onChange={(e) => handleNameChange(e.target.value)}
            className="w-full"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium">Your booking URL</label>
          <div className="flex items-center gap-1">
            <TextInput
              name="slug"
              type="text"
              required
              placeholder="yoursalon"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              onBlur={() => setSlugTouched(true)}
              className="w-full"
            />
            <span className="shrink-0 text-sm text-neutral-500">.{baseDomain}</span>
          </div>
          {currentSlugError ? (
            <p className="text-xs text-red-600">{currentSlugError}</p>
          ) : slug.length >= 3 ? (
            <p className="text-xs text-neutral-500">
              Your clients will book at{" "}
              <span className="font-mono">{previewUrl}</span>
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium">Your phone number</label>
          <TextInput
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            placeholder="(555) 123-4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full"
          />
          <p className="text-xs text-neutral-500">
            We&apos;ll text you a code to verify, then you&apos;ll use this number to sign in.
          </p>
        </div>

        <TurnstileWidget onVerify={setCaptchaToken} onExpire={() => setCaptchaToken(null)} />

        <Button
          type="submit"
          fullWidth
          disabled={busy || !!slugError(slug) || !salonName.trim() || !phone.trim()}
        >
          {busy ? "Sending code…" : "Text me a verification code"}
        </Button>
      </form>

      {error && (
        <Alert tone="error" role="alert" className="rounded-lg px-3 py-2">
          {error}
        </Alert>
      )}
    </div>
  );
}
