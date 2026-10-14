import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { appointmentFinancials } from '@/lib/server/finance-rules';
import { calculateSubscriptionPayouts, distributeSubscriptionPoolCents } from '@/lib/server/subscription-payouts';
import { persistConfirmedSubscriptionCycle, projectSubscriptionBilling } from '@/lib/server/subscription-billing';
import { reclassifySubscriptionAppointmentInTransaction } from '@/lib/server/subscription-reclassification';
import { dueDateInMonth } from '@/lib/server/subscription-calendar';
import { dateInputFromDate } from '@/lib/server/date-periods';

export type LegacyReconciliationInput = {
  subscriptionId: string; appointmentId: string; userId: string; competenceMonth: string;
  baseDay: number; amount: number; reason: string; operationKey: string;
  evidence: { paymentConfirmedByBusiness: true; baseDayConfirmedByBusiness: true };
  expected: { appointmentId: string; clientId: string; barberId: string; serviceId: string;
    dataHora: string; planId: string; incomeId: string; commissionId: string;
    normalGross: number; normalCommission: number; revenue: number; pool: number;
    totalVisits: number; barberCounts: { barberId: string; count: number }[] };
};
const cents = (value: unknown) => Math.round(Number(value) * 100);
export function legacyReconciliationKey(input: Pick<LegacyReconciliationInput, 'subscriptionId' | 'appointmentId' | 'competenceMonth' | 'baseDay'>) {
  return createHash('sha256').update(JSON.stringify(['LEGACY_ADMIN_RECONCILIATION', 1, input.subscriptionId,
    input.competenceMonth, input.baseDay, input.appointmentId])).digest('hex');
}

export async function reconcileLegacySubscriptionPaymentAndAppointment(input: LegacyReconciliationInput,
  options: { dryRun?: boolean } = {}, client: PrismaClient = prisma) {
  for (let attempt = 0; ; attempt++) {
    try { return await client.$transaction(async db => {
    if (options.dryRun) {
      await db.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const ro = await db.$queryRawUnsafe<{ transaction_read_only: string }[]>('SHOW transaction_read_only');
      if (ro[0]?.transaction_read_only !== 'on') throw new Error('Dry-run sem READ ONLY bloqueado.');
    }
    return reconcileInTransaction(db, input, Boolean(options.dryRun));
    }, { isolationLevel: 'Serializable', timeout: 60000, maxWait: 10000 }); }
    catch (error) {
      const conflict = error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034' ||
        (error.code === 'P2010' && ['40001', '40P01'].includes(String(error.meta?.code))));
      if (attempt >= 2 || !conflict) throw error;
    }
  }
}

