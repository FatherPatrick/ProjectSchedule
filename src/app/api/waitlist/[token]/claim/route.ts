import { NextResponse } from "next/server";
import { claimWaitlistEntry } from "@/lib/domain/waitlist";
import type { WaitlistClaimResponse } from "@/lib/api-types";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const result = await claimWaitlistEntry(token);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    appointmentId: result.appointmentId,
    managementToken: result.managementToken,
    serviceName: result.serviceName,
    whenLabel: result.whenLabel,
  } satisfies WaitlistClaimResponse);
}
