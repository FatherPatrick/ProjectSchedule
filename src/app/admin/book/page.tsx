import { prisma } from "@/lib/db/prisma";
import { AdminBookingForm } from "./AdminBookingForm";

export const dynamic = "force-dynamic";

export default async function AdminBookPage() {
  const services = await prisma.service.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, durationMinutes: true, priceCents: true },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Book for a client
        </h1>
        <p className="text-sm text-neutral-600 mt-1">
          Create a confirmed appointment on a client&apos;s behalf. You can pick
          any future time — business-hours and notice limits don&apos;t apply
          here.
        </p>
      </header>

      {services.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No active services yet. Add a service before booking.
        </div>
      ) : (
        <AdminBookingForm services={services} />
      )}
    </div>
  );
}
