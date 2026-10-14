-- Due date is a payment obligation, not permission to extend a paid cycle.
ALTER TABLE "subscriptions" ADD COLUMN "nextCycleStartDate" TIMESTAMP(3);
ALTER TABLE "subscription_cycles" ADD COLUMN "coverageStartDate" TIMESTAMP(3);
ALTER TABLE "subscription_cycles" ADD CONSTRAINT "subscription_cycles_coverage_check"
  CHECK ("coverageStartDate" IS NULL OR "coverageStartDate" < "endDate");
-- Existing confirmed cycles keep their original dueDate-as-start semantics.
-- Nullable additions require no invented payment or destructive backfill.
