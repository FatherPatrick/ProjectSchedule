import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { adminAction } from "@/lib/admin/serverAction";
import { getAdminSalonId } from "@/lib/domain/salon";
import { getSettings } from "@/lib/domain/settings";
import { formatBiz } from "@/lib/timezone";
import { formatPrice, formatDuration } from "@/lib/utils";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PrettySelect } from "@/components/PrettySelect";
import { TextInput } from "@/components/TextInput";
import type { AppointmentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

async function sellPackage(clientId: string, formData: FormData) {
  "use server";
  await adminAction(`/admin/clients/${clientId}`, "package-sold", async () => {
    const salonId = await getAdminSalonId();
    const packageId = String(formData.get("packageId") ?? "").trim();
    const priceRaw = String(formData.get("priceDollars") ?? "").trim();
    if (!packageId) throw new Error("Choose a package.");

    const pkg = await prisma.package.findUnique({ where: { id: packageId } });
    if (!pkg || pkg.salonId !== salonId || !pkg.active) {
      throw new Error("Choose a valid package.");
    }
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client || client.salonId !== salonId) throw new Error("Client not found.");

    // Blank price = charged the package's list price; a discounted/comped
    // sale can still be recorded by entering a different amount.
    const paidCents = priceRaw ? Math.round(Number(priceRaw) * 100) : pkg.priceCents;
    if (!Number.isFinite(paidCents) || paidCents < 0) {
      throw new Error("Enter a valid price.");
    }

    await prisma.clientPackage.create({
      data: {
        salonId,
        clientId,
        packageId,
        sessionsTotal: pkg.totalSessions,
        paidCents,
      },
    });
  });
}

async function redeemReward(clientId: string, rewardId: string) {
  "use server";
  await adminAction(`/admin/clients/${clientId}`, "reward-redeemed", async () => {
    const salonId = await getAdminSalonId();
    const reward = await prisma.loyaltyReward.findUnique({ where: { id: rewardId } });
    if (!reward || reward.salonId !== salonId || reward.clientId !== clientId) {
      throw new Error("Reward not found.");
    }
    if (reward.redeemedAt) return; // already redeemed — no-op
    await prisma.loyaltyReward.update({ where: { id: rewardId }, data: { redeemedAt: new Date() } });
  });
}

