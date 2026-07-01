import { redirect } from "next/navigation";
import Image from "next/image";
import { assertAdmin } from "@/lib/auth/admin";
import { adminAction } from "@/lib/admin/serverAction";
import { getAdminSalonId } from "@/lib/domain/salon";
import {
  getAppearance,
  LogoUploadValidationError,
  removeLogo,
  updateAppearance,
  uploadLogo,
} from "@/lib/domain/appearance";
import { parseAppearanceUpdateForm } from "@/lib/validation/admin";
import { CURATED_FONTS } from "@/lib/theme/fonts";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { UnsavedChangesGuard } from "@/components/UnsavedChangesGuard";
import { AppearanceForm } from "./AppearanceForm";

export const dynamic = "force-dynamic";

const FONT_OPTIONS = CURATED_FONTS.map((f) => ({ value: f.key, label: f.label }));

async function saveAppearance(formData: FormData) {
  "use server";
  await adminAction("/admin/appearance", "appearance", async () => {
    const salonId = await getAdminSalonId();
    const data = parseAppearanceUpdateForm(formData);
    await updateAppearance(salonId, data);
  });
}

async function saveLogo(formData: FormData) {
  "use server";
  await assertAdmin();
  const salonId = await getAdminSalonId();
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/admin/appearance?error=logo_empty");
  }
  try {
    await uploadLogo(salonId, file);
  } catch (err) {
    if (err instanceof LogoUploadValidationError) {
      redirect(`/admin/appearance?error=logo_${err.code}`);
    }
    throw err;
  }
  redirect("/admin/appearance?saved=logo");
}

async function deleteLogo() {
  "use server";
  await adminAction("/admin/appearance", "logo_removed", async () => {
    const salonId = await getAdminSalonId();
    await removeLogo(salonId);
  });
}

export default async function AppearanceAdmin() {
  const salonId = await getAdminSalonId();
  const appearance = await getAppearance(salonId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Appearance</h1>

      <Card as="form" action={saveAppearance} className="space-y-4">
        <UnsavedChangesGuard />
        <h2 className="text-sm font-semibold text-neutral-700">Colors &amp; font</h2>
        <AppearanceForm
          brandColor={appearance.brandColor}
          accentColor={appearance.accentColor}
          backgroundColor={appearance.backgroundColor}
          fontKey={appearance.fontKey}
          fontOptions={FONT_OPTIONS}
        />
      </Card>

      <Card as="form" action={saveLogo} className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-700">Logo</h2>
        {appearance.logoUrl ? (
          <div className="flex items-center gap-4">
            <Image
              src={appearance.logoUrl}
              alt="Current logo"
              width={160}
              height={64}
              className="h-12 w-auto max-w-[10rem] rounded-lg border border-neutral-200 object-contain p-1"
            />
            <form action={deleteLogo}>
              <Button type="submit" variant="danger" size="sm">
                Remove logo
              </Button>
            </form>
          </div>
        ) : (
          <p className="text-sm text-neutral-500">
            No logo uploaded — the salon name renders as text in the header.
          </p>
        )}
        <div className="flex items-center gap-2">
          <input
            type="file"
            name="logo"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            required
            className="text-sm"
          />
          <Button type="submit" variant="secondary" size="sm">
            Upload logo
          </Button>
        </div>
        <p className="text-xs text-neutral-500">
          PNG, JPEG, WebP, or SVG. Max 1 MB. SVGs are sanitized on upload.
        </p>
      </Card>
    </div>
  );
}
