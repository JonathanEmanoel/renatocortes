import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";
import { weeklyAvailabilitySchema } from "@/lib/availability-rules";
import { saveWeeklyAvailability, WeeklyAvailabilityError } from "@/lib/server/weekly-availability";
import { revalidatePath } from "next/cache";

const requestSchema = z.object({
  barberId: z.string().uuid().optional(),
  days: weeklyAvailabilitySchema
}).strict();

export async function PUT(request: Request) {
  try {
    const session = await getAuthenticatedUser();
    if (!session || session.user.role === "CLIENT") {
      return NextResponse.json({ message: "Acesso nao autorizado." }, { status: 403 });
    }

    const payload = requestSchema.safeParse(await request.json());
    if (!payload.success) return NextResponse.json({ message: payload.error.issues[0]?.message ?? "Confira os horarios." }, { status: 400 });

    if (session.user.role === "BARBER" && payload.data.barberId && payload.data.barberId !== session.user.barber?.id) return NextResponse.json({ message: "Voce so pode alterar sua propria disponibilidade." }, { status: 403 });

    const barberId = session.user.role === "BARBER" ? session.user.barber?.id : payload.data.barberId ?? session.user.barber?.id;
    if (!barberId) return NextResponse.json({ message: "Informe o barbeiro." }, { status: 400 });

    const barber = await prisma.barber.findFirst({ where: { id: barberId, deletedAt: null } });
    if (!barber) return NextResponse.json({ message: "Barbeiro nao encontrado." }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      await saveWeeklyAvailability(tx, barberId, payload.data.days);
      await tx.auditLog.create({ data: {
        userId: session.user.id, action: "BARBER_AVAILABILITY_UPDATE", entity: "Barber", entityId: barberId,
        metadata: { days: payload.data.days }
      } });
    }, { isolationLevel: "ReadCommitted", maxWait: 10000, timeout: 15000 });
    revalidatePath("/funcionario/disponibilidade");
    revalidatePath("/admin/disponibilidade");
    revalidatePath("/cliente/agendamento");

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof WeeklyAvailabilityError) return NextResponse.json({ message: error.message, conflicts: error.conflicts, conflictCount: error.count }, { status: 409 });
    return NextResponse.json({ message: "Nao foi possivel salvar a disponibilidade." }, { status: 500 });
  }
}
