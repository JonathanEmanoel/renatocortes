import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/server/audit";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

const daySchema = z.object({
  weekDay: z.number().int().min(0).max(6),
  active: z.boolean(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/)
});

const requestSchema = z.object({
  barberId: z.string().uuid().optional(),
  days: z.array(daySchema).length(7)
});

export async function PUT(request: Request) {
  try {
    const session = await getAuthenticatedUser();
    if (!session || session.user.role === "CLIENT") {
      return NextResponse.json({ message: "Acesso nao autorizado." }, { status: 403 });
    }

    const payload = requestSchema.safeParse(await request.json());
    if (!payload.success) return NextResponse.json({ message: "Confira os horarios." }, { status: 400 });

    const barberId = session.user.role === "BARBER" ? session.user.barber?.id : payload.data.barberId ?? session.user.barber?.id;
    if (!barberId) return NextResponse.json({ message: "Informe o barbeiro." }, { status: 400 });

    const barber = await prisma.barber.findFirst({ where: { id: barberId, deletedAt: null } });
    if (!barber) return NextResponse.json({ message: "Barbeiro nao encontrado." }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      await tx.barberAvailability.updateMany({
        where: { barberId },
        data: { active: false, deletedAt: new Date() }
      });

      for (const day of payload.data.days) {
        if (!day.active) continue;
        await tx.barberAvailability.upsert({
          where: {
            barberId_weekDay_startTime: {
              barberId,
              weekDay: day.weekDay,
              startTime: day.startTime
            }
          },
          create: {
            barberId,
            weekDay: day.weekDay,
            startTime: day.startTime,
            endTime: day.endTime,
            active: true
          },
          update: {
            endTime: day.endTime,
            active: true,
            deletedAt: null
          }
        });
      }
    });

    await createAuditLog({
      userId: session.user.id,
      action: "BARBER_AVAILABILITY_UPDATE",
      entity: "Barber",
      entityId: barberId,
      metadata: { days: payload.data.days }
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: "Nao foi possivel salvar a disponibilidade." }, { status: 500 });
  }
}
