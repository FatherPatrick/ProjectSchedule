import { NextResponse } from "next/server";
import { withAdmin, withAdminJson } from "@/lib/http/withAdmin";
import { requireAdminSalon } from "@/lib/auth/admin";
import { getSettings, updateSettings } from "@/lib/domain/settings";
import { settingsUpdateSchema } from "@/lib/validation/adminJson";
import type { AppSettingsResponse } from "@/lib/api-types";

export const GET = withAdmin(async (req) => {
  const { salonId } = (await requireAdminSalon(req))!;
  const s = await getSettings(salonId);
  return NextResponse.json({ data: s } satisfies AppSettingsResponse);
});

export const PUT = withAdminJson(settingsUpdateSchema, async (data, req) => {
  const { salonId } = (await requireAdminSalon(req))!;
  await updateSettings(salonId, data);
  const fresh = await getSettings(salonId);
  return NextResponse.json({ data: fresh } satisfies AppSettingsResponse);
});
