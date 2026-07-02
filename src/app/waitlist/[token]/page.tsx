import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { formatBiz } from "@/lib/timezone";
import { Alert } from "@/components/Alert";
import { ClaimButton } from "./ClaimButton";

export const dynamic = "force-dynamic";

export default async function WaitlistClaimPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const entry = await prisma.waitlist.findUnique({
    where: { claimToken: token },
    include: { service: true, salon: { select: { name: true, timezone: true } } },
  });
  if (!entry) notFound();

  const offeredWhen =
    entry.offeredStartsAt && entry.offeredEndsAt
      ? formatBiz(entry.offeredStartsAt, "EEEE, MMM d 'at' h:mm a", entry.salon.timezone)
      : null;
  const claimable = entry.status === "NOTIFIED" && entry.expiresAt > new Date();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Waitlist spot</h1>
      <div className="rounded-2xl bg-white border border-neutral-200 p-5 space-y-2">
        <div>
          <span className="text-sm text-neutral-500">Service</span>
          <div className="font-medium">{entry.service.name}</div>
        </div>
        {offeredWhen && (
          <div>
            <span className="text-sm text-neutral-500">Offered time</span>
            <div className="font-medium">{offeredWhen}</div>
          </div>
        )}
      </div>

      {claimable ? (
        <ClaimButton token={token} />
      ) : entry.status === "CLAIMED" ? (
        <Alert tone="success" role="status" className="rounded-xl p-3">
          You&apos;ve already claimed this spot — check your email and texts
          for your confirmation.
        </Alert>
      ) : (
        <Alert tone="warning" className="rounded-xl p-3">
          This offer is no longer available. You&apos;re still on the
          waitlist and we&apos;ll reach out again if another spot opens up.
        </Alert>
      )}
    </div>
  );
}
