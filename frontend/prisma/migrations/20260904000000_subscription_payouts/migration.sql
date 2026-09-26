DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubscriptionPayoutStatus') THEN
    CREATE TYPE "SubscriptionPayoutStatus" AS ENUM ('PENDING', 'PAID', 'REVIEW');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubscriptionPayoutType') THEN
    CREATE TYPE "SubscriptionPayoutType" AS ENUM ('MAIN', 'ADJUSTMENT');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "subscription_payouts" (
  "id" TEXT NOT NULL,
  "competenceMonth" TEXT NOT NULL,
  "barberId" TEXT NOT NULL,
  "type" "SubscriptionPayoutType" NOT NULL DEFAULT 'MAIN',
  "adjustmentNumber" INTEGER NOT NULL DEFAULT 0,
  "status" "SubscriptionPayoutStatus" NOT NULL DEFAULT 'PENDING',
  "revenueBase" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  "businessShare" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  "poolAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  "totalSubscriberAttendances" INTEGER NOT NULL DEFAULT 0,
  "barberSubscriberAttendances" INTEGER NOT NULL DEFAULT 0,
  "sharePercent" DECIMAL(8,4) NOT NULL DEFAULT 0.0000,
  "calculatedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  "paidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  "paidAt" TIMESTAMP(3),
  "paidById" TEXT,
  "expenseId" TEXT,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "subscription_payouts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "subscription_payouts_competenceMonth_barberId_adjustmentNumber_key" ON "subscription_payouts"("competenceMonth", "barberId", "adjustmentNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_payouts_expenseId_key" ON "subscription_payouts"("expenseId");
CREATE INDEX IF NOT EXISTS "subscription_payouts_competenceMonth_idx" ON "subscription_payouts"("competenceMonth");
CREATE INDEX IF NOT EXISTS "subscription_payouts_barberId_idx" ON "subscription_payouts"("barberId");
CREATE INDEX IF NOT EXISTS "subscription_payouts_status_idx" ON "subscription_payouts"("status");
CREATE INDEX IF NOT EXISTS "subscription_payouts_paidAt_idx" ON "subscription_payouts"("paidAt");
CREATE INDEX IF NOT EXISTS "subscription_payouts_type_idx" ON "subscription_payouts"("type");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscription_payouts_barberId_fkey'
  ) THEN
    ALTER TABLE "subscription_payouts" ADD CONSTRAINT "subscription_payouts_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "barbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscription_payouts_paidById_fkey'
  ) THEN
    ALTER TABLE "subscription_payouts" ADD CONSTRAINT "subscription_payouts_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscription_payouts_expenseId_fkey'
  ) THEN
    ALTER TABLE "subscription_payouts" ADD CONSTRAINT "subscription_payouts_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
