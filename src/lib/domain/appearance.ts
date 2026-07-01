import { put, del } from "@vercel/blob";
import DOMPurify from "isomorphic-dompurify";
import { prisma } from "@/lib/db/prisma";
import { invalidateSalonCache } from "@/lib/domain/salon";
import type { AppearanceUpdate } from "@/lib/validation/adminJson";

export interface Appearance {
  brandColor: string;
  accentColor: string;
  backgroundColor: string;
  fontKey: string;
  logoUrl: string | null;
}

export async function getAppearance(salonId: string): Promise<Appearance> {
  const salon = await prisma.salon.findUniqueOrThrow({
    where: { id: salonId },
    select: {
      brandColor: true,
      accentColor: true,
      backgroundColor: true,
      fontKey: true,
      logoUrl: true,
    },
  });
  return salon;
}

/** Updates the salon's colors/font and evicts the per-slug salon cache so the new theme shows immediately. */
export async function updateAppearance(
  salonId: string,
  patch: AppearanceUpdate
): Promise<void> {
  const salon = await prisma.salon.update({
    where: { id: salonId },
    data: patch,
    select: { slug: true },
  });
  invalidateSalonCache(salon.slug);
}

const LOGO_MAX_BYTES = 1_000_000; // ~1 MB
const ALLOWED_LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

export type LogoUploadError =
  | "invalid_type"
  | "too_large"
  | "sanitize_failed"
  | "empty";

export class LogoUploadValidationError extends Error {
  constructor(public code: LogoUploadError) {
    super(code);
  }
}

/**
 * SVG uploads are accepted but must be sanitized server-side before storage
 * (locked decision — went against the disallow recommendation in
 * docs/STYLING_SPEC.md §5.1). Strips <script>, event handlers,
 * <foreignObject>, and external references; rejects if sanitization
 * strips the root <svg> entirely rather than silently storing garbage.
 */
function sanitizeSvg(raw: string): string {
  const clean = DOMPurify.sanitize(raw, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["foreignObject", "script"],
  });
  if (!/<svg[\s>]/i.test(clean)) {
    throw new LogoUploadValidationError("sanitize_failed");
  }
  return clean;
}

/**
 * Validates, sanitizes (if SVG), and uploads a new salon logo to Vercel
 * Blob, deletes the previous blob (if any) to avoid orphan growth, and
 * saves the resulting URL to `Salon.logoUrl`. Throws
 * {@link LogoUploadValidationError} on invalid input — callers should catch
 * and redirect to a `?error=<code>` toast rather than letting it 500.
 */
export async function uploadLogo(salonId: string, file: File): Promise<string> {
  if (file.size === 0) throw new LogoUploadValidationError("empty");
  if (!ALLOWED_LOGO_TYPES.has(file.type)) {
    throw new LogoUploadValidationError("invalid_type");
  }
  if (file.size > LOGO_MAX_BYTES) {
    throw new LogoUploadValidationError("too_large");
  }

  let body: Blob | string = file;
  let contentType = file.type;
  if (file.type === "image/svg+xml") {
    const raw = await file.text();
    body = sanitizeSvg(raw);
    contentType = "image/svg+xml";
  }

  const salon = await prisma.salon.findUniqueOrThrow({
    where: { id: salonId },
    select: { slug: true, logoUrl: true },
  });

  const ext = file.type === "image/svg+xml" ? "svg" : file.type.split("/")[1];
  const blob = await put(`salon-logos/${salon.slug}-${Date.now()}.${ext}`, body, {
    access: "public",
    contentType,
  });

  if (salon.logoUrl) {
    await del(salon.logoUrl).catch(() => {
      // Best-effort cleanup — an orphaned old blob isn't worth failing the upload over.
    });
  }

  await prisma.salon.update({ where: { id: salonId }, data: { logoUrl: blob.url } });
  invalidateSalonCache(salon.slug);
  return blob.url;
}

export async function removeLogo(salonId: string): Promise<void> {
  const salon = await prisma.salon.findUniqueOrThrow({
    where: { id: salonId },
    select: { slug: true, logoUrl: true },
  });
  if (salon.logoUrl) {
    await del(salon.logoUrl).catch(() => {});
  }
  await prisma.salon.update({ where: { id: salonId }, data: { logoUrl: null } });
  invalidateSalonCache(salon.slug);
}
