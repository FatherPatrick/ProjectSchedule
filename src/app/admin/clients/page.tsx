import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { formatBiz } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const clients = await prisma.client.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { appointments: true } },
      appointments: {
        orderBy: { startsAt: "desc" },
        take: 1,
        select: { startsAt: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>

      {clients.length === 0 ? (
        <p className="text-sm text-neutral-500">No clients yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white">
          {clients.map((c) => {
            const lastAppt = c.appointments[0];
            return (
              <li key={c.id}>
                <Link
                  href={`/admin/clients/${c.id}`}
                  className="flex items-center justify-between gap-3 p-4 hover:bg-neutral-50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-neutral-900 truncate">
                      {c.name}
                    </div>
                    <div className="text-sm text-neutral-500 truncate">
                      {c.email}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </div>
                  </div>
                  <div className="text-right shrink-0 text-sm text-neutral-500">
                    <div>
                      {c._count.appointments === 1
                        ? "1 appointment"
                        : `${c._count.appointments} appointments`}
                    </div>
                    {lastAppt && (
                      <div className="text-xs text-neutral-400">
                        Last: {formatBiz(lastAppt.startsAt, "MMM d, yyyy")}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
