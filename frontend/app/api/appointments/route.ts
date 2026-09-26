/**
 * Agendamento do CLIENT: valida agenda e grava uma visita com um ou mais servicos.
 * A solicitacao fica PENDING; links de WhatsApp/Google nao confirmam nem pagam o atendimento.
 * A finalizacao e seus efeitos financeiros pertencem a internal/appointments.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { buildCalendarEvent, buildGoogleCalendarAuthUrl } from "@/lib/google-calendar";
import { getAuthenticatedClient } from "@/lib/server/auth";
import { lockBarberSchedule, validateAvailability } from "@/lib/server/appointment-availability";
import { minutesInSaoPaulo } from "@/lib/client-scheduling";
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

class AppointmentConflictError extends Error {}

/** Prioriza a lista multisser vico, remove repeticoes e aceita serviceId de clientes antigos. */
function normalizeServiceIds(input: { serviceId?: string; serviceIds?: string[] }) {
  return Array.from(new Set(input.serviceIds?.length ? input.serviceIds : input.serviceId ? [input.serviceId] : []));
}


/** A tela consome a mesma validacao da criacao; nao retorna dados dos clientes. */
export async function GET(request: Request) {
  try {
    const session = await getAuthenticatedClient();
    if (!session) return NextResponse.json({ message: "Faca login para consultar horarios." }, { status: 401 });
    const params = new URL(request.url).searchParams;
    const appointmentId = params.get("appointmentId");
    let existing = null;
    if (appointmentId) {
      if (!z.string().uuid().safeParse(appointmentId).success) return NextResponse.json({ message: "Agendamento invalido." }, { status: 400 });
      existing = await prisma.appointment.findFirst({
        where: { id: appointmentId, clientId: session.client.id, deletedAt: null },
        select: { id: true, barberId: true, serviceId: true, services: { select: { serviceId: true } } }
      });
      if (!existing) return NextResponse.json({ message: "Agendamento nao encontrado." }, { status: 404 });
    }
    const parsed = z.object({ barberId: z.string().uuid(), serviceIds: z.array(z.string().uuid()).min(1).max(8), date: z.string() }).safeParse({ barberId: existing?.barberId ?? params.get("barberId"), serviceIds: existing ? existing.services.length ? existing.services.map((item) => item.serviceId) : [existing.serviceId] : params.getAll("serviceId"), date: params.get("date") });
    if (!parsed.success) return NextResponse.json({ message: "Selecione barbeiro, servicos e data." }, { status: 400 });
    const now = new Date();
    const result = await validateAvailability({ ...parsed.data, serviceIds: [...new Set(parsed.data.serviceIds)], excludeAppointmentId: existing?.id });
    const minute = minutesInSaoPaulo(now);
    const boundary = minute < 720 ? 720 : minute < 1080 ? 1080 : 1440;
    const validForMs = (boundary - minute) * 60000 - now.getUTCSeconds() * 1000 - now.getUTCMilliseconds();
    return NextResponse.json({ times: result.ok ? result.times : [], message: result.message, validForMs }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "Nao foi possivel consultar horarios. Tente novamente." }, { status: 500 });
  }
}

/**
 * Cria uma visita para o CLIENT autenticado, validando UUIDs, formatos e disponibilidade.
 * Guarda preco/duracao por item e serviceId principal para compatibilidade legada.
 * Corte + Barba sao dois servicos de um unico agendamento, sem comissao nesta etapa.
 */
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
    const { created, validation } = await prisma.$transaction(async (tx) => {
      await lockBarberSchedule(tx, payload.data.barberId);
      const checked = await validateAvailability({ ...payload.data, serviceIds }, tx);
      if (!checked.ok) throw new AppointmentConflictError(checked.message);

      const primaryService = checked.services[0];
      const appointment = await tx.appointment.create({
        data: {
          clientId: session.client.id,
          barberId: payload.data.barberId,
          serviceId: primaryService.id,
          dataHora: checked.appointmentDate,
          status: "PENDING",
          observacoes: payload.data.observations,
          services: {
            create: checked.services.map((service) => ({
              serviceId: service.id,
              price: service.price,
              duration: service.duration
            }))
          }
        },
        select: {
          id: true,
          dataHora: true,
          barber: { select: { user: { select: { name: true, phone: true } } } },
          service: { select: { name: true, price: true, duration: true } },
          services: { select: { price: true, duration: true, service: { select: { name: true } } } }
        }
      });
      return { created: appointment, validation: checked };
    }, { isolationLevel: "ReadCommitted", maxWait: 10000, timeout: 15000 });

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
  } catch (error) {
    if (error instanceof AppointmentConflictError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { message: "Nao foi possivel criar o agendamento agora. Tente novamente." },
      { status: 500 }
    );
  }
}

/**
 * Permite ao CLIENT cancelar ou remarcar somente agendamento proprio nao excluido.
 * Cancelar acrescenta nota no horario de Sao Paulo; remarcar revalida agenda e volta a PENDING.
 * Nao exige status anterior especifico nem estorna lancamentos financeiros existentes.
 */
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
      select: {
        id: true,
        barberId: true,
        serviceId: true,
        observacoes: true,
        service: { select: { duration: true } },
        services: { select: { serviceId: true, duration: true } }
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
        },
        select: { id: true }
      });

      return NextResponse.json({ ok: true });
    }

    const reschedule = payload.data;
    await prisma.$transaction(async (tx) => {
      await lockBarberSchedule(tx, appointment.barberId);
      const validation = await validateAvailability({
        barberId: appointment.barberId,
        serviceIds: appointment.services.length ? appointment.services.map((service) => service.serviceId) : [appointment.serviceId],
        date: reschedule.date,
        time: reschedule.time,
        excludeAppointmentId: appointment.id
      }, tx);

      if (!validation.ok) throw new AppointmentConflictError(validation.message);
      await tx.appointment.update({
        where: { id: appointment.id },
        data: {
          dataHora: validation.appointmentDate,
          status: "PENDING"
        },
        select: { id: true }
      });
    }, { isolationLevel: "ReadCommitted", maxWait: 10000, timeout: 15000 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AppointmentConflictError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { message: "Nao foi possivel alterar o agendamento agora." },
      { status: 500 }
    );
  }
}
