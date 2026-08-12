import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/server/audit";
import { SERVICE_COMMISSION_PERCENT, hasActiveSubscriptionAt } from "@/lib/server/finance-rules";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

const requestSchema = z.object({
  appointmentId: z.string().uuid(),
  action: z.enum(["approve", "reject", "cancel", "finish"])
});

const statusByAction = {
  approve: "CONFIRMED",
  reject: "REJECTED",
  cancel: "CANCELED",
  finish: "COMPLETED"
} as const;

export async function PATCH(request: Request) {
  try {
    const session = await getAuthenticatedUser();

    if (!session || session.user.role === "CLIENT") {
      return NextResponse.json({ message: "Acesso nao autorizado." }, { status: 403 });
    }

    const payload = requestSchema.safeParse(await request.json());

    if (!payload.success) {
      return NextResponse.json({ message: "Confira os dados do agendamento." }, { status: 400 });
    }

    const appointment = await prisma.appointment.findFirst({
      where: {
        id: payload.data.appointmentId,
        deletedAt: null
      },
      include: {
        service: true,
        services: { include: { service: true } },
        barber: { include: { user: true } },
        client: { include: { subscriptions: true } }
      }
    });

    if (!appointment) {
      return NextResponse.json({ message: "Agendamento nao encontrado." }, { status: 404 });
    }

    if (session.user.role === "BARBER" && appointment.barberId !== session.user.barber?.id) {
      return NextResponse.json({ message: "Voce so pode alterar seus proprios agendamentos." }, { status: 403 });
    }

    if ((payload.data.action === "approve" || payload.data.action === "reject") && appointment.status !== "PENDING") {
      return NextResponse.json({ message: "Este agendamento nao esta pendente." }, { status: 409 });
    }

    if ((payload.data.action === "finish" || payload.data.action === "cancel") && appointment.status !== "CONFIRMED") {
      return NextResponse.json({ message: "Este agendamento precisa estar confirmado." }, { status: 409 });
    }

    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: statusByAction[payload.data.action],
        observacoes:
          payload.data.action === "reject"
            ? appointment.observacoes
              ? `${appointment.observacoes}\nRecusado pela barbearia.`
              : "Recusado pela barbearia."
            : appointment.observacoes
      }
    });

    if (payload.data.action === "finish") {
      const appointmentServices = appointment.services.length
        ? appointment.services
        : [{ service: appointment.service, price: appointment.service.price }];
      const appointmentTotal = appointmentServices.reduce((sum, item) => sum + Number(item.price), 0);
      const serviceNames = appointmentServices.map((item) => item.service.name).join(" + ");
      const isSubscriptionAppointment = hasActiveSubscriptionAt(appointment.client.subscriptions, appointment.dataHora);
      const commissionValue = appointmentTotal * (SERVICE_COMMISSION_PERCENT / 100);
      const existingCommission = await prisma.employeeCommission.findFirst({
        where: { appointmentId: appointment.id, barberId: appointment.barberId }
      });

      if (!isSubscriptionAppointment && !existingCommission) {
        await prisma.employeeCommission.create({
          data: {
            barberId: appointment.barberId,
            appointmentId: appointment.id,
            percentage: SERVICE_COMMISSION_PERCENT.toFixed(2),
            amount: commissionValue
          }
        }).catch(() => null);
      }

      if (!isSubscriptionAppointment) await prisma.financialTransaction.create({
        data: {
          type: "INCOME",
          amount: appointmentTotal,
          description: `Atendimento finalizado: ${appointment.id} - ${serviceNames}`
        }
      }).catch(() => null);
    }

    await createAuditLog({
      userId: session.user.id,
      action: `APPOINTMENT_${payload.data.action.toUpperCase()}`,
      entity: "Appointment",
      entityId: appointment.id,
      metadata: { status: updated.status }
    });

    return NextResponse.json({ appointment: updated });
  } catch {
    return NextResponse.json({ message: "Nao foi possivel alterar o agendamento agora." }, { status: 500 });
  }
}
