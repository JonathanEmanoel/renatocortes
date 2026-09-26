import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildCalendarEvent,
  createGoogleCalendarEvent,
  exchangeGoogleCodeForToken
} from "@/lib/google-calendar";
import { getAuthenticatedClient } from "@/lib/server/auth";

/**
 * Consome code e state (id do agendamento) apos OAuth de um CLIENT autenticado.
 * Exige agendamento proprio nao excluido antes de trocar o codigo e criar evento externo.
 * Nao guarda id do evento para deduplicar; sucesso e falha redirecionam para a mesma tela.
 */
export async function GET(request: Request) {
  try {
    const session = await getAuthenticatedClient();

    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const appointmentId = url.searchParams.get("state");

    if (!code || !appointmentId) {
      return NextResponse.redirect(new URL("/cliente/meus-agendamentos", request.url));
    }

    const appointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        clientId: session.client.id,
        deletedAt: null
      },
      select: {
        dataHora: true,
        barber: { select: { user: { select: { name: true, phone: true } } } },
        service: { select: { name: true, duration: true } },
        services: { select: { duration: true, service: { select: { name: true } } } }
      }
    });

    if (!appointment) {
      return NextResponse.redirect(new URL("/cliente/meus-agendamentos", request.url));
    }

    // Itens preservam a duracao salva; o relacionamento singular atende registros anteriores aos itens.
    const services = appointment.services.length
      ? appointment.services
      : [{ service: appointment.service, duration: appointment.service.duration }];

    const token = await exchangeGoogleCodeForToken(code);
    await createGoogleCalendarEvent(
      token.access_token,
      buildCalendarEvent({
        serviceName: services.map((item) => item.service.name).join(" + "),
        barberName: appointment.barber.user.name,
        barbershopPhone: appointment.barber.user.phone ?? "+55 81 99720-7222",
        start: appointment.dataHora,
        durationMinutes: services.reduce((sum, item) => sum + item.duration, 0)
      })
    );

    return NextResponse.redirect(new URL("/cliente/meus-agendamentos", request.url));
  } catch {
    return NextResponse.redirect(new URL("/cliente/meus-agendamentos", request.url));
  }
}
