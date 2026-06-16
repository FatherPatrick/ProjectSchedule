"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/Button";
import { TextInput } from "@/components/TextInput";

export function SignInForm({
  callbackUrl,
  devHint,
}: {
  callbackUrl: string;
  devHint: boolean;
}) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Dev-only: when on, ask the server to send a real Twilio Verify text
  // instead of the 000000 bypass. Ignored by the API in production.
  const [devRealSend, setDevRealSend] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          ...(devHint && devRealSend ? { devRealSend: true } : {}),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Could not send code.");
      }
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await signIn("sms-otp", {
        phone,
        code,
        redirect: false,
        callbackUrl,
      });
      if (!res || res.error) {
        throw new Error("Invalid or expired code.");
      }
      window.location.href = res.url ?? callbackUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {step === "phone" ? (
        <form onSubmit={requestCode} className="space-y-2">
          <label className="block text-sm font-medium">Phone number</label>
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
          <Button type="submit" fullWidth disabled={busy}>
            {busy ? "Sending…" : "Text me a code"}
          </Button>
          {devHint && (
            <label className="flex items-center gap-2 pt-1 text-xs text-amber-700">
              <input
                type="checkbox"
                checked={devRealSend}
                onChange={(e) => setDevRealSend(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Send a real text via Twilio (dev)
            </label>
          )}
        </form>
      ) : (
        <form onSubmit={verifyCode} className="space-y-2">
          <p className="text-sm text-neutral-600">
            We texted a 6-digit code to <strong>{phone}</strong>.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => {
                setStep("phone");
                setCode("");
                setError(null);
              }}
            >
              Change number
            </button>
          </p>
          <label className="block text-sm font-medium">Verification code</label>
          <TextInput
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="w-full tracking-widest text-center text-lg"
          />
          <Button type="submit" fullWidth disabled={busy || code.length !== 6}>
            {busy ? "Verifying…" : "Sign in"}
          </Button>
        </form>
      )}

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {devHint && (
        <div className="pt-4 border-t border-dashed border-neutral-300 space-y-1">
          <p className="text-xs uppercase tracking-wide text-amber-700">
            Dev mode
          </p>
          <p className="text-xs text-neutral-600">
            By default Twilio is not called — use any admin phone (env{" "}
            <code>ADMIN_PHONES</code> or an entry in <code>AdminPhone</code>)
            and code <code className="font-mono">000000</code>. Tick{" "}
            <em>Send a real text via Twilio</em> above to receive an actual OTP
            at an admin number (the <code className="font-mono">000000</code>{" "}
            bypass still works too).
          </p>
        </div>
      )}
    </div>
  );
}
