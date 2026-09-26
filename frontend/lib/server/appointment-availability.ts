import type { Prisma } from "@prisma/client";
import {
  clientAvailableTimes,
  clientBookingWindow,
  clientSlotAllowed,
  minutesFromTime,
  minutesInSaoPaulo,
  slotFitsAvailability,
  validBookingDate
} from "@/lib/client-scheduling";
import { prisma } from "@/lib/prisma";
import { SAO_PAULO_OFFSET } from "@/lib/server/date-periods";

type AppointmentDatabase = Prisma.TransactionClient | typeof prisma;

/** Serializa criacoes/remarcacoes do mesmo barbeiro dentro da transacao PostgreSQL. */
export async function lockBarberSchedule(tx: Prisma.TransactionClient, barberId: string) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext('appointment-schedule'), hashtext(${barberId}))`;
}

/** Interpreta a data e hora da tela com offset fixo -03:00, sem usar o fuso do servidor. */
function createDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00${SAO_PAULO_OFFSET}`);
}

/** Obtem o dia semanal pela data civil no fuso local do processo, sem parse UTC de YYYY-MM-DD. */
function weekDayFromDateInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

/** Usa duracoes dos itens salvos; agendamentos legados sem itens usam o servico principal atual. */
function sumServiceDuration(appointment: {
  service: { duration: number };
  services?: { duration: number }[];
}) {
  const services = appointment.services ?? [];
  if (services.length > 0) return services.reduce((sum, service) => sum + service.duration, 0);
  return appointment.service.duration;
}

/** Valida turno do cliente, catalogo, expediente, duracao e conflitos sem reservar o horario. */
export async function validateAvailability(input: {
  barberId: string;
  serviceIds: string[];
  date: string;
  time?: string;
  excludeAppointmentId?: string;
}, db: AppointmentDatabase = prisma) {
  const now = new Date();
  const window = clientBookingWindow(input.date, now);
  const appointmentDate = createDateTime(input.date, input.time ?? "00:00");
  if (!validBookingDate(input.date) || window.end === 0 || (input.time !== undefined && !clientSlotAllowed(input.date, input.time, now))) {
    return { ok: false as const, message: window.message || "Escolha uma data e horario validos." };
  }

  const [barber, service] = await Promise.all([
    db.barber.findFirst({
      where: { id: input.barberId, active: true, deletedAt: null },
      include: { user: true }
    }),
    db.service.findMany({
      where: { id: { in: input.serviceIds }, active: true, deletedAt: null }
    })
  ]);

  if (!barber || service.length !== input.serviceIds.length) {
    return { ok: false as const, message: "Barbeiro ou servico indisponivel." };
  }

  const servicesById = new Map(service.map((item) => [item.id, item]));
  const services = input.serviceIds.map((id) => servicesById.get(id)!);
  const totalDuration = services.reduce((sum, item) => sum + item.duration, 0);
  const totalPrice = services.reduce((sum, item) => sum + Number(item.price), 0);
  const requestedStart = minutesFromTime(input.time ?? "00:00");
  const requestedEnd = requestedStart + totalDuration;
  const availability = await db.barberAvailability.findMany({
    where: {
      barberId: input.barberId,
      weekDay: weekDayFromDateInput(input.date),
      active: true,
      deletedAt: null
    }
  });

  if (!availability.length) {
    return { ok: false as const, message: "O barbeiro nao atende neste dia." };
  }

  const windows = availability.map((item) => ({
    start: minutesFromTime(item.startTime),
    end: minutesFromTime(item.endTime)
  }));
  if (input.time !== undefined && !windows.some((item) => requestedStart >= item.start && requestedEnd <= item.end)) {
    return { ok: false as const, message: "Horario fora da disponibilidade do barbeiro." };
  }

  const existingAppointments = await db.appointment.findMany({
    where: {
      id: input.excludeAppointmentId ? { not: input.excludeAppointmentId } : undefined,
      barberId: input.barberId,
      dataHora: {
        gte: createDateTime(input.date, "00:00"),
        lte: createDateTime(input.date, "23:59")
      },
      deletedAt: null,
      status: { in: ["PENDING", "CONFIRMED"] }
    },
    select: {
      dataHora: true,
      service: { select: { duration: true } },
      services: { select: { duration: true } }
    }
  });

  const busy = existingAppointments.map((appointment) => {
    const start = minutesInSaoPaulo(appointment.dataHora);
    return { start, end: start + sumServiceDuration(appointment) };
  });
  if (input.time !== undefined && !slotFitsAvailability(requestedStart, totalDuration, windows, busy)) {
    return { ok: false as const, message: "Este horario ja esta ocupado." };
  }

  const times = clientAvailableTimes(input.date, totalDuration, windows, busy, now);
  const message = times.length
    ? window.message
    : window.message
      ? "Nao ha mais horarios disponiveis para agendamento hoje. Confira os horarios de amanha."
      : "Nao ha horarios disponiveis para os servicos nesta data.";
  return { ok: true as const, appointmentDate, barber, services, totalDuration, totalPrice, times, message };
}
