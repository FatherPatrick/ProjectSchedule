import { prisma } from "@/lib/prisma";
import { formatBiz } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [upcoming, totalUpcoming, totalServices, totalBlackouts] =
    await Promise.all([
      prisma.appointment.findMany({
        where: { status: "CONFIRMED", startsAt: { gte: new Date() } },
        orderBy: { startsAt: "asc" },
        take: 8,
        include: { client: true, service: true },
      }),
      prisma.appointment.count({
        where: { status: "CONFIRMED", startsAt: { gte: new Date() } },
      }),
      prisma.service.count({ where: { active: true } }),
      prisma.blackout.count({ where: { endsAt: { gte: new Date() } } }),
    ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Upcoming" value={totalUpcoming} />
        <Stat label="Active services" value={totalServices} />
        <Stat label="Blackouts" value={totalBlackouts} />
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-2">Next appointments</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-neutral-500">No upcoming appointments.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-2xl bg-white border border-neutral-200">
            {upcoming.map((a) => (
              <li key={a.id} className="p-3 flex justify-between gap-3">
                <div>
                  <div className="font-medium">{a.client.name}</div>
                  <div className="text-sm text-neutral-500">
                    {a.service.name}
                  </div>
                </div>
                <div className="text-right text-sm">
                  {formatBiz(a.startsAt, "EEE, MMM d")}
                  <div className="text-neutral-500">
                    {formatBiz(a.startsAt, "h:mm a")}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white border border-neutral-200 p-3 text-center">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );
}
