import { prisma } from "@/lib/prisma";
import { formatBiz } from "@/lib/timezone";
import { BUSINESS_TIMEZONE } from "@/lib/config";
import { BlackoutPicker, DeleteBlackoutButton } from "./BlackoutPicker";

export const dynamic = "force-dynamic";

export default async function BlackoutsAdmin() {
  const blackouts = await prisma.blackout.findMany({
    where: { endsAt: { gte: new Date() } },
    orderBy: { startsAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Blackout dates</h1>
      <p className="text-sm text-neutral-600">
        Block off vacations, holidays, or partial-day breaks. Times are in the
        business timezone ({BUSINESS_TIMEZONE}).
      </p>

      <BlackoutPicker />

      <div>
        <h2 className="text-sm font-semibold text-neutral-500 mb-2">
          Upcoming blackouts
        </h2>
        <ul className="divide-y divide-neutral-200 rounded-2xl bg-white border border-neutral-200">
          {blackouts.map((b) => {
            const sameDay =
              formatBiz(b.startsAt, "yyyy-MM-dd") ===
              formatBiz(new Date(b.endsAt.getTime() - 1), "yyyy-MM-dd");
            const allDay =
              formatBiz(b.startsAt, "HH:mm") === "00:00" &&
              formatBiz(b.endsAt, "HH:mm") === "00:00";
            return (
              <li
                key={b.id}
                className="p-3 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="font-medium">
                    {allDay
                      ? sameDay
                        ? formatBiz(b.startsAt, "EEEE, MMM d")
                        : `${formatBiz(b.startsAt, "MMM d")} → ${formatBiz(new Date(b.endsAt.getTime() - 1), "MMM d, yyyy")}`
                      : `${formatBiz(b.startsAt, "MMM d, h:mm a")} → ${formatBiz(b.endsAt, "h:mm a")}`}
                  </div>
                  {b.reason && (
                    <div className="text-sm text-neutral-500">{b.reason}</div>
                  )}
                </div>
                <DeleteBlackoutButton id={b.id} />
              </li>
            );
          })}
          {blackouts.length === 0 && (
            <li className="p-4 text-sm text-neutral-500">
              No upcoming blackouts.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
