-- Salon appearance theming: expand the single `themeColor` field into a
-- small guided theme (brand/accent/background colors, curated font, logo).
-- `themeColor` is renamed to `backgroundColor` (data-preserving) since it
-- already held the page-background tint; the new columns are additive with
-- defaults matching the current platform look, so existing rows keep
-- rendering exactly as before.

-- RenameColumn
ALTER TABLE "Salon" RENAME COLUMN "themeColor" TO "backgroundColor";

-- AlterTable
ALTER TABLE "Salon" ADD COLUMN "brandColor" TEXT NOT NULL DEFAULT '#db2777';
ALTER TABLE "Salon" ADD COLUMN "accentColor" TEXT NOT NULL DEFAULT '#db2777';
ALTER TABLE "Salon" ADD COLUMN "fontKey" TEXT NOT NULL DEFAULT 'geist';
ALTER TABLE "Salon" ADD COLUMN "logoUrl" TEXT;
