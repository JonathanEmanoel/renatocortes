import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedClient } from "@/lib/server/auth";

const reviewSchema = z.object({
  appointmentId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional()
});

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedClient();
    if (!session) return NextResponse.json({ message: "Faça login para avaliar." }, { status: 401 });

    const payload = reviewSchema.safeParse(await request.json());

    if (!payload.success) {
      return NextResponse.json({ message: "Confira sua avaliação." }, { status: 400 });
    }

    const appointment = await prisma.appointment.findFirst({
      where: {
        id: payload.data.appointmentId,
        clientId: session.client.id,
        status: "COMPLETED",
        deletedAt: null
      }
    });

    if (!appointment) {
      return NextResponse.json({ message: "Avaliação disponível apenas para atendimentos finalizados." }, { status: 403 });
    }

    const review = await prisma.review.upsert({
      where: { appointmentId: appointment.id },
      update: {
        rating: payload.data.rating,
        comment: payload.data.comment
      },
      create: {
        appointmentId: appointment.id,
        clientId: appointment.clientId,
        barberId: appointment.barberId,
        rating: payload.data.rating,
        comment: payload.data.comment
      }
    });

    return NextResponse.json({ review });
  } catch {
    return NextResponse.json({ message: "Não foi possível registrar a avaliação." }, { status: 500 });
  }
}
