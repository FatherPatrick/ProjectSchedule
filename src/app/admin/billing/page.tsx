import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { assertAdmin } from "@/lib/auth/admin";
import { getSalonFromContext } from "@/lib/domain/salon";
import { isStripePaymentsEnabled } from "@/lib/flags";
import { getConnectStatus, createExpressLoginLink } from "@/lib/domain/stripeConnect";
import { refundPayment } from "@/lib/domain/payments";
import {
  BILLING_RANGE_OPTIONS,
  getBillingSummary,
  getRevenueByService,
  listPayments,
  resolveBillingRange,
  type BillingRangeKey,
} from "@/lib/domain/billing";
import { formatPrice, cn } from "@/lib/utils";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";

export const dynamic = "force-dynamic";

const RANGE_KEYS = new Set(BILLING_RANGE_OPTIONS.map((o) => o.value));

function isRangeKey(v: string | undefined): v is BillingRangeKey {
  return Boolean(v) && RANGE_KEYS.has(v as BillingRangeKey);
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
    redirect("/admin/billing?error=stripe_login_link_failed");
  }
  redirect(url);
}

async function refundAction(formData: FormData) {
  "use server";
  await assertAdmin();
  const salon = await getSalonFromContext();
  if (!salon) throw new Error("No active salon configured.");

  const paymentId = String(formData.get("paymentId") ?? "");
  const amountDollarsRaw = formData.get("amountDollars");
  const amountDollars = amountDollarsRaw ? Number(amountDollarsRaw) : undefined;
  const amountCents =
    amountDollars && amountDollars > 0 ? Math.round(amountDollars * 100) : undefined;

  const result = await refundPayment(salon.id, paymentId, amountCents);
  if (!result.ok) {
    redirect("/admin/billing?error=refund_failed");
  }
  redirect("/admin/billing?saved=refund_issued");
}

export default async function BillingAdmin({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  if (!isStripePaymentsEnabled()) notFound();

  const { range: rangeParam } = await searchParams;
  const rangeKey: BillingRangeKey = isRangeKey(rangeParam) ? rangeParam : "30d";
  const range = resolveBillingRange(rangeKey);

  const salon = await getSalonFromContext();
  if (!salon) throw new Error("No active salon configured.");

  const [status, summary, byService, payments] = await Promise.all([
    getConnectStatus(salon.id),
    getBillingSummary(salon.id, range),
    getRevenueByService(salon.id, range),
    listPayments(salon.id, range),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <nav className="flex flex-wrap gap-1.5" aria-label="Date range">
          {BILLING_RANGE_OPTIONS.map((opt) => (
            <Link
              key={opt.value}
              href={`/admin/billing?range=${opt.value}`}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                opt.value === rangeKey
                  ? "bg-brand text-brand-contrast"
                  : "border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
              )}
            >
              {opt.label}
            </Link>
          ))}
        </nav>
      </div>

      {!status.chargesEnabled && (
        <Card className="border-amber-200 bg-amber-50 text-sm text-amber-900">
          Stripe payments aren&apos;t fully connected yet. Finish onboarding on the{" "}
          <Link href="/admin/payments" className="underline">
            Payments
          </Link>{" "}
          page to start collecting revenue.
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Gross</p>
          <p className="text-2xl font-semibold text-neutral-900">{formatPrice(summary.grossCents)}</p>
        </Card>
        <Card className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Refunds</p>
          <p className="text-2xl font-semibold text-neutral-900">{formatPrice(summary.refundedCents)}</p>
        </Card>
        <Card className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Platform fee</p>
          <p className="text-2xl font-semibold text-neutral-900">{formatPrice(summary.platformFeeCents)}</p>
        </Card>
        <Card className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Net</p>
          <p className="text-2xl font-semibold text-neutral-900">{formatPrice(summary.netCents)}</p>
        </Card>
      </div>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-700">Payouts</h2>
          {status.accountId && (
            <form action={viewPayouts}>
              <Button type="submit" variant="secondary" size="sm">
                View payouts on Stripe
              </Button>
            </form>
          )}
        </div>
        <p className="text-xs text-neutral-500">
          Balance, payout schedule, and bank details live on Stripe&apos;s side.
        </p>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-700">Revenue by service</h2>
        {byService.length === 0 ? (
          <p className="text-sm text-neutral-500">No payments in this range yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="pb-2">Service</th>
                <th className="pb-2">Payments</th>
                <th className="pb-2 text-right">Gross</th>
              </tr>
            </thead>
            <tbody>
              {byService.map((s) => (
                <tr key={s.serviceName} className="border-t border-neutral-100">
                  <td className="py-2">{s.serviceName}</td>
                  <td className="py-2">{s.count}</td>
                  <td className="py-2 text-right">{formatPrice(s.grossCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-700">Payments</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-neutral-500">No payments in this range yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Client</th>
                  <th className="pb-2">Service</th>
                  <th className="pb-2 text-right">Amount</th>
                  <th className="pb-2 text-right">Refunded</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const remaining = p.amountCents - p.refundedCents;
                  const refundable = p.status === "SUCCEEDED" || p.status === "PARTIALLY_REFUNDED";
                  return (
                    <tr key={p.id} className="border-t border-neutral-100 align-top">
                      <td className="py-2 whitespace-nowrap">
                        {p.createdAt.toLocaleDateString()}
                      </td>
                      <td className="py-2">{p.clientName}</td>
                      <td className="py-2">{p.serviceName}</td>
                      <td className="py-2 text-right">{formatPrice(p.amountCents)}</td>
                      <td className="py-2 text-right">
                        {p.refundedCents > 0 ? formatPrice(p.refundedCents) : "—"}
                      </td>
                      <td className="py-2">{p.status}</td>
                      <td className="py-2">
                        {refundable && remaining > 0 && (
                          <form action={refundAction} className="flex items-center gap-1.5">
                            <input type="hidden" name="paymentId" value={p.id} />
                            <input
                              type="number"
                              name="amountDollars"
                              placeholder={(remaining / 100).toFixed(2)}
                              min={0.5}
                              step={0.01}
                              className="w-20 rounded-lg border border-neutral-300 px-2 py-1 text-xs"
                            />
                            <Button type="submit" variant="danger" size="sm">
                              Refund
                            </Button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-neutral-500">
          Showing the most recent 50 payments in range. Leave the refund amount
          blank for a full refund of what&apos;s left.
        </p>
      </Card>
    </div>
  );
}
