-- Additive: no existing availability, appointment or financial row is modified.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE "barber_schedule_breaks" (
    "id" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "weekDay" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "barber_schedule_breaks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "barber_schedule_breaks_weekday_check" CHECK ("weekDay" BETWEEN 0 AND 6),
    CONSTRAINT "barber_schedule_breaks_time_check" CHECK (
      "startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND
      "endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "startTime" < "endTime"
    ),
    CONSTRAINT "barber_schedule_breaks_label_check" CHECK (length("label") <= 80)
);
CREATE UNIQUE INDEX "barber_schedule_breaks_barberId_weekDay_startTime_key"
  ON "barber_schedule_breaks"("barberId", "weekDay", "startTime");
CREATE INDEX "barber_schedule_breaks_barberId_weekDay_idx" ON "barber_schedule_breaks"("barberId", "weekDay");
ALTER TABLE "barber_schedule_breaks" ADD CONSTRAINT "barber_schedule_breaks_barberId_fkey"
  FOREIGN KEY ("barberId") REFERENCES "barbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reasons are internal data, not a public Supabase/PostgREST resource.
REVOKE ALL ON TABLE "barber_schedule_breaks" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "barber_schedule_breaks" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "barber_schedule_breaks" FROM authenticated;
  END IF;
END $$;
COMMIT;
