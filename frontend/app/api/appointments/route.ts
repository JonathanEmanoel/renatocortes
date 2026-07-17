import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { buildCalendarEvent, buildGoogleCalendarAuthUrl } from "@/lib/google-calendar";
import { getAuthenticatedClient } from "@/lib/server/auth";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { formatDatePtBr, formatTimePtBr } from "@/lib/format";

const createSchema = z.object({
  barberId: z.string().uuid(),
  serviceId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  observations: z.string().trim().max(500).optional()
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

async function validateAvailability(input: {
  barberId: string;
  serviceId: string;
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
    prisma.service.findFirst({
      where: { id: input.serviceId, active: true, deletedAt: null }
    })
  ]);

  if (!barber || !service) {
    return { ok: false as const, message: "Barbeiro ou servico indisponivel." };
  }

  const weekDay = appointmentDate.getDay();
  const requestedStart = minutesFromTime(input.time);
  const requestedEnd = requestedStart + service.duration;
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
      service: true
    }
  });

  const hasConflict = existingAppointments.some((appointment) => {
    const existingStart = appointment.dataHora.getHours() * 60 + appointment.dataHora.getMinutes();
    const existingEnd = existingStart + appointment.service.duration;
    return requestedStart < existingEnd && requestedEnd > existingStart;
  });

  if (hasConflict) {
    return { ok: false as const, message: "Este horario ja esta ocupado." };
  }

  return { ok: true as const, appointmentDate, barber, service };
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

    const validation = await validateAvailability(payload.data);

    if (!validation.ok) {
      return NextResponse.json({ message: validation.message }, { status: 409 });
    }

    const created = await prisma.appointment.create({
      data: {
        clientId: session.client.id,
        barberId: payload.data.barberId,
        serviceId: payload.data.serviceId,
        dataHora: validation.appointmentDate,
        status: "PENDING",
        observacoes: payload.data.observations
      },
      include: {
        barber: { include: { user: true } },
        service: true
      }
    });

    const message = [
      "Ola!",
      "",
      "Gostaria de confirmar meu agendamento.",
      "",
      "Cliente:",
      session.user.name || "Nao informado",
      "",
      "Telefone:",
      session.user.phone || "Nao informado",
      "",
      "Servico:",
      created.service.name,
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
      "Obrigado!"
    ].join("\n");

    const calendarEvent = buildCalendarEvent({
      serviceName: created.service.name,
      barberName: created.barber.user.name,
      barbershopPhone: "+55 81 99586-4757",
      start: created.dataHora,
      durationMinutes: created.service.duration
    });

    return NextResponse.json({
      appointmentId: created.id,
      whatsAppUrl: buildWhatsAppUrl(message),
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
        service: true
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
      serviceId: appointment.serviceId,
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
