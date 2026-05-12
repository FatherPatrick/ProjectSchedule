import { NextResponse } from "next/server";
import { requireAdminEither } from "@/lib/auth/admin";
import { getSettings, updateSettings } from "@/lib/domain/settings";
import { settingsUpdateSchema } from "@/lib/validation/adminJson";

export async function GET(req: Request) {
  if (!(await requireAdminEither(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const s = await getSettings();
  return NextResponse.json({ data: s });
}

export async function PUT(req: Request) {
  if (!(await requireAdminEither(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = settingsUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  await updateSettings(parsed.data);
  const fresh = await getSettings();
  return NextResponse.json({ data: fresh });
}
