DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExpenseStatus') THEN
    CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'CANCELED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClosurePeriod') THEN
    CREATE TYPE "ClosurePeriod" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "expense_categories" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "expense_categories_name_key" ON "expense_categories"("name");
CREATE INDEX IF NOT EXISTS "expense_categories_active_idx" ON "expense_categories"("active");

ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "updatedById" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "paymentMethod" "PaymentMethod";
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "notes" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_categoryId_fkey') THEN
    ALTER TABLE "expenses"
      ADD CONSTRAINT "expenses_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_createdById_fkey') THEN
    ALTER TABLE "expenses"
      ADD CONSTRAINT "expenses_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_updatedById_fkey') THEN
    ALTER TABLE "expenses"
      ADD CONSTRAINT "expenses_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "expenses_categoryId_idx" ON "expenses"("categoryId");
CREATE INDEX IF NOT EXISTS "expenses_createdById_idx" ON "expenses"("createdById");
CREATE INDEX IF NOT EXISTS "expenses_updatedById_idx" ON "expenses"("updatedById");
CREATE INDEX IF NOT EXISTS "expenses_paidAt_idx" ON "expenses"("paidAt");
CREATE INDEX IF NOT EXISTS "expenses_status_idx" ON "expenses"("status");

CREATE TABLE IF NOT EXISTS "financial_closures" (
  "id" TEXT NOT NULL,
  "period" "ClosurePeriod" NOT NULL DEFAULT 'WEEKLY',
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "grossRevenue" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  "expensesTotal" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  "netProfit" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  "barberShare" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  "businessShare" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "financial_closures_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "financial_closures_period_idx" ON "financial_closures"("period");
CREATE INDEX IF NOT EXISTS "financial_closures_startDate_idx" ON "financial_closures"("startDate");
CREATE INDEX IF NOT EXISTS "financial_closures_endDate_idx" ON "financial_closures"("endDate");

CREATE TABLE IF NOT EXISTS "reviews" (
  "id" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "barberId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "reviews_appointmentId_key" ON "reviews"("appointmentId");
CREATE INDEX IF NOT EXISTS "reviews_clientId_idx" ON "reviews"("clientId");
CREATE INDEX IF NOT EXISTS "reviews_barberId_idx" ON "reviews"("barberId");
CREATE INDEX IF NOT EXISTS "reviews_rating_idx" ON "reviews"("rating");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_appointmentId_fkey') THEN
    ALTER TABLE "reviews"
      ADD CONSTRAINT "reviews_appointmentId_fkey"
      FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_clientId_fkey') THEN
    ALTER TABLE "reviews"
      ADD CONSTRAINT "reviews_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_barberId_fkey') THEN
    ALTER TABLE "reviews"
      ADD CONSTRAINT "reviews_barberId_fkey"
      FOREIGN KEY ("barberId") REFERENCES "barbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "expense_categories" ("id", "name")
VALUES
  (gen_random_uuid()::text, 'Aluguel'),
  (gen_random_uuid()::text, 'Energia'),
  (gen_random_uuid()::text, 'Água'),
  (gen_random_uuid()::text, 'Internet'),
  (gen_random_uuid()::text, 'Salários'),
  (gen_random_uuid()::text, 'Comissão dos barbeiros'),
  (gen_random_uuid()::text, 'Compra de produtos'),
  (gen_random_uuid()::text, 'Materiais de limpeza'),
  (gen_random_uuid()::text, 'Manutenção'),
  (gen_random_uuid()::text, 'Impostos'),
  (gen_random_uuid()::text, 'Marketing'),
  (gen_random_uuid()::text, 'Outras despesas')
ON CONFLICT ("name") DO NOTHING;
