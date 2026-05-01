import { prisma } from "@/lib/prisma";
import { BookingForm } from "./BookingForm";

export const dynamic = "force-dynamic";

export default async function BookPage() {
  const [services, hours] = await Promise.all([
    prisma.service.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.businessHours.findMany(),
  ]);

  const openDays = new Set(
    hours
      .filter((h) => h.active && h.openMin < h.closeMin)
      .map((h) => h.dayOfWeek)
  );
  const closedDayOfWeek = [0, 1, 2, 3, 4, 5, 6].filter((d) => !openDays.has(d));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Book an appointment
        </h1>
        <p className="text-sm text-neutral-600 mt-1">
          Select a service, pick a date and time, then enter your contact info.
        </p>
      </header>

      {services.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No services are configured yet. An admin needs to add services
          before bookings can be taken.
        </div>
      ) : (
        <BookingForm
          closedDayOfWeek={closedDayOfWeek}
          services={services.map((s) => ({
            id: s.id,
            name: s.name,
            durationMinutes: s.durationMinutes,
            priceCents: s.priceCents,
            description: s.description,
          }))}
        />
      )}
    </div>
  );
}
