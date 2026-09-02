DO $$ BEGIN
  CREATE TYPE "ManualServiceChangeType" AS ENUM ('UPDATE', 'DELETE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ManualServiceChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "manual_services" (
  "id" TEXT NOT NULL,
  "barberId" TEXT NOT NULL,
  "clientId" TEXT,
  "subscriptionId" TEXT,
  "createdById" TEXT,
  "customerName" TEXT,
  "serviceDate" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "manual_services_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "manual_service_items" (
  "id" TEXT NOT NULL,
  "manualServiceId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unitPrice" DECIMAL(10,2) NOT NULL,
  "chargedUnitPrice" DECIMAL(10,2) NOT NULL,
  "duration" INTEGER NOT NULL,
  "coveredBySubscription" BOOLEAN NOT NULL DEFAULT false,
  "subscriptionPlanName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "manual_service_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "manual_service_change_requests" (
  "id" TEXT NOT NULL,
  "manualServiceId" TEXT NOT NULL,
  "requestedById" TEXT,
  "decidedById" TEXT,
  "type" "ManualServiceChangeType" NOT NULL,
  "status" "ManualServiceChangeStatus" NOT NULL DEFAULT 'PENDING',
  "previousSnapshot" JSONB NOT NULL,
  "proposedSnapshot" JSONB,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  CONSTRAINT "manual_service_change_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "manual_services_barberId_idx" ON "manual_services"("barberId");
CREATE INDEX IF NOT EXISTS "manual_services_clientId_idx" ON "manual_services"("clientId");
CREATE INDEX IF NOT EXISTS "manual_services_subscriptionId_idx" ON "manual_services"("subscriptionId");
CREATE INDEX IF NOT EXISTS "manual_services_createdById_idx" ON "manual_services"("createdById");
CREATE INDEX IF NOT EXISTS "manual_services_serviceDate_idx" ON "manual_services"("serviceDate");
CREATE INDEX IF NOT EXISTS "manual_services_deletedAt_idx" ON "manual_services"("deletedAt");
CREATE INDEX IF NOT EXISTS "manual_service_items_manualServiceId_idx" ON "manual_service_items"("manualServiceId");
CREATE INDEX IF NOT EXISTS "manual_service_items_serviceId_idx" ON "manual_service_items"("serviceId");
CREATE INDEX IF NOT EXISTS "manual_service_items_coveredBySubscription_idx" ON "manual_service_items"("coveredBySubscription");
CREATE INDEX IF NOT EXISTS "manual_service_change_requests_manualServiceId_idx" ON "manual_service_change_requests"("manualServiceId");
CREATE INDEX IF NOT EXISTS "manual_service_change_requests_requestedById_idx" ON "manual_service_change_requests"("requestedById");
CREATE INDEX IF NOT EXISTS "manual_service_change_requests_decidedById_idx" ON "manual_service_change_requests"("decidedById");
CREATE INDEX IF NOT EXISTS "manual_service_change_requests_status_idx" ON "manual_service_change_requests"("status");
CREATE INDEX IF NOT EXISTS "manual_service_change_requests_type_idx" ON "manual_service_change_requests"("type");

DO $$ BEGIN
  ALTER TABLE "manual_services" ADD CONSTRAINT "manual_services_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "barbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "manual_services" ADD CONSTRAINT "manual_services_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "manual_services" ADD CONSTRAINT "manual_services_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "manual_services" ADD CONSTRAINT "manual_services_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "manual_service_items" ADD CONSTRAINT "manual_service_items_manualServiceId_fkey" FOREIGN KEY ("manualServiceId") REFERENCES "manual_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "manual_service_items" ADD CONSTRAINT "manual_service_items_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "manual_service_change_requests" ADD CONSTRAINT "manual_service_change_requests_manualServiceId_fkey" FOREIGN KEY ("manualServiceId") REFERENCES "manual_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "manual_service_change_requests" ADD CONSTRAINT "manual_service_change_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "manual_service_change_requests" ADD CONSTRAINT "manual_service_change_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
