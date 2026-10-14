import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { appointmentFinancials } from "@/lib/server/finance-rules";

/** Explicit IDs only. Not connected to an automatic production repair or UI. */
type ReclassificationInput = { appointmentId: string; subscriptionId: string; userId: string; reason: string };

export async function reclassifySubscriptionAppointment(input: ReclassificationInput) {
  return prisma.$transaction(db => reclassifySubscriptionAppointmentInTransaction(db, input), { timeout: 20000, maxWait: 10000 });
}

export async function reclassifySubscriptionAppointmentInTransaction(db: Prisma.TransactionClient, input: ReclassificationInput) {
  if (input.reason.trim().length < 10) throw new Error("Informe o motivo auditavel da correcao.");
    const actor = await db.user.findUnique({ where: { id: input.userId }, select: { role: true, active: true, deletedAt: true } });
    if (!actor || actor.role !== "ADMIN" || !actor.active || actor.deletedAt) throw new Error("Somente ADMIN pode reclassificar.");
    await db.$queryRaw`SELECT id FROM subscriptions WHERE id = ${input.subscriptionId} FOR UPDATE`;
    await db.$queryRaw`SELECT id FROM appointments WHERE id = ${input.appointmentId} FOR UPDATE`;
    const previous = await db.auditLog.findFirst({ where: { entity: "Appointment", entityId: input.appointmentId, action: "SUBSCRIPTION_APPOINTMENT_RECLASSIFIED" } });
    if (previous) {
      const metadata = previous.metadata as { subscriptionId?: string } | null;
      if (metadata?.subscriptionId !== input.subscriptionId) throw new Error("Atendimento ja corrigido para outra assinatura.");
      return { alreadyCorrected: true };
    }
    const appointment = await db.appointment.findUnique({ where: { id: input.appointmentId }, include: {
      service: true, services: { include: { service: true } }, commissions: true,
      payments: { include: { transactions: true } }, client: { include: { subscriptions: { include: { subscriptionPlan: { include: { services: true } } } } } }
    } });
    if (!appointment || appointment.deletedAt || appointment.status !== "COMPLETED") throw new Error("Atendimento deve estar finalizado e visivel.");
    await db.$queryRaw`SELECT id FROM employee_commissions WHERE "appointmentId" = ${appointment.id} FOR UPDATE`;
    const lockedCommissions = await db.employeeCommission.findMany({ where: { appointmentId: appointment.id } });
    if (lockedCommissions.some((row) => row.paid || row.paidAt)) throw new Error("Comissao ja paga: correcao automatica bloqueada, sem clawback.");
    if (appointment.payments.some((row) => row.status === "PAID")) throw new Error("Pagamento individual existente: conciliacao manual obrigatoria.");
    const closure = await db.financialClosure.findFirst({ where: { closedAt: { not: null }, startDate: { lte: appointment.dataHora }, endDate: { gte: appointment.dataHora } } });
    if (closure) throw new Error("Atendimento em fechamento concluido: conciliacao manual obrigatoria.");
    const cycle = await db.subscriptionCycle.findFirst({ where: {
      subscriptionId: input.subscriptionId, subscription: { clientId: appointment.clientId, deletedAt: null, startDate: { lte: appointment.dataHora } },
      OR: [{ coverageStartDate: { lte: appointment.dataHora } }, { coverageStartDate: null, dueDate: { lte: appointment.dataHora } }], endDate: { gt: appointment.dataHora }, payment: { status: "PAID", deletedAt: null }
    }, orderBy: { dueDate: "desc" } });
    if (!cycle) throw new Error("Nao existe ciclo pago comprovado cobrindo a data do atendimento.");
    await db.$queryRaw`SELECT id FROM payments WHERE id = ${cycle.paymentId} FOR UPDATE`;
    const cyclePayment = await db.payment.findUnique({ where: { id: cycle.paymentId } });
    if (!cyclePayment || cyclePayment.status !== "PAID" || cyclePayment.deletedAt || cyclePayment.subscriptionId !== input.subscriptionId) throw new Error("Evidencia de pagamento mudou. Reavalie a correcao.");
    const before = appointmentFinancials(appointment);
    const ids = new Set(Array.isArray(cycle.coveredServiceIds) ? cycle.coveredServiceIds.filter((id): id is string => typeof id === "string") : []);
    const snapshot = { version: 1 as const, plan: cycle.planName, services: before.snapshot.services.map((item) => ({ ...item, covered: ids.has(item.id) })) };
    const after = appointmentFinancials({ ...appointment, financialSnapshot: snapshot });
    if (!after.hasCoveredVisit) throw new Error("Nenhum servico coberto pelo plano confirmado.");
    const transactions = await db.financialTransaction.findMany({ where: { deletedAt: null, description: { startsWith: `Atendimento finalizado: ${appointment.id} - ` } } });
    if (transactions.length > 1 || transactions.some((row) => row.type !== "INCOME" || row.paymentId || row.expenseId)) throw new Error("Lancamentos financeiros ambiguos: nao corrigir automaticamente.");
    if (appointment.commissions.length > 1 || appointment.commissions.some((row) => row.barberId !== appointment.barberId)) throw new Error("Comissoes ambiguas: nao corrigir automaticamente.");
    if (transactions.some((row) => Math.round(Number(row.amount) * 100) !== Math.round(before.chargedGross * 100)) || lockedCommissions.some((row) => Math.round(Number(row.amount) * 100) !== Math.round(before.commission * 100))) throw new Error("Valores divergentes do snapshot: conciliacao manual obrigatoria.");
    await db.appointment.update({ where: { id: appointment.id }, data: { financialSnapshot: snapshot } });
    for (const commission of appointment.commissions) await db.employeeCommission.update({ where: { id: commission.id }, data: { amount: after.commission } });
    if (!appointment.commissions.length && after.commission > 0) await db.employeeCommission.create({ data: { appointmentId: appointment.id, barberId: appointment.barberId, amount: after.commission, percentage: 50 } });
    for (const transaction of transactions) await db.financialTransaction.update({ where: { id: transaction.id }, data: { amount: after.chargedGross } });
    await db.auditLog.create({ data: { userId: input.userId, entity: "Appointment", entityId: appointment.id, action: "SUBSCRIPTION_APPOINTMENT_RECLASSIFIED",
      metadata: { subscriptionId: input.subscriptionId, cycleId: cycle.id, reason: input.reason, previousSnapshot: before.snapshot, correctedSnapshot: snapshot, previousCommission: before.commission, correctedCommission: after.commission, previousGross: before.chargedGross, correctedGross: after.chargedGross, commissions: appointment.commissions.map((row) => ({ id: row.id, amount: String(row.amount), paid: row.paid })), transactions: transactions.map((row) => ({ id: row.id, amount: String(row.amount) })) } } });
    return { alreadyCorrected: false, before: { gross: before.chargedGross, commission: before.commission }, after: { gross: after.chargedGross, commission: after.commission, coveredVisits: 1 } };
}
