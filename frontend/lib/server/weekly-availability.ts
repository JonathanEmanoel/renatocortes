import type { Prisma } from "@prisma/client";
import { dayValidationMessage, overlaps, timeInterval, type AvailabilityDayInput } from "@/lib/availability-rules";
import { dateInputFromDate, startOfSaoPauloDay } from "@/lib/server/date-periods";
import { minutesInSaoPaulo } from "@/lib/client-scheduling";
import { lockBarberSchedule } from "@/lib/server/appointment-availability";

export type AvailabilityConflict = { date: string; time: string; client: string };
export class WeeklyAvailabilityError extends Error {
  constructor(message: string, public conflicts: AvailabilityConflict[] = [], public count = conflicts.length) {
    super(message);
  }
}

export function operationalWeekDay(date: string) {
  return new Date(`${date}T12:00:00-03:00`).getUTCDay();
}

/** Must run in the same transaction as the caller's changes; bookings take this lock too. */
export async function saveWeeklyAvailability(tx: Prisma.TransactionClient, barberId: string, input: AvailabilityDayInput[], now = new Date()) {
  await lockBarberSchedule(tx, barberId);
  const stored = await tx.barberScheduleBreak.findMany({ where: { barberId } });
  const days = input.map((day) => ({ ...day, breaks: day.breaks ?? stored.filter((pause) => pause.weekDay === day.weekDay).map((pause) => ({ ...pause, label: pause.label ?? undefined })) }));
  for (const day of days) {
    const message = dayValidationMessage(day);
    if (message) throw new WeeklyAvailabilityError(message);
  }

  const appointments = days.some((day) => day.active && day.breaks.length) ? await tx.appointment.findMany({
    where: { barberId, deletedAt: null, status: { in: ["PENDING", "CONFIRMED"] }, dataHora: { gte: startOfSaoPauloDay(dateInputFromDate(now)) } },
    select: { dataHora: true, service: { select: { duration: true } }, services: { select: { duration: true } }, client: { select: { user: { select: { name: true } } } } },
    orderBy: { dataHora: "asc" }
  }) : [];
  const conflicts: AvailabilityConflict[] = [];
  for (const appointment of appointments) {
    const duration = appointment.services.length ? appointment.services.reduce((sum, item) => sum + item.duration, 0) : appointment.service.duration;
    if (appointment.dataHora.getTime() + duration * 60000 <= now.getTime()) continue;
    const date = dateInputFromDate(appointment.dataHora);
    const day = days.find((item) => item.weekDay === operationalWeekDay(date));
    const start = minutesInSaoPaulo(appointment.dataHora);
    if (day?.active && day.breaks.some((pause) => overlaps({ start, end: start + duration }, timeInterval(pause)))) {
      conflicts.push({ date, time: `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`, client: appointment.client.user.name });
    }
  }
  if (conflicts.length) throw new WeeklyAvailabilityError("Este intervalo entra em conflito com atendimentos ja agendados. Ajuste os intervalos antes de salvar.", conflicts.slice(0, 10), conflicts.length);

  await tx.barberAvailability.updateMany({ where: { barberId }, data: { active: false, deletedAt: now } });
  for (const day of days) {
    await tx.barberAvailability.upsert({
      where: { barberId_weekDay_startTime: { barberId, weekDay: day.weekDay, startTime: day.startTime } },
      create: { barberId, weekDay: day.weekDay, startTime: day.startTime, endTime: day.endTime, active: day.active },
      update: { endTime: day.endTime, active: day.active, deletedAt: null }
    });
    // Only this day's pauses are replaced; disabling a day preserves its configuration.
    if (input.find((item) => item.weekDay === day.weekDay)?.breaks !== undefined) {
      await tx.barberScheduleBreak.deleteMany({ where: { barberId, weekDay: day.weekDay } });
      if (day.breaks.length) await tx.barberScheduleBreak.createMany({ data: day.breaks.map((pause) => ({ barberId, weekDay: day.weekDay, startTime: pause.startTime, endTime: pause.endTime, label: pause.label || null })) });
    }
  }
}
