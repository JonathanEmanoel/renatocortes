-- Additive only. Legacy anchors/payments are deliberately NOT inferred or backfilled.
ALTER TABLE "subscriptions"
  ADD COLUMN "baseDueDay" INTEGER,
  ADD COLUMN "nextCycleDueDate" TIMESTAMP(3),
  ADD COLUMN "billingFirstDueDate" TIMESTAMP(3),
  ADD COLUMN "legacyRevenueSnapshot" JSONB;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_base_due_day_check" CHECK ("baseDueDay" IS NULL OR "baseDueDay" BETWEEN 1 AND 31);

CREATE TABLE "subscription_cycles" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "confirmationKey" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "competenceMonth" TEXT NOT NULL,
  "baseDueDay" INTEGER NOT NULL CHECK ("baseDueDay" BETWEEN 1 AND 31),
  "planId" TEXT NOT NULL,
  "planName" TEXT NOT NULL,
  "coveredServiceIds" JSONB NOT NULL,
  "paymentId" TEXT NOT NULL,
  "confirmedById" TEXT NOT NULL,
  "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_cycles_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "subscription_cycles_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "subscription_cycles_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "subscription_cycles_dates_check" CHECK ("endDate" > "dueDate"),
  CONSTRAINT "subscription_cycles_competence_check" CHECK ("competenceMonth" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
CREATE UNIQUE INDEX "subscription_cycles_confirmationKey_key" ON "subscription_cycles"("confirmationKey");
CREATE UNIQUE INDEX "subscription_cycles_paymentId_key" ON "subscription_cycles"("paymentId");
CREATE UNIQUE INDEX "subscription_cycles_subscriptionId_dueDate_key" ON "subscription_cycles"("subscriptionId", "dueDate");
CREATE INDEX "subscription_cycles_competenceMonth_idx" ON "subscription_cycles"("competenceMonth");
CREATE INDEX "subscription_cycles_confirmedById_idx" ON "subscription_cycles"("confirmedById");

CREATE TABLE "subscription_due_day_changes" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestKey" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "previousDay" INTEGER NOT NULL CHECK ("previousDay" BETWEEN 1 AND 31),
  "newDay" INTEGER NOT NULL CHECK ("newDay" BETWEEN 1 AND 31 AND "newDay" <> "previousDay"),
  "afterDueDate" TIMESTAMP(3) NOT NULL,
  "effectiveDueDate" TIMESTAMP(3) NOT NULL,
  "configuredById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "appliedAt" TIMESTAMP(3),
  CONSTRAINT "subscription_due_day_changes_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "subscription_due_day_changes_configuredById_fkey" FOREIGN KEY ("configuredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "subscription_due_day_changes_dates_check" CHECK ("effectiveDueDate" > "afterDueDate")
);
CREATE UNIQUE INDEX "subscription_due_day_changes_requestKey_key" ON "subscription_due_day_changes"("requestKey");
CREATE UNIQUE INDEX "subscription_due_day_changes_one_pending" ON "subscription_due_day_changes"("subscriptionId") WHERE "appliedAt" IS NULL;
CREATE INDEX "subscription_due_day_changes_subscriptionId_appliedAt_idx" ON "subscription_due_day_changes"("subscriptionId", "appliedAt");
CREATE INDEX "subscription_due_day_changes_configuredById_idx" ON "subscription_due_day_changes"("configuredById");
