import { NextResponse } from "next/server";
import { z } from "zod";
import { buildGoogleCalendarAuthUrl } from "@/lib/google-calendar";
import { getAuthenticatedClient } from "@/lib/server/auth";

const requestSchema = z.object({
  appointmentId: z.string().uuid()
});

/**
 * Inicia OAuth para CLIENT autenticado com appointmentId em formato UUID.
 * Aqui apenas monta a URL (501 sem configuracao); a posse do agendamento e checada no callback.
 * Nao cria evento nem altera o agendamento nesta requisicao.
 */
export async function POST(request: Request) {
  const session = await getAuthenticatedClient();

  if (!session) {
    return NextResponse.json({ message: "Faca login para conectar o Google Agenda." }, { status: 401 });
  }

  const payload = requestSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ message: "Agendamento invalido." }, { status: 400 });
  }

  const authUrl = buildGoogleCalendarAuthUrl(payload.data.appointmentId);

  if (!authUrl) {
    return NextResponse.json(
      { message: "Credenciais do Google Calendar ainda nao configuradas." },
      { status: 501 }
    );
  }

  return NextResponse.json({ authUrl });
}