const STATUS_BADGE: Record<AppointmentStatus, { label: string; className: string }> = {
  CONFIRMED: {
    label: "Confirmed",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  CANCELLED: {
    label: "Cancelled",
    className: "bg-red-50 text-red-700 border-red-200",
  },
  PENDING: {
    label: "Pending",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  PENDING_PAYMENT: {
    label: "Awaiting payment",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  NO_SHOW: {
    label: "No-show",
    className: "bg-orange-50 text-orange-700 border-orange-200",
  },
};

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      appointments: {
        orderBy: { startsAt: "desc" },
        include: {
          service: true,
          addOns: { include: { service: true }, orderBy: { sortOrder: "asc" } },
          clientPackage: { select: { package: { select: { name: true } } } },
        },
      },
      clientPackages: {
        orderBy: { purchasedAt: "desc" },
        include: { package: { select: { name: true, service: { select: { name: true } } } } },
      },
    },
  });

  if (!client) notFound();

  const salonId = await getAdminSalonId();
  const [sellablePackages, settings, stampCount, rewards] = await Promise.all([
    prisma.package.findMany({
      where: { salonId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, priceCents: true },
    }),
    getSettings(salonId),
    prisma.loyaltyStamp.count({ where: { salonId, clientId: id } }),
    prisma.loyaltyReward.findMany({
      where: { salonId, clientId: id },
      orderBy: { earnedAt: "desc" },
    }),
  ]);
  const rewardCount = rewards.length;
  const stampsTowardNext = settings.loyaltyEnabled
    ? stampCount - rewardCount * settings.loyaltyStampsRequired
    : 0;
  const unredeemedRewards = rewards.filter((r) => !r.redeemedAt);

  const completed = client.appointments.filter((a) => a.status === "COMPLETED").length;
  const cancelled = client.appointments.filter((a) => a.status === "CANCELLED").length;
  const total = client.appointments.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          href="/admin/clients"
          className="text-sm text-neutral-500 hover:text-brand transition-colors"
        >
          ← Clients
        </Link>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-neutral-600">
          {client.email && <span>{client.email}</span>}
          {client.phone && <span>{client.phone}</span>}
        </div>
        {client.notes && (
          <p className="text-sm text-neutral-500 italic">&ldquo;{client.notes}&rdquo;</p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              client.emailOptIn
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-neutral-200 bg-neutral-50 text-neutral-500 line-through"
            }`}
          >
            Email {client.emailOptIn ? "on" : "off"}
          </span>
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              client.smsOptIn
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-neutral-200 bg-neutral-50 text-neutral-500 line-through"
            }`}
          >
            SMS {client.smsOptIn ? "on" : "off"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total", value: total },
          { label: "Completed", value: completed },
          { label: "Cancelled", value: cancelled },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-2xl border border-neutral-200 bg-white p-4 text-center"
          >
            <div className="text-2xl font-semibold">{value}</div>
            <div className="text-xs text-neutral-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-neutral-500 mb-2 uppercase tracking-wide">
          Packages
        </h2>
        {client.clientPackages.length === 0 ? (
          <p className="text-sm text-neutral-500 mb-3">No packages purchased.</p>
        ) : (
          <ul className="space-y-2 mb-3">
            {client.clientPackages.map((cp) => (
              <li
                key={cp.id}
                className="rounded-xl border border-neutral-200 bg-white p-3 flex flex-wrap items-center justify-between gap-2"
              >
                <div>
                  <div className="font-medium">{cp.package.name}</div>
                  <div className="text-sm text-neutral-500">
                    {cp.package.service.name} · purchased{" "}
                    {formatBiz(cp.purchasedAt, "MMM d, yyyy")} · paid{" "}
                    {formatPrice(cp.paidCents)}
                  </div>
                </div>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium shrink-0 ${
                    cp.sessionsUsed >= cp.sessionsTotal
                      ? "border-neutral-200 bg-neutral-50 text-neutral-500"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {cp.sessionsUsed} / {cp.sessionsTotal} used
                </span>
              </li>
            ))}
          </ul>
        )}

        {sellablePackages.length > 0 && (
          <Card as="form" action={sellPackage.bind(null, client.id)} className="space-y-2">
            <div className="grid sm:grid-cols-2 gap-2">
              <PrettySelect
                name="packageId"
                ariaLabel="Package to sell"
                defaultValue={sellablePackages[0]?.id ?? ""}
                options={sellablePackages.map((p) => ({
                  value: p.id,
                  label: `${p.name} · ${formatPrice(p.priceCents)}`,
                }))}
              />
              <TextInput
                name="priceDollars"
                type="number"
                min={0}
                step="0.01"
                aria-label="Price charged (optional override)"
                placeholder="Price charged (defaults to list price)"
              />
            </div>
            <Button type="submit" size="sm">
              Sell package to {client.name}
            </Button>
          </Card>
        )}
      </div>

      {settings.loyaltyEnabled && (
        <div>
          <h2 className="text-sm font-semibold text-neutral-500 mb-2 uppercase tracking-wide">
            Loyalty
          </h2>
          <div className="rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-600 mb-2">
            {Math.max(stampsTowardNext, 0)} / {settings.loyaltyStampsRequired} stamps toward the
            next reward
          </div>
          {unredeemedRewards.length > 0 && (
            <ul className="space-y-2">
              {unredeemedRewards.map((r) => (
                <li
                  key={r.id}
                  className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <div className="font-medium text-emerald-900">{r.description}</div>
                    <div className="text-xs text-emerald-700">
                      Earned {formatBiz(r.earnedAt, "MMM d, yyyy")} · expires{" "}
                      {formatBiz(r.expiresAt, "MMM d, yyyy")}
                    </div>
                  </div>
                  <form action={redeemReward.bind(null, client.id, r.id)}>
                    <Button type="submit" variant="success" size="sm">
                      Mark redeemed
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-neutral-500 mb-2 uppercase tracking-wide">
          Appointment history
        </h2>

        {client.appointments.length === 0 ? (
          <p className="text-sm text-neutral-500">No appointments yet.</p>
        ) : (
          <ul className="space-y-2">
            {client.appointments.map((a) => {
              const badge = STATUS_BADGE[a.status];
              const totalDuration =
                a.service.durationMinutes +
                a.addOns.reduce((sum, x) => sum + x.service.durationMinutes, 0);
              const totalPrice =
                a.service.priceCents + a.addOns.reduce((sum, x) => sum + x.service.priceCents, 0);
              const serviceLabel = [a.service.name, ...a.addOns.map((x) => x.service.name)].join(
                " + "
              );
              return (
                <li
                  key={a.id}
                  className="rounded-xl border border-neutral-200 bg-white p-3 flex flex-wrap items-start justify-between gap-3"
                >
                  <div className="space-y-0.5">
                    <div className="font-medium">
                      {formatBiz(a.startsAt, "EEE, MMM d, yyyy 'at' h:mm a")}
                    </div>
                    <div className="text-sm text-neutral-500">
                      {serviceLabel} · {formatDuration(totalDuration)} ·{" "}
                      {a.clientPackage
                        ? `package: ${a.clientPackage.package.name}`
                        : formatPrice(totalPrice)}
                      {(a.recurrenceRule || a.parentAppointmentId) && " · recurring"}
                    </div>
                    {a.notes && (
                      <div className="text-sm text-neutral-600 italic">
                        &ldquo;{a.notes}&rdquo;
                      </div>
                    )}
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium shrink-0 ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
