import { prisma } from "@/lib/prisma";
import { formatBiz } from "@/lib/timezone";
import { CancelApptButton } from "./CancelApptButton";

export const dynamic = "force-dynamic";

export default async function AdminCalendar() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);

  const appts = await prisma.appointment.findMany({
    where: {
      startsAt: { gte: start, lte: end },
      status: { in: ["CONFIRMED", "CANCELLED"] },
    },
    orderBy: { startsAt: "asc" },
    include: { client: true, service: true },
  });

  const grouped = new Map<string, typeof appts>();
  for (const a of appts) {
    const key = formatBiz(a.startsAt, "yyyy-MM-dd");
    if (!grouped.has(key)) grouped.set(key, [] as unknown as typeof appts);
    grouped.get(key)!.push(a);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Calendar (next 30 days)
      </h1>
      {grouped.size === 0 && (
        <p className="text-sm text-neutral-500">No appointments scheduled.</p>
      )}
      {[...grouped.entries()].map(([day, items]) => (
        <section key={day}>
          <h2 className="text-sm font-semibold text-neutral-500 mb-2">
            {formatBiz(items[0].startsAt, "EEEE, MMM d")}
          </h2>
          <ul className="space-y-2">
            {items.map((a) => (
              <li
                key={a.id}
                className="rounded-xl border border-neutral-200 bg-white p-3 flex justify-between items-center gap-3"
              >
                <div>
                  <div className="font-medium">
                    {formatBiz(a.startsAt, "h:mm a")} — {a.client.name}
                  </div>
                  <div className="text-sm text-neutral-500">
                    {a.service.name}
                    {a.status === "CANCELLED" && (
                      <span className="ml-2 text-red-600">(cancelled)</span>
                    )}
                  </div>
                </div>
                {a.status === "CONFIRMED" && (
                  <CancelApptButton id={a.id} />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
