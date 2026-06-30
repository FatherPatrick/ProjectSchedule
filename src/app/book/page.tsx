import { prisma } from "@/lib/db/prisma";
import { getSettings } from "@/lib/domain/settings";
import { getDefaultSalonId } from "@/lib/domain/salon";
import { Alert } from "@/components/Alert";
import { BookingForm } from "./BookingForm";

export const dynamic = "force-dynamic";

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string }>;
}) {
  const { serviceId: initialServiceId } = await searchParams;
  const salonId = await getDefaultSalonId();
  const [services, hours, settings] = await Promise.all([
    prisma.service.findMany({
      where: { salonId, active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.businessHours.findMany({ where: { salonId } }),
    getSettings(salonId),
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
        <Alert tone="warning">
          No services are configured yet. An admin needs to add services
          before bookings can be taken.
        </Alert>
      ) : (
        <BookingForm
          closedDayOfWeek={closedDayOfWeek}
          maxAdvanceDays={settings.maxAdvanceDays}
          initialServiceId={initialServiceId}
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
