import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildCalendarEvent,
  createGoogleCalendarEvent,
  exchangeGoogleCodeForToken
} from "@/lib/google-calendar";
import { getAuthenticatedClient } from "@/lib/server/auth";

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
      include: {
        barber: { include: { user: true } },
        service: true
      }
    });

    if (!appointment) {
      return NextResponse.redirect(new URL("/cliente/meus-agendamentos", request.url));
    }

    const token = await exchangeGoogleCodeForToken(code);
    await createGoogleCalendarEvent(
      token.access_token,
      buildCalendarEvent({
        serviceName: appointment.service.name,
        barberName: appointment.barber.user.name,
        barbershopPhone: "+55 81 99586-4757",
        start: appointment.dataHora,
        durationMinutes: appointment.service.duration
      })
    );

    return NextResponse.redirect(new URL("/cliente/meus-agendamentos", request.url));
  } catch {
    return NextResponse.redirect(new URL("/cliente/meus-agendamentos", request.url));
  }
}
