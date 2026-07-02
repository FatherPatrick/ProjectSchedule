/**
 * Salon-scoped revenue reporting for the admin billing dashboard
 * (docs/STRIPE_SPEC.md §9). Reads local `Payment` rows — reconciled via
 * webhooks — rather than computing live from the Stripe API.
 */
import { prisma } from "@/lib/db/prisma";

export type BillingRangeKey = "today" | "7d" | "30d" | "month" | "all";

export const BILLING_RANGE_OPTIONS: ReadonlyArray<{ value: BillingRangeKey; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
];

export interface DateRange {
  from: Date;
  to: Date;
}

export function resolveBillingRange(key: BillingRangeKey): DateRange {
  const to = new Date();
  switch (key) {
    case "today": {
      const from = new Date(to);
      from.setHours(0, 0, 0, 0);
      return { from, to };
    }
    case "7d":
      return { from: new Date(to.getTime() - 7 * 86_400_000), to };
    case "month":
      return { from: new Date(to.getFullYear(), to.getMonth(), 1), to };
    case "all":
      return { from: new Date(0), to };
    case "30d":
    default:
      return { from: new Date(to.getTime() - 30 * 86_400_000), to };
  }
}

// Reconcilable statuses — a payment that never succeeded (REQUIRES_PAYMENT,
// PROCESSING, FAILED) never collected money and shouldn't count toward revenue.
const COUNTS_TOWARD_REVENUE = ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] as const;

export interface BillingSummary {
  grossCents: number;
  refundedCents: number;
  platformFeeCents: number;
  /**
   * Gross minus refunds minus the platform fee (locked default for the §9
   * open decision — the simpler of the two options: Stripe's own processing
   * fees aren't cleanly knowable per charge without extra API calls, so they
   * aren't subtracted here).
   */
  netCents: number;
  paymentCount: number;
}

export async function getBillingSummary(
  salonId: string,
  range: DateRange
): Promise<BillingSummary> {
  const payments = await prisma.payment.findMany({
    where: {
      salonId,
      createdAt: { gte: range.from, lte: range.to },
      status: { in: [...COUNTS_TOWARD_REVENUE] },
    },
    select: { amountCents: true, refundedCents: true, applicationFeeCents: true },
  });

  const grossCents = payments.reduce((sum, p) => sum + p.amountCents, 0);
  const refundedCents = payments.reduce((sum, p) => sum + p.refundedCents, 0);
  const platformFeeCents = payments.reduce((sum, p) => sum + p.applicationFeeCents, 0);

  return {
    grossCents,
    refundedCents,
    platformFeeCents,
    netCents: grossCents - refundedCents - platformFeeCents,
    paymentCount: payments.length,
  };
}

export interface ServiceRevenue {
  serviceName: string;
  grossCents: number;
  count: number;
}

/**
 * Attributes a multi-service booking's full payment to its primary service
 * only (docs/FEATURE_OPPORTUNITIES_SPEC.md #6) — add-on revenue isn't broken
 * out separately here. `listPayments` below shows the full "Gel Manicure +
 * Pedicure" combo per row for that detail.
 */
export async function getRevenueByService(
  salonId: string,
  range: DateRange
): Promise<ServiceRevenue[]> {
  const payments = await prisma.payment.findMany({
    where: {
      salonId,
      createdAt: { gte: range.from, lte: range.to },
      status: { in: [...COUNTS_TOWARD_REVENUE] },
    },
    select: {
      amountCents: true,
      appointment: { select: { service: { select: { name: true } } } },
    },
  });

  const byService = new Map<string, { grossCents: number; count: number }>();
  for (const p of payments) {
    const name = p.appointment.service.name;
    const entry = byService.get(name) ?? { grossCents: 0, count: 0 };
    entry.grossCents += p.amountCents;
    entry.count += 1;
    byService.set(name, entry);
  }

  return Array.from(byService.entries())
    .map(([serviceName, v]) => ({ serviceName, ...v }))
    .sort((a, b) => b.grossCents - a.grossCents);
}

export interface PaymentRow {
  id: string;
  clientName: string;
  serviceName: string;
  amountCents: number;
  refundedCents: number;
  currency: string;
  status: string;
  createdAt: Date;
  stripePaymentIntentId: string;
}

const PAYMENTS_LIST_LIMIT = 50;

/** Most recent payments in the range, newest first (capped — see admin note in the page). */
export async function listPayments(
  salonId: string,
  range: DateRange
): Promise<PaymentRow[]> {
  const payments = await prisma.payment.findMany({
    where: { salonId, createdAt: { gte: range.from, lte: range.to } },
    orderBy: { createdAt: "desc" },
    take: PAYMENTS_LIST_LIMIT,
    select: {
      id: true,
      amountCents: true,
      refundedCents: true,
      currency: true,
      status: true,
      createdAt: true,
      stripePaymentIntentId: true,
      appointment: {
        select: {
          client: { select: { name: true } },
          service: { select: { name: true } },
          addOns: {
            select: { service: { select: { name: true } } },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });

  return payments.map((p) => ({
    id: p.id,
    clientName: p.appointment.client.name,
    serviceName: [p.appointment.service.name, ...p.appointment.addOns.map((a) => a.service.name)].join(
      " + "
    ),
    amountCents: p.amountCents,
    refundedCents: p.refundedCents,
    currency: p.currency,
    status: p.status,
    createdAt: p.createdAt,
    stripePaymentIntentId: p.stripePaymentIntentId,
  }));
}
