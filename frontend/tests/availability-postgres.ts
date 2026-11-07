import assert from "node:assert/strict";
import fs from "node:fs";
import { prisma } from "@/lib/prisma";
import { saveWeeklyAvailability, WeeklyAvailabilityError } from "@/lib/server/weekly-availability";
import { lockBarberSchedule, validateAvailability } from "@/lib/server/appointment-availability";
import type { AvailabilityDayInput } from "@/lib/availability-rules";
import type { Prisma } from "@prisma/client";

const url = new URL(process.env.DATABASE_URL ?? "");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/renato_cortes_test");
assert.equal(process.env.CONFIRM_LOCAL_TEST_DATABASE, "renato_cortes_test");
const fixturePath = process.env.AVAILABILITY_FIXTURE!;
const checks: string[] = [];
const options = { isolationLevel: "ReadCommitted" as const, timeout: 15000, maxWait: 10000 };
const date = "2035-11-05";
const now = new Date("2035-11-01T12:00:00-03:00");
function week(breaks: { startTime: string; endTime: string; label?: string }[] = []): AvailabilityDayInput[] {
  return Array.from({ length: 7 }, (_, weekDay) => ({ weekDay, active: weekDay === 1, startTime: "09:00", endTime: "18:00", breaks: weekDay === 1 ? breaks : [] }));
}
async function main() {
  if (process.argv.includes("--baseline")) {
    const admin = await prisma.user.create({ data: { authId: "breaks-admin", name: "Admin local", email: "breaks-admin@fixture.local", role: "ADMIN", barber: { create: {} } }, include: { barber: true } });
    const barber = await prisma.user.create({ data: { authId: "breaks-barber", name: "Barbeiro local", email: "breaks-barber@fixture.local", role: "BARBER", barber: { create: {} } }, include: { barber: true } });
    const client = await prisma.user.create({ data: { authId: "breaks-client", name: "Cliente ficticio", email: "breaks-client@fixture.local", role: "CLIENT", client: { create: {} } }, include: { client: true } });
    const service = await prisma.service.create({ data: { name: "Servico local", duration: 30, price: 30 } });
    const appointment = await prisma.appointment.create({ data: { clientId: client.client!.id, barberId: barber.barber!.id, serviceId: service.id, dataHora: new Date(`${date}T09:00:00-03:00`), status: "CONFIRMED" } });
    await prisma.barberAvailability.create({ data: { barberId: barber.barber!.id, weekDay: 1, startTime: "09:00", endTime: "18:00" } });
    const payment = await prisma.payment.create({ data: { clientId: client.client!.id, amount: 19, method: "PIX", status: "PENDING" } });
    const income = await prisma.financialTransaction.create({ data: { type: "INCOME", amount: 7, description: "Fixture imutavel" } });
    const f = { adminId: admin.id, adminBarberId: admin.barber!.id, barberId: barber.barber!.id, clientId: client.client!.id, clientUserId: client.id, serviceId: service.id, appointmentId: appointment.id, paymentId: payment.id, incomeId: income.id, baselineAppointment: appointment, baselinePayment: payment, baselineIncome: income };
    fs.writeFileSync(fixturePath, JSON.stringify(f));
    console.log(JSON.stringify({ baseline: "PASS" }));
    return;
  }
  const f = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const before = await prisma.appointment.findUniqueOrThrow({ where: { id: f.appointmentId } });
  assert.equal(JSON.stringify(before), JSON.stringify(f.baselineAppointment)); checks.push("Migration preserves existing appointment");
  assert.equal(await prisma.barberScheduleBreak.count(), 0); checks.push("Migration creates no invented pauses");
  const save = (days: AvailabilityDayInput[]) => prisma.$transaction(tx => saveWeeklyAvailability(tx, f.barberId, days, now), options);
  await save(week([{ startTime: "12:00", endTime: "13:00", label: "Motivo interno" }, { startTime: "16:00", endTime: "16:15" }]));
  assert.equal(await prisma.barberScheduleBreak.count({ where: { barberId: f.barberId } }), 2); checks.push("Multiple pauses persisted");
  const available = await validateAvailability({ barberId: f.barberId, serviceIds: [f.serviceId], date });
  assert.ok(available.ok); assert.ok(!available.times.includes("12:00")); assert.ok(available.times.includes("13:00")); checks.push("Real PostgreSQL validator excludes pauses");
  await assert.rejects(save(week([{ startTime: "09:00", endTime: "10:00" }])), e => e instanceof WeeklyAvailabilityError && e.count === 1); checks.push("Future appointment conflict blocks save");
  assert.equal(await prisma.barberScheduleBreak.count({ where: { barberId: f.barberId } }), 2); checks.push("Rejected save rolls back fully");
  const disabled = week([{ startTime: "12:00", endTime: "13:00" }]); disabled[1].active = false; await save(disabled);
  assert.equal(await prisma.barberScheduleBreak.count({ where: { barberId: f.barberId } }), 1);
  assert.equal((await validateAvailability({ barberId: f.barberId, serviceIds: [f.serviceId], date })).ok, false); checks.push("Inactive day preserves pause and offers no slots");
  const omitted = week(); for (const day of omitted) delete day.breaks; await save(omitted);
  assert.equal(await prisma.barberScheduleBreak.count({ where: { barberId: f.barberId } }), 1); checks.push("Old caller omission preserves stored pauses");
  const narrowed = week(); for (const day of narrowed) delete day.breaks; narrowed[1].startTime = "14:00";
  await assert.rejects(save(narrowed), WeeklyAvailabilityError); checks.push("Narrowed workday cannot orphan pauses");
  await save(week([{ startTime: "13:00", endTime: "14:00" }]));
  assert.equal((await prisma.barberScheduleBreak.findFirstOrThrow()).startTime, "13:00"); checks.push("Edit persisted");
  await save(week()); assert.equal(await prisma.barberScheduleBreak.count(), 0); checks.push("Removal persisted");
  for (const values of [{ weekDay: 7, startTime: "12:00", endTime: "13:00" }, { weekDay: 1, startTime: "13:00", endTime: "12:00" }]) {
    await assert.rejects(prisma.barberScheduleBreak.create({ data: { barberId: f.barberId, ...values } }));
  } checks.push("PostgreSQL CHECK constraints reject invalid data");

  async function race(first: "pause" | "booking") {
    await save(week());
    let release!: () => void, locked!: () => void;
    const gate = new Promise<void>(r => release = r), acquired = new Promise<void>(r => locked = r);
    const book = async (tx: Prisma.TransactionClient) => {
      await lockBarberSchedule(tx, f.barberId);
      const check = await validateAvailability({ barberId: f.barberId, serviceIds: [f.serviceId], date, time: "12:00" }, tx);
      if (!check.ok) throw new WeeklyAvailabilityError(check.message);
      return tx.appointment.create({ data: { clientId: f.clientId, barberId: f.barberId, serviceId: f.serviceId, dataHora: new Date(`${date}T12:00:00-03:00`), status: "PENDING" } });
    };
    const pause = (tx: Parameters<typeof saveWeeklyAvailability>[0]) => saveWeeklyAvailability(tx, f.barberId, week([{ startTime: "12:00", endTime: "13:00" }]), now);
    const a = prisma.$transaction(async tx => { await lockBarberSchedule(tx, f.barberId); locked(); await gate; if (first === "pause") await pause(tx); else await book(tx); }, options);
    await acquired;
    const b = prisma.$transaction(async tx => { if (first === "pause") await book(tx); else await pause(tx); }, options);
    release();
    const results = await Promise.allSettled([a, b]);
    assert.equal(results[0].status, "fulfilled"); assert.equal(results[1].status, "rejected");
    const bookings = await prisma.appointment.findMany({ where: { barberId: f.barberId, dataHora: new Date(`${date}T12:00:00-03:00`) } });
    assert.equal(bookings.length, first === "booking" ? 1 : 0);
    assert.equal(await prisma.barberScheduleBreak.count({ where: { barberId: f.barberId } }), first === "pause" ? 1 : 0);
    await prisma.appointment.deleteMany({ where: { id: { in: bookings.map(a => a.id) } } });
  }
  await race("pause"); checks.push("Concurrent pause wins: booking rejected");
  await race("booking"); checks.push("Concurrent booking wins: pause rejected, appointment preserved");
  await save(week([{ startTime: "12:00", endTime: "13:00", label: "Motivo interno" }]));
  await assert.rejects(prisma.barberScheduleBreak.create({ data: { barberId: f.barberId, weekDay: 1, startTime: "12:00", endTime: "13:00" } })); checks.push("Unique constraint rejects duplicate pause");
  await assert.rejects(prisma.barberScheduleBreak.create({ data: { barberId: "00000000-0000-4000-8000-000000000999", weekDay: 1, startTime: "12:00", endTime: "13:00" } })); checks.push("Foreign key rejects orphan pause");
  await prisma.$transaction(tx => saveWeeklyAvailability(tx, f.adminBarberId, week([{ startTime: "13:00", endTime: "14:00" }]), now), options);
  assert.equal((await prisma.barberScheduleBreak.findFirstOrThrow({ where: { barberId: f.barberId } })).startTime, "12:00");
  assert.equal((await prisma.barberScheduleBreak.findFirstOrThrow({ where: { barberId: f.adminBarberId } })).startTime, "13:00"); checks.push("Different barbers keep independent pauses");
  assert.equal(JSON.stringify(await prisma.appointment.findUniqueOrThrow({ where: { id: f.appointmentId } })), JSON.stringify(f.baselineAppointment));
  assert.equal(JSON.stringify(await prisma.payment.findUniqueOrThrow({ where: { id: f.paymentId } })), JSON.stringify(f.baselinePayment));
  assert.equal(JSON.stringify(await prisma.financialTransaction.findUniqueOrThrow({ where: { id: f.incomeId } })), JSON.stringify(f.baselineIncome));
  assert.equal(await prisma.employeeCommission.count(), 0); assert.equal(await prisma.subscriptionPayout.count(), 0); checks.push("Existing appointments and financial sentinels unchanged");
  console.log(JSON.stringify({ pass: checks.length, fail: 0, checks }));
}
main().catch((error) => { console.error(JSON.stringify({ status: "LOCAL_AVAILABILITY_POSTGRES_FAILED", code: error.code, message: String(error.message).replace(/postgres(?:ql)?:\/\/[^\s"']+/g, "[LOCAL_CONNECTION]") })); process.exitCode = 1; }).finally(() => prisma.$disconnect());
