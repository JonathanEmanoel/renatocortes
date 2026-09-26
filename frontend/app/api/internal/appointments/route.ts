import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/server/audit";
import { SERVICE_COMMISSION_PERCENT, appointmentFinancials } from "@/lib/server/finance-rules";
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

const internalAppointmentSelect = {
  id: true,
  status: true,
  barberId: true,
  observacoes: true,
  dataHora: true,
  service: { select: { id: true, name: true, price: true } },
  services: { select: { serviceId: true, price: true, service: { select: { name: true } } } },
  barber: { select: { user: { select: { name: true } } } },
  client: {
    select: {
      subscriptions: {
        select: {
          active: true,
          status: true,
          deletedAt: true,
          startDate: true,
          endDate: true,
          subscriptionPlan: { select: { name: true, services: { select: { serviceId: true } } } }
        }
      }
    }
  }
} as const;

async function canStoreAppointmentFinancialSnapshot(tx: Prisma.TransactionClient) {
  try {
    const rows = await tx.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'appointments'
          AND column_name = 'financialSnapshot'
      ) AS "exists"
    `;
    return Boolean(rows[0]?.exists);
  } catch {
    return false;
  }
}

/**
 * Fluxo interno de aprovacao/finalizacao de agendamentos.
 * Pendente/recusado/cancelado nao gera receita; a receita e a comissao nascem
 * somente ao finalizar um atendimento nao coberto por assinatura.
 */
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
      select: internalAppointmentSelect
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

    const updated = payload.data.action === "finish" ? await prisma.$transaction(async (tx) => {
      // A transicao condicional e os efeitos financeiros confirmam ou revertem juntos.
      const financials = appointmentFinancials(appointment);
      const canStoreSnapshot = await canStoreAppointmentFinancialSnapshot(tx);
      const locked = await tx.appointment.updateMany({
        where: { id: appointment.id, status: "CONFIRMED", deletedAt: null },
        data: canStoreSnapshot ? { status: "COMPLETED", financialSnapshot: financials.snapshot } : { status: "COMPLETED" }
      });
      if (locked.count !== 1) throw new Error("Este agendamento ja foi processado.");
      if (financials.chargedGross > 0) {
        const existingCommission = await tx.employeeCommission.findFirst({ where: { appointmentId: appointment.id, barberId: appointment.barberId } });
        if (!existingCommission) await tx.employeeCommission.create({
          data: { barberId: appointment.barberId, appointmentId: appointment.id, percentage: SERVICE_COMMISSION_PERCENT.toFixed(2), amount: financials.commission }
        });
        await tx.financialTransaction.create({
          data: { type: "INCOME", amount: financials.chargedGross, description: `Atendimento finalizado: ${appointment.id} - ${financials.extra.map((item) => item.name).join(" + ")}` }
        });
      }
      return canStoreSnapshot
        ? { ...appointment, status: "COMPLETED" as const, financialSnapshot: financials.snapshot }
        : { ...appointment, status: "COMPLETED" as const };
    }) : await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: statusByAction[payload.data.action],
        observacoes:
          payload.data.action === "reject"
            ? appointment.observacoes
              ? `${appointment.observacoes}\nRecusado pela barbearia.`
              : "Recusado pela barbearia."
            : appointment.observacoes
      },
      select: { id: true, status: true }
    });

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
