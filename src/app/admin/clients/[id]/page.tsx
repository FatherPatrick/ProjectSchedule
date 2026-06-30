import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { formatBiz } from "@/lib/timezone";
import { formatPrice, formatDuration } from "@/lib/utils";
import type { AppointmentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

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
        include: { service: true },
      },
    },
  });

  if (!client) notFound();

  const completed = client.appointments.filter((a) => a.status === "COMPLETED").length;
  const cancelled = client.appointments.filter((a) => a.status === "CANCELLED").length;
  const total = client.appointments.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          href="/admin/clients"
          className="text-sm text-neutral-500 hover:text-pink-600 transition-colors"
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
          Appointment history
        </h2>

        {client.appointments.length === 0 ? (
          <p className="text-sm text-neutral-500">No appointments yet.</p>
        ) : (
          <ul className="space-y-2">
            {client.appointments.map((a) => {
              const badge = STATUS_BADGE[a.status];
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
                      {a.service.name} ·{" "}
                      {formatDuration(a.service.durationMinutes)} ·{" "}
                      {formatPrice(a.service.priceCents)}
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
