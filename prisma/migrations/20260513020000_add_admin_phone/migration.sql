-- DB-managed admin allow-list. The legacy `ADMIN_PHONES` env still
-- works (it's now the bootstrap fallback) so existing deployments don't
-- need a data migration before this rolls out.
CREATE TABLE "AdminPhone" (
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "AdminPhone_pkey" PRIMARY KEY ("phone")
);

CREATE INDEX "AdminPhone_createdById_idx" ON "AdminPhone"("createdById");

ALTER TABLE "AdminPhone"
    ADD CONSTRAINT "AdminPhone_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
