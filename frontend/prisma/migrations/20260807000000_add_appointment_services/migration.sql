CREATE TABLE IF NOT EXISTS "appointment_services" (
  "id" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "price" DECIMAL(10,2) NOT NULL,
  "duration" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "appointment_services_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "appointment_services_appointmentId_serviceId_key"
  ON "appointment_services"("appointmentId", "serviceId");

CREATE INDEX IF NOT EXISTS "appointment_services_appointmentId_idx"
  ON "appointment_services"("appointmentId");

CREATE INDEX IF NOT EXISTS "appointment_services_serviceId_idx"
  ON "appointment_services"("serviceId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointment_services_appointmentId_fkey'
  ) THEN
    ALTER TABLE "appointment_services"
      ADD CONSTRAINT "appointment_services_appointmentId_fkey"
      FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointment_services_serviceId_fkey'
  ) THEN
    ALTER TABLE "appointment_services"
      ADD CONSTRAINT "appointment_services_serviceId_fkey"
      FOREIGN KEY ("serviceId") REFERENCES "services"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "appointment_services" ("id", "appointmentId", "serviceId", "price", "duration")
SELECT gen_random_uuid()::text, appointment."id", appointment."serviceId", service."price", service."duration"
FROM "appointments" appointment
INNER JOIN "services" service ON service."id" = appointment."serviceId"
ON CONFLICT ("appointmentId", "serviceId") DO NOTHING;
