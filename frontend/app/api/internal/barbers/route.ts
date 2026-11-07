import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/server/audit";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";
import { availabilityDaySchema, timeSchema } from "@/lib/availability-rules";
import { saveWeeklyAvailability, WeeklyAvailabilityError } from "@/lib/server/weekly-availability";
import { revalidatePath } from "next/cache";
import { lockBarberSchedule } from "@/lib/server/appointment-availability";

const barberSchema = z.object({
  barberId: z.string().uuid(),
  specialty: z.string().trim().max(300).optional(),
  photo: z.string().trim().max(500).optional(),
  active: z.boolean().default(true),
  serviceCommissionPercent: z.number().min(0).max(100).default(50),
  productCommissionPercent: z.number().min(0).max(100).default(20),
  startTime: timeSchema.default("09:00"),
  endTime: timeSchema.default("18:00")
}).refine((value) => value.startTime < value.endTime, { message: "Confira o inicio e fim do expediente." });

async function requireManager() {
  const session = await getAuthenticatedUser();
  return session && (session.user.role === "ADMIN" || session.user.role === "DEVELOPER") ? session : null;
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

    const barber = await prisma.$transaction(async (tx) => {
      await lockBarberSchedule(tx, currentBarber.id);
      const currentDays = await tx.barberAvailability.findMany({ where: { barberId: currentBarber.id, deletedAt: null }, orderBy: { startTime: "asc" } });
      const days = Array.from({ length: 7 }, (_, weekDay) => {
        const current = currentDays.find((day) => day.weekDay === weekDay);
        return availabilityDaySchema.parse({ weekDay, active: weekDay === 0 ? Boolean(current?.active) : true, startTime: weekDay === 0 ? current?.startTime ?? "09:00" : payload.data.startTime, endTime: weekDay === 0 ? current?.endTime ?? "18:00" : payload.data.endTime });
      });
      // The team editor cannot bypass pauses or silently move them outside the workday.
      await saveWeeklyAvailability(tx, currentBarber.id, days);
      return tx.barber.update({
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
    }, { isolationLevel: "ReadCommitted", maxWait: 10000, timeout: 15000 });
    revalidatePath("/admin/disponibilidade");
    revalidatePath("/funcionario/disponibilidade");
    revalidatePath("/cliente/agendamento");
    await createAuditLog({
      userId: session.user.id,
      action: "UPDATE_BARBER",
      entity: "Barber",
      entityId: barber.id,
      metadata: payload.data
    });

    return NextResponse.json({ barber });
  } catch (error) {
    if (error instanceof WeeklyAvailabilityError) return NextResponse.json({ message: error.message, conflicts: error.conflicts, conflictCount: error.count }, { status: 409 });
    return NextResponse.json({ message: "Não foi possível atualizar o barbeiro." }, { status: 500 });
  }
}
