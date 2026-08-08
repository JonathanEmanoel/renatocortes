import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/server/audit";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

const barberSchema = z.object({
  barberId: z.string().uuid(),
  specialty: z.string().trim().max(300).optional(),
  photo: z.string().trim().max(500).optional(),
  active: z.boolean().default(true),
  serviceCommissionPercent: z.number().min(0).max(100).default(50),
  productCommissionPercent: z.number().min(0).max(100).default(20),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).default("09:00"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).default("18:00")
});

async function requireManager() {
  const session = await getAuthenticatedUser();
  return session && (session.user.role === "ADMIN" || session.user.role === "DEVELOPER") ? session : null;
}

async function upsertAvailability(barberId: string, startTime: string, endTime: string) {
  await Promise.all(
    [1, 2, 3, 4, 5, 6].map((weekDay) =>
      prisma.barberAvailability.upsert({
        where: {
          barberId_weekDay_startTime: {
            barberId,
            weekDay,
            startTime
          }
        },
        update: {
          endTime,
          active: true,
          deletedAt: null
        },
        create: {
          barberId,
          weekDay,
          startTime,
          endTime,
          active: true
        }
      })
    )
  );
}

export async function PATCH(request: Request) {
  try {
    const session = await requireManager();
    if (!session) return NextResponse.json({ message: "Acesso não autorizado." }, { status: 403 });

    const payload = barberSchema.safeParse(await request.json());
    if (!payload.success) return NextResponse.json({ message: "Confira os dados do barbeiro." }, { status: 400 });

    const currentBarber = await prisma.barber.findUnique({
      where: { id: payload.data.barberId },
      include: { user: true }
    });

    if (!currentBarber) {
      return NextResponse.json({ message: "Barbeiro não encontrado." }, { status: 404 });
    }

    const barber = await prisma.barber.update({
      where: { id: currentBarber.id },
      data: {
        specialty: payload.data.specialty,
        photo: payload.data.photo,
        active: payload.data.active,
        serviceCommissionPercent: payload.data.serviceCommissionPercent,
        productCommissionPercent: payload.data.productCommissionPercent,
        deletedAt: payload.data.active ? null : new Date()
      },
      include: { user: true, availability: true }
    });

    await upsertAvailability(barber.id, payload.data.startTime, payload.data.endTime);
    await createAuditLog({
      userId: session.user.id,
      action: "UPDATE_BARBER",
      entity: "Barber",
      entityId: barber.id,
      metadata: payload.data
    });

    return NextResponse.json({ barber });
  } catch {
    return NextResponse.json({ message: "Não foi possível atualizar o barbeiro." }, { status: 500 });
  }
}
