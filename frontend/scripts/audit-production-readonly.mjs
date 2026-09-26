import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function duration(appointment) {
  return appointment.services.length
    ? appointment.services.reduce((sum, item) => sum + item.duration, 0)
    : appointment.service.duration;
}

try {
  const [columns, integrity, duplicatePayouts, appointments] = await Promise.all([
    prisma.$queryRaw`
      SELECT
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'financialSnapshot') AS "financialSnapshot",
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subscription_payouts' AND column_name = 'operationKey') AS "operationKey"
    `,
    prisma.$queryRaw`
      SELECT
        (SELECT COUNT(*)::int FROM subscription_payouts p LEFT JOIN barbers b ON b.id = p."barberId" WHERE b.id IS NULL) AS "orphanBarbers",
        (SELECT COUNT(*)::int FROM subscription_payouts p LEFT JOIN expenses e ON e.id = p."expenseId" WHERE p."expenseId" IS NOT NULL AND e.id IS NULL) AS "orphanExpenses"
    `,
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS count FROM (
        SELECT "competenceMonth", "barberId", "adjustmentNumber"
        FROM subscription_payouts
        GROUP BY "competenceMonth", "barberId", "adjustmentNumber"
        HAVING COUNT(*) > 1
      ) duplicated
    `,
    prisma.appointment.findMany({
      where: { deletedAt: null, status: { in: ["PENDING", "CONFIRMED"] } },
      select: {
        id: true,
        barberId: true,
        dataHora: true,
        service: { select: { duration: true } },
        services: { select: { duration: true } }
      },
      orderBy: [{ barberId: "asc" }, { dataHora: "asc" }]
    })
  ]);

  const conflicts = [];
  for (let leftIndex = 0; leftIndex < appointments.length; leftIndex += 1) {
    const left = appointments[leftIndex];
    const leftEnd = left.dataHora.getTime() + duration(left) * 60_000;
    for (let rightIndex = leftIndex + 1; rightIndex < appointments.length; rightIndex += 1) {
      const right = appointments[rightIndex];
      if (right.barberId !== left.barberId) break;
      if (right.dataHora.getTime() >= leftEnd) break;
      conflicts.push([left.id, right.id]);
    }
  }

  console.log(JSON.stringify({
    columns: columns[0],
    integrity: integrity[0],
    duplicatePayoutKeys: duplicatePayouts[0]?.count ?? 0,
    operationalAppointments: appointments.length,
    overlappingAppointmentPairs: conflicts.length,
    overlappingIds: conflicts.slice(0, 10)
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