async function reconcileInTransaction(db: Prisma.TransactionClient, input: LegacyReconciliationInput, dryRun: boolean) {
  if (input.operationKey !== legacyReconciliationKey(input)) throw new Error('OperationKey divergente da identidade natural.');
  if (input.evidence?.paymentConfirmedByBusiness !== true || input.evidence?.baseDayConfirmedByBusiness !== true || input.reason.trim().length < 20) throw new Error('Confirmacao comercial explicita e motivo obrigatorios.');
  if (input.expected.appointmentId !== input.appointmentId) throw new Error('Outro Appointment: identidade auditada divergente.');
  const actor = await db.user.findUnique({ where: { id: input.userId }, select: { role: true, active: true, deletedAt: true } });
  if (!actor || actor.role !== 'ADMIN' || !actor.active || actor.deletedAt) throw new Error('Somente ADMIN pode conciliar.');
  const due = dueDateInMonth(input.competenceMonth, input.baseDay);
  if (!dryRun) {
    // Same monthly lock as payout execution; no payout can be paid during reconciliation.
    await db.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext('subscription-payout'), hashtext(${input.competenceMonth}))`;
    await db.$queryRaw`SELECT id FROM clients WHERE id = ${input.expected.clientId} FOR UPDATE`;
    await db.$queryRaw`SELECT id FROM subscriptions WHERE id = ${input.subscriptionId} FOR UPDATE`;
    await db.$queryRaw`SELECT id FROM appointments WHERE id = ${input.appointmentId} FOR UPDATE`;
    await db.$queryRaw`SELECT id FROM employee_commissions WHERE "appointmentId" = ${input.appointmentId} FOR UPDATE`;
    await db.$queryRaw`SELECT id FROM financial_transactions WHERE id = ${input.expected.incomeId} FOR UPDATE`;
  }
  const existing = await db.subscriptionCycle.findUnique({ where: { subscriptionId_dueDate: { subscriptionId: input.subscriptionId, dueDate: due } }, include: { payment: true } });
  const previous = await db.auditLog.findFirst({ where: { entity: 'Appointment', entityId: input.appointmentId, action: 'LEGACY_SUBSCRIPTION_RECONCILED' } });
  if (existing || previous) {
    const meta = previous?.metadata as { operationKey?: string; subscriptionId?: string; cycleId?: string; expected?: unknown } | null;
    if (!existing || !previous || existing.confirmationKey !== input.operationKey || existing.payment.reconciliationKey !== input.operationKey ||
        existing.payment.source !== 'LEGACY_ADMIN_RECONCILIATION' || existing.payment.status !== 'PAID' || existing.payment.deletedAt ||
        existing.payment.method !== null || existing.payment.paidAt !== null || cents(existing.payment.amount) !== cents(input.amount) ||
        meta?.operationKey !== input.operationKey || meta.subscriptionId !== input.subscriptionId || meta.cycleId !== existing.id ||
        !isDeepStrictEqual(meta.expected, input.expected)) throw new Error('Payment/ciclo existente exige conciliacao; nenhum recebimento duplicado.');
    return { status: 'ALREADY_RECONCILED' as const, cycleId: existing.id, paymentId: existing.paymentId, writes: 0 };
  }
  const subscription = await db.subscription.findUniqueOrThrow({ where: { id: input.subscriptionId }, include: {
    subscriptionPlan: { include: { services: true } }, client: { select: { user: { select: { name: true } } } },
    dueDayChanges: { where: { appliedAt: null }, orderBy: { createdAt: 'asc' } }
  } });
  if (subscription.clientId !== input.expected.clientId || subscription.subscriptionPlanId !== input.expected.planId || subscription.deletedAt ||
      !subscription.active || subscription.status !== 'ACTIVE' || subscription.billingFirstDueDate || subscription.dueDayChanges.length ||
      subscription.startDate > due || !subscription.endDate || dateInputFromDate(subscription.endDate) !== dateInputFromDate(due) ||
      cents(subscription.subscriptionPlan.value) !== cents(input.amount)) throw new Error('Estado legado/valor/ciclo diverge da evidencia auditada.');
  const priorPaid = await db.payment.findFirst({ where: { subscriptionId: subscription.id, status: 'PAID', deletedAt: null } });
  if (priorPaid) throw new Error('Payment existente sem ciclo conciliado: bloquear duplicacao.');
  const overlapping = await db.subscription.findFirst({ where: { clientId: subscription.clientId, id: { not: subscription.id }, deletedAt: null, active: true, status: 'ACTIVE',
    startDate: { lte: due }, OR: [{ endDate: null }, { endDate: { gte: due } }] } });
  if (overlapping) throw new Error('Outra assinatura sobreposta exige revisao.');
  const paidPayout = await db.subscriptionPayout.findFirst({ where: { competenceMonth: input.competenceMonth, OR: [{ status: 'PAID' }, { paidAmount: { gt: 0 } }, { paidAt: { not: null } }] } });
  if (paidPayout) throw new Error('Repasse mensal ja pago: revisao sem clawback obrigatoria.');
  const appointment = await db.appointment.findUniqueOrThrow({ where: { id: input.appointmentId }, include: {
    service: true, services: { include: { service: true } }, commissions: true, payments: true,
    client: { include: { subscriptions: { include: { subscriptionPlan: { include: { services: true } } } } } }
  } });
  if (appointment.clientId !== input.expected.clientId || appointment.barberId !== input.expected.barberId ||
      appointment.serviceId !== input.expected.serviceId || appointment.dataHora.toISOString() !== input.expected.dataHora ||
      appointment.status !== 'COMPLETED' || appointment.deletedAt || dateInputFromDate(appointment.dataHora).slice(0, 7) !== input.competenceMonth) throw new Error('Outro Appointment ou estado auditado divergente.');
  if (!subscription.subscriptionPlan.services.some(row => row.serviceId === input.expected.serviceId)) throw new Error('Servico nao pertence ao plano pelo ID.');
  if (appointment.commissions.length !== 1 || appointment.commissions[0].id !== input.expected.commissionId || appointment.commissions[0].barberId !== appointment.barberId ||
      appointment.commissions[0].paid || appointment.commissions[0].paidAt || cents(appointment.commissions[0].amount) !== cents(input.expected.normalCommission)) throw new Error('Comissao paga ou divergente: operacao bloqueada.');
  if (appointment.payments.some(row => row.status === 'PAID')) throw new Error('Pagamento individual exige conciliacao separada.');
  const closure = await db.financialClosure.findFirst({ where: { closedAt: { not: null }, startDate: { lte: appointment.dataHora }, endDate: { gte: appointment.dataHora } } });
  if (closure) throw new Error('Periodo fechado: operacao bloqueada.');
  const incomes = await db.financialTransaction.findMany({ where: { deletedAt: null, description: { startsWith: `Atendimento finalizado: ${appointment.id} - ` } } });
  if (incomes.length !== 1 || incomes[0].id !== input.expected.incomeId || incomes[0].type !== 'INCOME' || incomes[0].paymentId || incomes[0].expenseId || cents(incomes[0].amount) !== cents(input.expected.normalGross)) throw new Error('INCOME ambiguo ou divergente.');
  const duplicate = await db.manualService.findFirst({ where: { clientId: appointment.clientId, barberId: appointment.barberId, deletedAt: null,
    serviceDate: { gte: new Date(`${dateInputFromDate(appointment.dataHora)}T00:00:00-03:00`), lt: new Date(+new Date(`${dateInputFromDate(appointment.dataHora)}T00:00:00-03:00`) + 86400000) } } });
  if (duplicate) throw new Error('Visita manual equivalente: revisao obrigatoria.');
  const beforeFinancials = appointmentFinancials(appointment);
  if (beforeFinancials.hasCoveredVisit || cents(beforeFinancials.chargedGross) !== cents(input.expected.normalGross) || cents(beforeFinancials.commission) !== cents(input.expected.normalCommission)) throw new Error('Classificacao anterior divergente.');
  const before = await calculateSubscriptionPayouts(input.competenceMonth, db);
  if (cents(before.revenueBase) !== cents(input.expected.revenue) || cents(before.poolAmount) !== cents(input.expected.pool) || before.totalAttendances !== input.expected.totalVisits ||
      before.currentDistribution.length !== input.expected.barberCounts.length || before.currentDistribution.some(row => input.expected.barberCounts.find(item => item.barberId === row.barberId)?.count !== row.count)) throw new Error('Pool/distribuicao mudou desde auditoria.');
  const preview = projectSubscriptionBilling({ ...subscription, baseDueDay: input.baseDay, nextCycleDueDate: due, nextCycleStartDate: due });
  if (+appointment.dataHora < +due || +appointment.dataHora >= +new Date(preview.coverageEndDate)) throw new Error('Atendimento fora do ciclo conciliado.');
  const projectedSnapshot = { version: 1 as const, plan: subscription.subscriptionPlan.name,
    services: beforeFinancials.snapshot.services.map(item => ({ ...item, covered: subscription.subscriptionPlan.services.some(row => row.serviceId === item.id) })) };
  const projectedFinancials = appointmentFinancials({ ...appointment, financialSnapshot: projectedSnapshot });
  const counts = before.currentDistribution.map(row => ({ barberId: row.barberId, count: row.count + (row.barberId === appointment.barberId ? 1 : 0) }));
  const projectedAmounts = distributeSubscriptionPoolCents(cents(before.poolAmount), counts);
  const projection = { revenue: before.revenueBase, pool: before.poolAmount, totalVisits: before.totalAttendances + 1,
    distribution: counts.map(row => ({ ...row, amount: (projectedAmounts.get(row.barberId) ?? 0) / 100 })),
    appointmentGross: projectedFinancials.chargedGross, appointmentCommission: projectedFinancials.commission };
  if (dryRun) return { status: 'DRY_RUN' as const, writes: 0, projection };
  const evidence = { source: 'business-confirmed-legacy-reconciliation', reason: input.reason, competenceMonth: input.competenceMonth,
    baseDaySource: 'business-confirmed', exactPaidDateKnown: false, methodKnown: false, appointmentId: input.appointmentId };
  const cycle = await persistConfirmedSubscriptionCycle(db, subscription, preview, { source: 'LEGACY_ADMIN_RECONCILIATION',
    userId: input.userId, operationKey: input.operationKey, evidence });
  const correction = await reclassifySubscriptionAppointmentInTransaction(db, { appointmentId: input.appointmentId, subscriptionId: input.subscriptionId,
    userId: input.userId, reason: input.reason });
  if (correction.alreadyCorrected) throw new Error('Reclassificacao preexistente sem conciliacao atomica.');
  const after = await calculateSubscriptionPayouts(input.competenceMonth, db);
  if (cents(after.revenueBase) !== cents(before.revenueBase) || cents(after.poolAmount) !== cents(before.poolAmount) || after.totalAttendances !== before.totalAttendances + 1 ||
      after.currentDistribution.some(row => counts.find(item => item.barberId === row.barberId)?.count !== row.count || cents(row.amount) !== projectedAmounts.get(row.barberId)) ||
      cents(correction.after!.gross) !== cents(projectedFinancials.chargedGross) || cents(correction.after!.commission) !== cents(projectedFinancials.commission)) throw new Error('Invariantes financeiras falharam; rollback total.');
  await db.auditLog.create({ data: { userId: input.userId, entity: 'Appointment', entityId: input.appointmentId, action: 'LEGACY_SUBSCRIPTION_RECONCILED',
    metadata: { operationKey: input.operationKey, subscriptionId: input.subscriptionId, appointmentId: input.appointmentId, cycleId: cycle.id, paymentId: cycle.paymentId,
      competenceMonth: input.competenceMonth, reason: input.reason, evidence, expected: input.expected,
      previous: { subscriptionStart: subscription.startDate.toISOString(), subscriptionEnd: subscription.endDate?.toISOString(), snapshot: beforeFinancials.snapshot,
        incomeId: incomes[0].id, gross: beforeFinancials.chargedGross, commissionId: appointment.commissions[0].id, commission: beforeFinancials.commission,
        revenue: before.revenueBase, pool: before.poolAmount, visits: before.totalAttendances },
      corrected: { snapshot: projectedSnapshot, ...projection }, reconciledAt: new Date().toISOString(), paidAt: null, method: null } } });
  return { status: 'RECONCILED' as const, paymentId: cycle.paymentId, cycleId: cycle.id, projection };
}
