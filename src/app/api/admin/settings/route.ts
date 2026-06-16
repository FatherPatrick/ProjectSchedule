import { NextResponse } from "next/server";
import { withAdmin, withAdminJson } from "@/lib/http/withAdmin";
import { getSettings, updateSettings } from "@/lib/domain/settings";
import { settingsUpdateSchema } from "@/lib/validation/adminJson";
import type { AppSettingsResponse } from "@/lib/api-types";

export const GET = withAdmin(async () => {
  const s = await getSettings();
  return NextResponse.json({ data: s } satisfies AppSettingsResponse);
});

export const PUT = withAdminJson(settingsUpdateSchema, async (data) => {
  await updateSettings(data);
  const fresh = await getSettings();
  return NextResponse.json({ data: fresh } satisfies AppSettingsResponse);
});
