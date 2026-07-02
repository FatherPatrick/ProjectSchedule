import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { formatBiz } from "@/lib/timezone";
import { getAdminSalonId } from "@/lib/domain/salon";
import { getSettings } from "@/lib/domain/settings";
import { Alert } from "@/components/Alert";
import { RemoveWaitlistButton } from "./RemoveWaitlistButton";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  WAITING: "Waiting",
  NOTIFIED: "Notified — offer pending",
};

export default async function WaitlistAdmin() {
  const salonId = await getAdminSalonId();
  const settings = await getSettings(salonId);
  const entries = await prisma.waitlist.findMany({
    where: { salonId, status: { in: ["WAITING", "NOTIFIED"] } },
    include: { client: true, service: true },
    orderBy: [{ service: { name: "asc" } }, { requestedAt: "asc" }],
  });

  const grouped = new Map<string, { serviceName: string; entries: typeof entries }>();
  for (const entry of entries) {
    const group = grouped.get(entry.serviceId);
    if (group) {
      group.entries.push(entry);
    } else {
      grouped.set(entry.serviceId, { serviceName: entry.service.name, entries: [entry] });
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Waitlist</h1>

      {!settings.waitlistEnabled && (
        <Alert tone="info" className="rounded-xl p-3">
          The waitlist is currently off — clients can&apos;t join. Turn it on
          in{" "}
          <Link href="/admin/hours" className="underline">
            Hours &amp; settings
          </Link>
          .
        </Alert>
      )}

      {grouped.size === 0 ? (
        <p className="text-sm text-neutral-500">No one is on the waitlist.</p>
      ) : (
        Array.from(grouped.values()).map(({ serviceName, entries: rows }) => (
          <section key={serviceName}>
            <h2 className="text-sm font-semibold text-neutral-500 mb-2">
              {serviceName} ({rows.length})
            </h2>
            <ul className="space-y-2">
              {rows.map((entry, i) => (
                <li
                  key={entry.id}
                  className="rounded-xl border border-neutral-200 bg-white p-3 flex justify-between items-start gap-3"
                >
                  <div>
                    <div className="font-medium">
                      #{i + 1} {entry.client.name}
                    </div>
                    <div className="text-sm text-neutral-500">
                      {entry.client.email}
                      {entry.client.phone ? ` · ${entry.client.phone}` : ""}
                    </div>
                    <div className="text-sm text-neutral-600 mt-1">
                      {STATUS_LABEL[entry.status] ?? entry.status} · joined{" "}
                      {formatBiz(entry.requestedAt, "MMM d, yyyy")}
                    </div>
                    {entry.status === "NOTIFIED" && entry.offeredStartsAt && (
                      <div className="text-sm text-amber-700 mt-1">
                        Offered {formatBiz(entry.offeredStartsAt, "EEE MMM d, h:mm a")}{" "}
                        — expires {formatBiz(entry.expiresAt, "MMM d, h:mm a")}
                      </div>
                    )}
                  </div>
                  <RemoveWaitlistButton id={entry.id} clientName={entry.client.name} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
