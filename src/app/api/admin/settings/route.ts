import { NextResponse } from "next/server";
import { withAdmin, withAdminJson } from "@/lib/http/withAdmin";
import { getSettings, updateSettings } from "@/lib/domain/settings";
import { getAdminSalonId } from "@/lib/domain/salon";
import { settingsUpdateSchema } from "@/lib/validation/adminJson";
import type { AppSettingsResponse } from "@/lib/api-types";

export const GET = withAdmin(async () => {
  const salonId = await getAdminSalonId();
  const s = await getSettings(salonId);
  return NextResponse.json({ data: s } satisfies AppSettingsResponse);
});

export const PUT = withAdminJson(settingsUpdateSchema, async (data) => {
  const salonId = await getAdminSalonId();
  await updateSettings(salonId, data);
  const fresh = await getSettings(salonId);
  return NextResponse.json({ data: fresh } satisfies AppSettingsResponse);
});
