"use client";

import { useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { formatPrice } from "@/lib/utils";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";

interface BookingDone {
  when: string;
  serviceName: string;
  pending: boolean;
}

interface PaymentStepProps {
  clientSecret: string;
  publishableKey: string;
  connectedAccountId: string;
  amountCents: number;
  managementToken: string;
  serviceName: string;
  whenLabel: string;
  /** Whether payment success finalizes to CONFIRMED or PENDING (propose flow). */
  pendingApproval: boolean;
  onConfirmed: (done: BookingDone) => void;
}

/**
 * Embedded Stripe Payment Element (docs/STRIPE_SPEC.md §4.1 — chosen over a
 * Checkout redirect for this mobile-first single-page flow). The connected
 * account id is passed to `loadStripe` so the client talks to the salon's
 * account directly, matching the direct-charge PaymentIntent created
 * server-side.
 */
export function PaymentStep(props: PaymentStepProps) {
  const stripePromise = useMemo(
    () =>
      loadStripe(props.publishableKey, {
        stripeAccount: props.connectedAccountId,
      }),
    [props.publishableKey, props.connectedAccountId]
  );

  return (
    <Elements stripe={stripePromise} options={{ clientSecret: props.clientSecret }}>
      <PaymentForm {...props} />
    </Elements>
  );
}

function PaymentForm({
  amountCents,
  managementToken,
  serviceName,
  whenLabel,
  pendingApproval,
  onConfirmed,
}: PaymentStepProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function pollForWebhookConfirmation() {
    const POLL_MS = 1500;
    const MAX_ATTEMPTS = 10;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      try {
        const res = await fetch(`/api/appointments/${managementToken}/status`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === "CONFIRMED" || data.status === "PENDING") {
            onConfirmed({
              when: data.whenLabel,
              serviceName: data.serviceName,
              pending: data.status === "PENDING",
            });
            return;
          }
        }
      } catch {
        // Network hiccup — just keep polling until MAX_ATTEMPTS.
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    // The webhook hasn't landed yet, but Stripe already reported success on
    // this device — don't leave the client stuck on a spinner. The webhook
    // will still confirm the booking asynchronously either way.
    onConfirmed({ when: whenLabel, serviceName, pending: pendingApproval });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setError(null);
    setSubmitting(true);

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    setSubmitting(false);

    if (confirmError) {
      setError(confirmError.message ?? "Payment failed. Please try again.");
      return;
    }
    if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
      setConfirming(true);
      await pollForWebhookConfirmation();
    } else {
      setError("Payment did not complete. Please try again.");
    }
  }

  if (confirming) {
    return (
      <Alert tone="info" role="status" className="text-center">
        Payment received — confirming your booking…
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <PaymentElement />
      {error && (
        <Alert tone="error" role="alert" className="rounded-xl p-3">
          {error}
        </Alert>
      )}
      <Button type="submit" fullWidth className="py-3" disabled={!stripe || submitting}>
        {submitting ? "Processing…" : `Pay ${formatPrice(amountCents)}`}
      </Button>
    </form>
  );
}
