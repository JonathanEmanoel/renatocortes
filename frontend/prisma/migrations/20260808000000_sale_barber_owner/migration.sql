ALTER TABLE "sales" ADD COLUMN "barberId" TEXT;

ALTER TABLE "sales"
  ADD CONSTRAINT "sales_barberId_fkey"
  FOREIGN KEY ("barberId") REFERENCES "barbers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "sales_barberId_idx" ON "sales"("barberId");
