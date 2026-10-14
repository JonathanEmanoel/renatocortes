-- Additive except permitting a deliberately unknown historical payment method.
-- Existing rows remain NORMAL and are not reclassified or backfilled.
ALTER TABLE "payments" ALTER COLUMN "method" DROP NOT NULL;
ALTER TABLE "payments"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "reconciledAt" TIMESTAMP(3),
  ADD COLUMN "reconciliationKey" TEXT,
  ADD COLUMN "reconciliationEvidence" JSONB;
CREATE UNIQUE INDEX "payments_reconciliationKey_key" ON "payments"("reconciliationKey");
ALTER TABLE "payments" ADD CONSTRAINT "payments_source_check"
  CHECK ("source" IN ('NORMAL', 'LEGACY_ADMIN_RECONCILIATION'));
ALTER TABLE "payments" ADD CONSTRAINT "payments_reconciliation_shape_check" CHECK (
  ("source" = 'NORMAL' AND "method" IS NOT NULL AND "reconciledAt" IS NULL
    AND "reconciliationKey" IS NULL AND "reconciliationEvidence" IS NULL)
  OR
  ("source" = 'LEGACY_ADMIN_RECONCILIATION' AND "method" IS NULL AND "paidAt" IS NULL
    AND "status" = 'PAID' AND "subscriptionId" IS NOT NULL
    AND "appointmentId" IS NULL AND "saleId" IS NULL
    AND "reconciledAt" IS NOT NULL AND "reconciliationKey" IS NOT NULL
    AND "reconciliationEvidence" IS NOT NULL AND jsonb_typeof("reconciliationEvidence") = 'object')
);
