import { notFound, redirect } from "next/navigation";
import { assertAdmin } from "@/lib/auth/admin";
import { getSalonFromContext } from "@/lib/domain/salon";
import { isStripePaymentsEnabled } from "@/lib/flags";
import { salonAppUrl } from "@/lib/config";
import {
  createExpressLoginLink,
  getConnectStatus,
  startConnectOnboarding,
} from "@/lib/domain/stripeConnect";
import { getPaymentsConfig, updatePaymentsConfig } from "@/lib/domain/payments";
import { parsePaymentsConfigForm } from "@/lib/validation/admin";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PaymentsConfigForm } from "./PaymentsConfigForm";

export const dynamic = "force-dynamic";

async function connectStripe() {
  "use server";
  await assertAdmin();
  const salon = await getSalonFromContext();
  if (!salon) throw new Error("No active salon configured.");

  const base = salonAppUrl(salon.slug);
  let url: string;
  try {
    url = await startConnectOnboarding(salon.id, {
      refreshUrl: `${base}/admin/payments`,
      returnUrl: `${base}/admin/payments?saved=stripe_returned`,
    });
  } catch {
    redirect("/admin/payments?error=stripe_connect_failed");
  }
  redirect(url);
}

async function viewPayouts() {
  "use server";
  await assertAdmin();
  const salon = await getSalonFromContext();
  if (!salon) throw new Error("No active salon configured.");

  let url: string;
  try {
    url = await createExpressLoginLink(salon.id);
  } catch {
    redirect("/admin/payments?error=stripe_login_link_failed");
  }
  redirect(url);
}

async function savePaymentsConfig(formData: FormData) {
  "use server";
  await assertAdmin();
  const salon = await getSalonFromContext();
  if (!salon) throw new Error("No active salon configured.");
  const data = parsePaymentsConfigForm(formData);
  try {
    await updatePaymentsConfig(salon.id, data);
  } catch {
    redirect("/admin/payments?error=payments_not_ready");
  }
  redirect("/admin/payments?saved=payments_config");
}

export default async function PaymentsAdmin() {
  if (!isStripePaymentsEnabled()) notFound();

  const salon = await getSalonFromContext();
  if (!salon) throw new Error("No active salon configured.");
  const [status, config] = await Promise.all([
    getConnectStatus(salon.id),
    getPaymentsConfig(salon.id),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-neutral-700">Stripe connection</h2>

        {!status.accountId ? (
          <>
            <p className="text-sm text-neutral-600">
              Connect a Stripe account to start collecting deposits or full
              payment at booking.
            </p>
            <form action={connectStripe}>
              <Button type="submit">Connect Stripe</Button>
            </form>
          </>
        ) : status.chargesEnabled ? (
          <>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-600" aria-hidden />
              Connected and ready
            </div>
            <form action={viewPayouts}>
              <Button type="submit" variant="secondary" size="sm">
                View payouts on Stripe
              </Button>
            </form>
          </>
        ) : (
          <>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800">
              <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
              Onboarding incomplete
            </div>
            <p className="text-sm text-neutral-600">
              Finish connecting your Stripe account to start accepting online
              payments.
            </p>
            <form action={connectStripe}>
              <Button type="submit">Finish onboarding</Button>
            </form>
          </>
        )}
      </Card>

      <Card as="form" action={savePaymentsConfig} className="space-y-4">
        <h2 className="text-sm font-semibold text-neutral-700">Payment settings</h2>
        <PaymentsConfigForm
          chargesEnabled={status.chargesEnabled}
          paymentsEnabled={config.paymentsEnabled}
          paymentMode={config.paymentMode}
          depositType={config.depositType}
          depositCents={config.depositCents}
          depositPercent={config.depositPercent}
        />
      </Card>
    </div>
  );
}
