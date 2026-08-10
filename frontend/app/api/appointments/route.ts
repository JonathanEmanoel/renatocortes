import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { buildCalendarEvent, buildGoogleCalendarAuthUrl } from "@/lib/google-calendar";
import { getAuthenticatedClient } from "@/lib/server/auth";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { formatDatePtBr, formatTimePtBr } from "@/lib/format";

const createSchema = z.object({
  barberId: z.string().uuid(),
  serviceId: z.string().uuid().optional(),
  serviceIds: z.array(z.string().uuid()).min(1).max(8).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  observations: z.string().trim().max(500).optional()
}).refine((value) => value.serviceId || value.serviceIds?.length, {
  message: "Selecione pelo menos um servico.",
  path: ["serviceIds"]
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("cancel"),
    appointmentId: z.string().uuid()
  }),
  z.object({
    action: z.literal("reschedule"),
    appointmentId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/)
  })
]);

function minutesFromTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function createDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00-03:00`);
}

function normalizeServiceIds(input: { serviceId?: string; serviceIds?: string[] }) {
  return Array.from(new Set(input.serviceIds?.length ? input.serviceIds : input.serviceId ? [input.serviceId] : []));
}

function sumServiceDuration(
  appointment: {
    service: { duration: number };
    services?: { duration: number }[];
  }
) {
  const services = appointment.services ?? [];
  if (services.length > 0) {
    return services.reduce((sum, service) => sum + service.duration, 0);
  }

  return appointment.service.duration;
}

async function validateAvailability(input: {
  barberId: string;
  serviceIds: string[];
  date: string;
  time: string;
  excludeAppointmentId?: string;
}) {
  const appointmentDate = createDateTime(input.date, input.time);

  if (Number.isNaN(appointmentDate.getTime()) || appointmentDate <= new Date()) {
    return { ok: false as const, message: "Escolha uma data e horario futuros." };
  }

  const [barber, service] = await Promise.all([
    prisma.barber.findFirst({
      where: { id: input.barberId, active: true, deletedAt: null },
      include: { user: true }
    }),
    prisma.service.findMany({
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
  const weekDay = appointmentDate.getDay();
  const requestedStart = minutesFromTime(input.time);
  const requestedEnd = requestedStart + totalDuration;
  const availability = await prisma.barberAvailability.findFirst({
    where: {
      barberId: input.barberId,
      weekDay,
      active: true,
      deletedAt: null
    }
  });

  if (!availability) {
    return { ok: false as const, message: "O barbeiro nao atende neste dia." };
  }

  const availableStart = minutesFromTime(availability.startTime);
  const availableEnd = minutesFromTime(availability.endTime);

  if (requestedStart < availableStart || requestedEnd > availableEnd) {
    return { ok: false as const, message: "Horario fora da disponibilidade do barbeiro." };
  }

  const dayStart = createDateTime(input.date, "00:00");
  const dayEnd = createDateTime(input.date, "23:59");
  const existingAppointments = await prisma.appointment.findMany({
    where: {
      id: input.excludeAppointmentId ? { not: input.excludeAppointmentId } : undefined,
      barberId: input.barberId,
      dataHora: {
        gte: dayStart,
        lte: dayEnd
      },
      deletedAt: null,
      status: {
        in: ["PENDING", "CONFIRMED"]
      }
    },
    include: {
      service: true,
      services: true
    }
  });

  const hasConflict = existingAppointments.some((appointment) => {
    const existingStart = appointment.dataHora.getHours() * 60 + appointment.dataHora.getMinutes();
    const existingEnd = existingStart + sumServiceDuration(appointment);
    return requestedStart < existingEnd && requestedEnd > existingStart;
  });

  if (hasConflict) {
    return { ok: false as const, message: "Este horario ja esta ocupado." };
  }

  return { ok: true as const, appointmentDate, barber, services, totalDuration, totalPrice };
}

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedClient();

    if (!session) {
      return NextResponse.json({ message: "Faca login para agendar um horario." }, { status: 401 });
    }

    const payload = createSchema.safeParse(await request.json());

    if (!payload.success) {
      return NextResponse.json({ message: "Confira os dados do agendamento." }, { status: 400 });
    }

    const serviceIds = normalizeServiceIds(payload.data);
    const validation = await validateAvailability({ ...payload.data, serviceIds });

    if (!validation.ok) {
      return NextResponse.json({ message: validation.message }, { status: 409 });
    }

    const primaryService = validation.services[0];
    const created = await prisma.appointment.create({
      data: {
        clientId: session.client.id,
        barberId: payload.data.barberId,
        serviceId: primaryService.id,
        dataHora: validation.appointmentDate,
        status: "PENDING",
        observacoes: payload.data.observations,
        services: {
          create: validation.services.map((service) => ({
            serviceId: service.id,
            price: service.price,
            duration: service.duration
          }))
        }
      },
      include: {
        barber: { include: { user: true } },
        service: true,
        services: { include: { service: true } }
      }
    });

    const selectedServices = created.services.length
      ? created.services
      : [{ service: created.service, price: created.service.price, duration: created.service.duration }];
    const serviceLines = selectedServices.map((item) => {
      const price = Number(item.price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      return `${item.service.name} - ${item.duration} min - ${price}`;
    });
    const serviceNames = selectedServices.map((item) => item.service.name).join(" + ");
    const totalText = validation.totalPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const message = [
      `Ola, ${created.barber.user.name}!`,
      "",
      "Novo agendamento solicitado:",
      "",
      "Cliente:",
      session.user.name || "Nao informado",
      "",
      "Telefone:",
      session.user.phone || "Nao informado",
      "",
      "Servicos:",
      ...serviceLines,
      "",
      "Duracao total:",
      `${validation.totalDuration} min`,
      "",
      "Valor total:",
      totalText,
      "",
      "Barbeiro:",
      created.barber.user.name,
      "",
      "Data:",
      formatDatePtBr(created.dataHora),
      "",
      "Horario:",
      formatTimePtBr(created.dataHora),
      "",
      "O profissional podera analisar o agendamento pelo sistema."
    ].join("\n");

    const calendarEvent = buildCalendarEvent({
      serviceName: serviceNames,
      barberName: created.barber.user.name,
      barbershopPhone: created.barber.user.phone ?? "+55 81 99720-7222",
      start: created.dataHora,
      durationMinutes: validation.totalDuration
    });

    return NextResponse.json({
      appointmentId: created.id,
      whatsAppUrl: buildWhatsAppUrl(message, created.barber.user.phone),
      googleCalendarAuthUrl: buildGoogleCalendarAuthUrl(created.id),
      calendarEvent
    });
  } catch {
    return NextResponse.json(
      { message: "Nao foi possivel criar o agendamento agora. Tente novamente." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getAuthenticatedClient();

    if (!session) {
      return NextResponse.json({ message: "Faca login para alterar o agendamento." }, { status: 401 });
    }

    const payload = patchSchema.safeParse(await request.json());

    if (!payload.success) {
      return NextResponse.json({ message: "Confira os dados do agendamento." }, { status: 400 });
    }

    const appointment = await prisma.appointment.findFirst({
      where: {
        id: payload.data.appointmentId,
        clientId: session.client.id,
        deletedAt: null
      },
      include: {
        service: true,
        services: true
      }
    });

    if (!appointment) {
      return NextResponse.json({ message: "Agendamento nao encontrado." }, { status: 404 });
    }

    if (payload.data.action === "cancel") {
      const canceledAt = new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo"
      }).format(new Date());
      const note = `Cancelado em ${canceledAt}.`;

      await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          status: "CANCELED",
          observacoes: appointment.observacoes ? `${appointment.observacoes}\n${note}` : note
        }
      });

      return NextResponse.json({ ok: true });
    }

    const validation = await validateAvailability({
      barberId: appointment.barberId,
      serviceIds: appointment.services.length ? appointment.services.map((service) => service.serviceId) : [appointment.serviceId],
      date: payload.data.date,
      time: payload.data.time,
      excludeAppointmentId: appointment.id
    });

    if (!validation.ok) {
      return NextResponse.json({ message: validation.message }, { status: 409 });
    }

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        dataHora: validation.appointmentDate,
        status: "PENDING"
      }
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { message: "Nao foi possivel alterar o agendamento agora." },
      { status: 500 }
    );
  }
}
