import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatBiz } from "@/lib/timezone";
import { CANCELLATION_WINDOW_HOURS } from "@/lib/config";
import { CancelButton } from "./CancelButton";

export const dynamic = "force-dynamic";

export default async function ManageAppointmentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const appt = await prisma.appointment.findUnique({
    where: { managementToken: token },
    include: { service: true, client: true },
  });
  if (!appt) notFound();

  const when = formatBiz(appt.startsAt, "EEEE, MMM d 'at' h:mm a");
  const hoursAway =
    (appt.startsAt.getTime() - Date.now()) / (1000 * 60 * 60);
  const canCancel =
    appt.status === "CONFIRMED" && hoursAway >= CANCELLATION_WINDOW_HOURS;
  const statusLabel =
    appt.status === "PENDING" ? "Pending review" : appt.status;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Your appointment
      </h1>
      <div className="rounded-2xl bg-white border border-neutral-200 p-5 space-y-2">
        <div>
          <span className="text-sm text-neutral-500">Service</span>
          <div className="font-medium">{appt.service.name}</div>
        </div>
        <div>
          <span className="text-sm text-neutral-500">When</span>
          <div className="font-medium">{when}</div>
        </div>
        <div>
          <span className="text-sm text-neutral-500">Status</span>
          <div className="font-medium">{statusLabel}</div>
        </div>
      </div>

      {appt.status === "PENDING" ? (
        <div className="space-y-3">
          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">
            Your proposed time is awaiting review. We&apos;ll email you once
            it&apos;s confirmed or if we need to suggest a different time.
          </p>
          <CancelButton token={token} label="Withdraw request" />
        </div>
      ) : appt.status === "CONFIRMED" ? (
        canCancel ? (
          <CancelButton token={token} />
        ) : (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
            This appointment is within the {CANCELLATION_WINDOW_HOURS}-hour
            cancellation window. Please call the studio to cancel.
          </p>
        )
      ) : (
        <p className="text-sm text-neutral-500">
          This appointment is no longer active.
        </p>
      )}
    </div>
  );
}
