BEGIN;

-- Nullable additions preserve existing appointments and payouts without inventing history.
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "financialSnapshot" JSONB;
ALTER TABLE "subscription_payouts" ADD COLUMN IF NOT EXISTS "operationKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_payouts_operationKey_key" ON "subscription_payouts"("operationKey");

-- Replace only FK policies, preserving all rows and their existing relationships.
ALTER TABLE "subscription_payouts" DROP CONSTRAINT IF EXISTS "subscription_payouts_barberId_fkey";
ALTER TABLE "subscription_payouts" ADD CONSTRAINT "subscription_payouts_barberId_fkey"
  FOREIGN KEY ("barberId") REFERENCES "barbers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_payouts" DROP CONSTRAINT IF EXISTS "subscription_payouts_expenseId_fkey";
ALTER TABLE "subscription_payouts" ADD CONSTRAINT "subscription_payouts_expenseId_fkey"
  FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
