import { prisma } from "../db/prisma";

/** Sane ceiling on how many extra services one visit can bundle in. */
export const MAX_ADD_ON_SERVICES = 4;

export interface AddOnServiceLite {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
}

/**
 * Validate and load the add-on services for a multi-service booking
 * (docs/FEATURE_OPPORTUNITIES_SPEC.md #6). Returns `null` if any id is
 * invalid: not found, inactive, belongs to another salon, duplicated, or
 * repeats the primary service.
 */
export async function resolveAddOnServices(
  salonId: string,
  primaryServiceId: string,
  addOnServiceIds: string[] | undefined
): Promise<AddOnServiceLite[] | null> {
  if (!addOnServiceIds || addOnServiceIds.length === 0) return [];
  if (addOnServiceIds.length > MAX_ADD_ON_SERVICES) return null;

  const unique = new Set(addOnServiceIds);
  if (unique.size !== addOnServiceIds.length) return null;
  if (unique.has(primaryServiceId)) return null;

  const services = await prisma.service.findMany({
    where: { id: { in: [...unique] }, salonId, active: true },
    select: { id: true, name: true, durationMinutes: true, priceCents: true },
  });
  if (services.length !== unique.size) return null;

  return services;
}

export function totalDurationMinutes(
  primary: { durationMinutes: number },
  addOns: AddOnServiceLite[]
): number {
  return primary.durationMinutes + addOns.reduce((sum, s) => sum + s.durationMinutes, 0);
}

export function totalPriceCents(
  primary: { priceCents: number },
  addOns: AddOnServiceLite[]
): number {
  return primary.priceCents + addOns.reduce((sum, s) => sum + s.priceCents, 0);
}

/**
 * Creates an `Appointment` plus its `AppointmentAddOn` rows and — when the
 * booking is paid for out of a prepaid package
 * (docs/FEATURE_OPPORTUNITIES_SPEC.md #7) — draws down that package's
 * session count, all atomically. A failure partway through never leaves an
 * appointment with a silently incomplete service list or a package
 * over/under-counted. Shared by all three booking-creation routes (public
 * book, public propose, admin book). `appointmentData.clientPackageId`
 * should already be set by the caller when `redeemPackageId` is given —
 * this only handles the session-count side effect.
 */
export async function createAppointmentWithAddOns(
  appointmentData: Parameters<typeof prisma.appointment.create>[0]["data"],
  addOns: AddOnServiceLite[],
  redeemPackageId?: string
) {
  return prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.create({ data: appointmentData });
    if (addOns.length > 0) {
      await tx.appointmentAddOn.createMany({
        data: addOns.map((a, i) => ({
          appointmentId: appointment.id,
          serviceId: a.id,
          sortOrder: i,
        })),
      });
    }
    if (redeemPackageId) {
      await tx.clientPackage.update({
        where: { id: redeemPackageId },
        data: { sessionsUsed: { increment: 1 } },
      });
    }
    return appointment;
  });
}
