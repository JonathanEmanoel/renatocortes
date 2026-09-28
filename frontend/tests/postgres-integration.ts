import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { calculateSubscriptionPayouts, paySubscriptionPayout } from "@/lib/server/subscription-payouts";
import { lockBarberSchedule, validateAvailability } from "@/lib/server/appointment-availability";
import { formatTimePtBr } from "@/lib/format";

const expectedDatabase = "renato_cortes_test";
const testUrl = process.env.TEST_DATABASE_URL;

if (!testUrl) throw new Error("TEST_DATABASE_URL e obrigatoria.");
const parsedUrl = new URL(testUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname.toLowerCase())) {
  throw new Error("Teste PostgreSQL bloqueado fora de localhost.");
}
if (parsedUrl.pathname.replace(/^\//, "") !== expectedDatabase) {
  throw new Error(`Teste PostgreSQL bloqueado fora de ${expectedDatabase}.`);
}
if (process.env.CONFIRM_LOCAL_TEST_DATABASE !== expectedDatabase) {
  throw new Error(`Defina CONFIRM_LOCAL_TEST_DATABASE=${expectedDatabase}.`);
}
if (process.env.DATABASE_URL !== testUrl || process.env.DIRECT_URL !== testUrl) {
  throw new Error("DATABASE_URL e DIRECT_URL devem ser identicas a TEST_DATABASE_URL durante esta suite.");
}

type TableRow = { tablename: string };

async function clearDisposableData() {
  const tables = await prisma.$queryRaw<TableRow[]>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  const identifiers = tables
    .map(({ tablename }) => `"public"."${tablename.replaceAll('"', '""')}"`)
    .join(", ");
  if (identifiers) await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${identifiers} RESTART IDENTITY CASCADE`);
}

function saoPauloDatePlusDays(days: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(Date.now() + days * 86_400_000));
}

function weekDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

async function main() {
  await clearDisposableData();
  const suffix = randomUUID();

  try {
    const admin = await prisma.user.create({
      data: {
        authId: `test-admin-${suffix}`,
        name: "Renato Teste",
        email: `admin-${suffix}@local.test`,
        role: "ADMIN",
        barber: { create: { active: true } }
      },
      include: { barber: true }
    });
    assert.ok(admin.barber, "ADMIN precisa atuar como barbeiro no cenario.");

    const clientUser = await prisma.user.create({
      data: {
        authId: `test-client-${suffix}`,
        name: "Cliente Teste",
        email: `client-${suffix}@local.test`,
        role: "CLIENT",
        client: { create: {} }
      },
      include: { client: true }
    });
    assert.ok(clientUser.client);

    const [coveredA, coveredB, extra] = await Promise.all([
      prisma.service.create({ data: { name: `Corte ${suffix}`, duration: 60, price: 50 } }),
      prisma.service.create({ data: { name: `Barba ${suffix}`, duration: 30, price: 30 } }),
      prisma.service.create({ data: { name: `Extra ${suffix}`, duration: 15, price: 20 } })
    ]);

    const bookingDate = saoPauloDatePlusDays(2);
    await prisma.barberAvailability.create({
      data: {
        barberId: admin.barber.id,
        weekDay: weekDay(bookingDate),
        startTime: "09:00",
        endTime: "18:00"
      }
    });

    const reserve = (time: string) => prisma.$transaction(async (tx) => {
      await lockBarberSchedule(tx, admin.barber!.id);
      const checked = await validateAvailability({
        barberId: admin.barber!.id,
        serviceIds: [coveredA.id],
        date: bookingDate,
        time
      }, tx);
      if (!checked.ok) throw new Error(checked.message);
      return tx.appointment.create({
        data: {
          clientId: clientUser.client!.id,
          barberId: admin.barber!.id,
          serviceId: coveredA.id,
          dataHora: checked.appointmentDate,
          status: "PENDING",
          services: {
            create: [{ serviceId: coveredA.id, price: coveredA.price, duration: coveredA.duration }]
          }
        }
      });
    }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 15_000 });

    const simultaneousAppointments = await Promise.allSettled([reserve("10:00"), reserve("10:00")]);
    assert.equal(simultaneousAppointments.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(simultaneousAppointments.filter((result) => result.status === "rejected").length, 1);
    assert.equal(await prisma.appointment.count({
      where: { barberId: admin.barber.id, dataHora: new Date(`${bookingDate}T10:00:00-03:00`) }
    }), 1);
    await reserve("11:00");
    const persistedAtSixteen = await reserve("16:00");
    const reloadedAtSixteen = await prisma.appointment.findUniqueOrThrow({ where: { id: persistedAtSixteen.id } });
    assert.equal(reloadedAtSixteen.dataHora.toISOString(), `${bookingDate}T19:00:00.000Z`);
    assert.equal(formatTimePtBr(reloadedAtSixteen.dataHora), "16:00");
    assert.equal(await prisma.appointment.count({ where: { barberId: admin.barber.id } }), 3);

    const plan = await prisma.subscriptionPlan.create({
      data: {
        name: `Plano ${suffix}`,
        value: 100,
        periodDays: 30,
        services: { create: [{ serviceId: coveredA.id }, { serviceId: coveredB.id }] }
      }
    });
    await prisma.subscription.create({
      data: {
        clientId: clientUser.client.id,
        subscriptionPlanId: plan.id,
        startDate: new Date("2026-09-01T00:00:00-03:00"),
        endDate: new Date("2026-09-30T23:59:59-03:00"),
        active: true,
        status: "ACTIVE"
      }
    });

    for (const status of ["PENDING", "REJECTED"] as const) {
      const user = await prisma.user.create({
        data: {
          authId: `test-${status.toLowerCase()}-${suffix}`,
          name: `Cliente ${status}`,
          email: `${status.toLowerCase()}-${suffix}@local.test`,
          role: "CLIENT",
          client: { create: {} }
        },
        include: { client: true }
      });
      await prisma.subscription.create({
        data: {
          clientId: user.client!.id,
          subscriptionPlanId: plan.id,
          startDate: new Date("2026-09-01T00:00:00-03:00"),
          active: true,
          status
        }
      });
    }

    await prisma.appointment.create({
      data: {
        clientId: clientUser.client.id,
        barberId: admin.barber.id,
        serviceId: coveredA.id,
        dataHora: new Date("2026-09-10T10:00:00-03:00"),
        status: "COMPLETED",
        services: {
          create: [
            { serviceId: coveredA.id, price: coveredA.price, duration: coveredA.duration },
            { serviceId: coveredB.id, price: coveredB.price, duration: coveredB.duration },
            { serviceId: extra.id, price: extra.price, duration: extra.duration }
          ]
        }
      }
    });

    const zeroMonth = await calculateSubscriptionPayouts("2026-08");
    assert.equal(zeroMonth.revenueBase, 0);
    assert.ok(zeroMonth.rows.every((row) => Number.isFinite(row.sharePercent) && row.calculatedAmount === 0));

    const initial = await calculateSubscriptionPayouts("2026-09");
    assert.equal(initial.revenueBase, 100, "PENDING e REJECTED nao podem gerar receita.");
    assert.equal(initial.totalAttendances, 1, "Multiplos servicos cobertos continuam uma visita.");
    const mainRow = initial.rows.find((row) => row.barberId === admin.barber!.id && row.type === "MAIN");
    assert.ok(mainRow?.operationKey);
    assert.equal(mainRow.calculatedAmount, 40);

    const payoutInput = {
      competenceMonth: "2026-09",
      barberId: admin.barber.id,
      paidById: admin.id,
      operationKey: mainRow.operationKey
    };
    const simultaneousPayouts = await Promise.allSettled([
      paySubscriptionPayout(payoutInput),
      paySubscriptionPayout(payoutInput)
    ]);
    assert.equal(simultaneousPayouts.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(simultaneousPayouts.filter((result) => result.status === "rejected").length, 1);
    await assert.rejects(() => paySubscriptionPayout(payoutInput));

    const paidMain = await prisma.subscriptionPayout.findFirstOrThrow({
      where: { competenceMonth: "2026-09", barberId: admin.barber.id, type: "MAIN" }
    });
    assert.equal(Number(paidMain.paidAmount), 40);
    const originalSnapshot = JSON.stringify(paidMain.snapshot);
    assert.equal(await prisma.expense.count({ where: { subscriptionPayout: { isNot: null } } }), 1);
    assert.equal(await prisma.financialTransaction.count({ where: { expense: { subscriptionPayout: { isNot: null } } } }), 1);

    const secondClient = await prisma.user.create({
      data: {
        authId: `test-second-${suffix}`,
        name: "Cliente Retroativo",
        email: `second-${suffix}@local.test`,
        role: "CLIENT",
        client: { create: {} }
      },
      include: { client: true }
    });
    const secondSubscription = await prisma.subscription.create({
      data: {
        clientId: secondClient.client!.id,
        subscriptionPlanId: plan.id,
        startDate: new Date("2026-09-01T00:00:00-03:00"),
        endDate: new Date("2026-09-30T23:59:59-03:00"),
        active: true,
        status: "ACTIVE"
      }
    });
    await prisma.manualService.create({
      data: {
        barberId: admin.barber.id,
        clientId: secondClient.client!.id,
        subscriptionId: secondSubscription.id,
        createdById: admin.id,
        serviceDate: new Date("2026-09-15T14:00:00-03:00"),
        items: {
          create: [{
            serviceId: coveredA.id,
            quantity: 1,
            unitPrice: coveredA.price,
            chargedUnitPrice: 0,
            duration: coveredA.duration,
            coveredBySubscription: true,
            subscriptionPlanName: plan.name
          }]
        }
      }
    });

    const recalculated = await calculateSubscriptionPayouts("2026-09");
    assert.equal(recalculated.revenueBase, 200);
    assert.equal(recalculated.totalAttendances, 2, "Agendamento e avulso coberto devem contar igualmente.");
    const adjustment = recalculated.rows.find((row) => row.barberId === admin.barber!.id && row.type === "ADJUSTMENT" && row.isVirtual);
    assert.ok(adjustment?.operationKey);
    assert.equal(adjustment.calculatedAmount, 40);
    const mainAfterRetroactive = await prisma.subscriptionPayout.findUniqueOrThrow({ where: { id: paidMain.id } });
    assert.equal(Number(mainAfterRetroactive.paidAmount), 40);
    assert.equal(JSON.stringify(mainAfterRetroactive.snapshot), originalSnapshot, "Snapshot historico nao pode mudar.");

    const adjustmentInput = {
      competenceMonth: "2026-09",
      barberId: admin.barber.id,
      adjustment: true,
      paidById: admin.id,
      operationKey: adjustment.operationKey
    };
    const simultaneousAdjustments = await Promise.allSettled([
      paySubscriptionPayout(adjustmentInput),
      paySubscriptionPayout(adjustmentInput)
    ]);
    assert.equal(simultaneousAdjustments.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(simultaneousAdjustments.filter((result) => result.status === "rejected").length, 1);
    assert.equal(await prisma.subscriptionPayout.count({ where: { competenceMonth: "2026-09" } }), 2);
    assert.equal(await prisma.expense.count({ where: { subscriptionPayout: { isNot: null } } }), 2);
    assert.equal(await prisma.financialTransaction.count({ where: { expense: { subscriptionPayout: { isNot: null } } } }), 2);
    const paidTotal = await prisma.subscriptionPayout.aggregate({
      where: { competenceMonth: "2026-09", barberId: admin.barber.id, status: "PAID" },
      _sum: { paidAmount: true }
    });
    assert.equal(Number(paidTotal._sum.paidAmount), 80);

    await prisma.barber.update({ where: { id: admin.barber.id }, data: { active: false } });
    const inactiveHistory = await calculateSubscriptionPayouts("2026-09");
    assert.ok(inactiveHistory.rows.some((row) => row.barberId === admin.barber!.id && row.status === "PAID"));

    console.log(JSON.stringify({
      safeDatabase: expectedDatabase,
      appointmentConcurrency: { requests: 2, fulfilled: 1, rejected: 1, adjacentAccepted: true },
      payoutConcurrency: { requests: 2, fulfilled: 1, rejected: 1, paid: 40 },
      adjustmentConcurrency: { requests: 2, fulfilled: 1, rejected: 1, totalPaid: 80 },
      immutableHistory: true,
      activeAdminBarberParticipated: true,
      pendingAndRejectedRevenueExcluded: true,
      appointmentAndManualVisitParity: true,
      zeroAttendanceSafe: true
    }, null, 2));
  } finally {
    await clearDisposableData();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
