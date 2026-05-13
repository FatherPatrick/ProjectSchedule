import { NextResponse } from "next/server";
import { requireAdminEither } from "@/lib/auth/admin";
import { getSettings, updateSettings } from "@/lib/domain/settings";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { settingsUpdateSchema } from "@/lib/validation/adminJson";
import type { AppSettingsResponse } from "@/lib/api-types";

export async function GET(req: Request) {
  if (!(await requireAdminEither(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const s = await getSettings();
  return NextResponse.json({ data: s } satisfies AppSettingsResponse);
}

export async function PUT(req: Request) {
  if (!(await requireAdminEither(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await parseJsonBody(req);
  if (!body.ok) return body.response;
  const parsed = settingsUpdateSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  await updateSettings(parsed.data);
  const fresh = await getSettings();
  return NextResponse.json({ data: fresh } satisfies AppSettingsResponse);
}
