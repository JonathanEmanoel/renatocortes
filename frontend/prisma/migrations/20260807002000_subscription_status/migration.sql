DO $$ BEGIN
  CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'CANCELED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING';

UPDATE "subscriptions"
SET "status" = CASE
  WHEN "active" = true AND ("endDate" IS NULL OR "endDate" >= NOW()) THEN 'ACTIVE'::"SubscriptionStatus"
  WHEN "active" = true AND "endDate" < NOW() THEN 'EXPIRED'::"SubscriptionStatus"
  WHEN "active" = false THEN 'PENDING'::"SubscriptionStatus"
  ELSE 'PENDING'::"SubscriptionStatus"
END
WHERE "status" = 'PENDING';

CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "subscriptions"("status");
