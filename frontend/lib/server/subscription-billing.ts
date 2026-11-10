import { createHash } from "node:crypto";
import { Prisma, type PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dateInputFromDate, isValidDateInput, startOfSaoPauloDay, todayDateInput } from "@/lib/server/date-periods";
import { assertDueDay, dueDateInMonth, nextCycleDueDate } from "@/lib/server/subscription-calendar";
import { isReviewedLegacyCancellation } from "@/lib/server/legacy-closed-contracts";

const include = { subscriptionPlan: { include: { services: true } }, client: { select: { user: { select: { name: true } } } }, dueDayChanges: { where: { appliedAt: null }, orderBy: { createdAt: "asc" as const } } } as const;
export type BillingSubscription = Prisma.SubscriptionGetPayload<{ include: typeof include }>;

async function assertAdmin(userId: string, db: Prisma.TransactionClient) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, active: true, deletedAt: true } });
  if (!user || user.role !== "ADMIN" || !user.active || user.deletedAt) throw new Error("Somente ADMIN pode executar esta operacao.");
}

async function load(subscriptionId: string, db: Prisma.TransactionClient) {
  const subscription = await db.subscription.findUnique({ where: { id: subscriptionId }, include });
  if (!subscription || subscription.deletedAt || ["CANCELED", "REJECTED"].includes(subscription.status)) throw new Error("Assinatura indisponivel para esta operacao.");
  return subscription;
}

export function projectSubscriptionBilling(subscription: BillingSubscription, newDay?: number) {
  const baseDay = subscription.baseDueDay ?? Number(dateInputFromDate(subscription.startDate).slice(8));
  const due = subscription.nextCycleDueDate ?? startOfSaoPauloDay(dateInputFromDate(subscription.endDate ?? subscription.startDate));
  if (subscription.baseDueDay === null && subscription.endDate && +dueDateInMonth(dateInputFromDate(due).slice(0, 7), baseDay) !== +due) {
    throw new Error("Esta assinatura antiga precisa ter o vencimento operacional conciliado antes da renovacao. Nenhuma mensalidade sera inferida.");
  }
  const pending = subscription.dueDayChanges[0];
  const applicable = pending && +due >= +pending.afterDueDate;
  const nextDay = newDay ?? (applicable ? pending.newDay : baseDay);
  const nextDue = nextCycleDueDate(due, nextDay);
  const coverageStart = subscription.nextCycleStartDate ?? due;
  const coverageEnd = nextCycleDueDate(due, baseDay);
  const action = newDay === undefined ? "payment" : "schedule";
  const operationKey = createHash("sha256").update(JSON.stringify({ action, id: subscription.id, due: due.toISOString(), nextDay, updatedAt: subscription.updatedAt, planId: subscription.subscriptionPlanId, planUpdatedAt: subscription.subscriptionPlan.updatedAt, coveredServiceIds: subscription.subscriptionPlan.services.map(item => item.serviceId).sort(), amount: String(subscription.subscriptionPlan.value), pending: pending?.id })).digest("hex");
  return {
    subscriptionId: subscription.id, clientName: subscription.client.user.name,
    planName: subscription.subscriptionPlan.name, amount: Number(subscription.subscriptionPlan.value),
    baseDay, newDay: nextDay, currentDueDate: due.toISOString(), nextDueDate: nextDue.toISOString(),
    coverageStartDate: coverageStart.toISOString(), coverageEndDate: coverageEnd.toISOString(),
    competenceMonth: dateInputFromDate(due).slice(0, 7), operationKey,
    pendingChange: pending ? { newDay: pending.newDay, effectiveDueDate: pending.effectiveDueDate.toISOString() } : null,
    legacy: subscription.baseDueDay === null,
    needsInitialReview: subscription.billingFirstDueDate === null,
    originalStartDate: subscription.startDate.toISOString(),
    overdue: dateInputFromDate(due) < todayDateInput(),
    stillOverdueAfterPayment: dateInputFromDate(coverageEnd) <= todayDateInput()
  };
}

export async function previewSubscriptionBilling(subscriptionId: string, userId: string, newDay?: number, db: Prisma.TransactionClient = prisma) {
  await assertAdmin(userId, db);
  if (newDay !== undefined) assertDueDay(newDay);
  const subscription = await load(subscriptionId, db);
  if (newDay !== undefined && subscription.dueDayChanges.length) throw new Error("Ja existe alteracao programada. Ela nao pode ser sobrescrita.");
  if (newDay !== undefined && newDay === (subscription.baseDueDay ?? Number(dateInputFromDate(subscription.startDate).slice(8)))) throw new Error("Escolha um dia diferente do atual.");
  return projectSubscriptionBilling(subscription, newDay);
}

/** A new contract must not hide an old obligation or reset an unknown legacy anchor. */
export async function assertNoClosedSubscriptionArrears(clientId: string, db: Prisma.TransactionClient = prisma) {
  const previous = await db.subscription.findMany({ where: { clientId, deletedAt: null, status: { in: ["CANCELED", "EXPIRED"] } } });
  for (const row of previous) {
    if (await isReviewedLegacyCancellation(row, db)) continue;
    if (!row.billingFirstDueDate) throw new Error("Assinatura anterior legada exige revisao administrativa antes de abrir outro ciclo. Nenhuma divida foi presumida.");
    const cutoff = row.status === "CANCELED" && row.endDate ? row.endDate : new Date();
    if (row.nextCycleDueDate && row.nextCycleDueDate <= cutoff) throw new Error("Existe ciclo anterior pendente. Cancelar e recriar nao quita a obrigacao; solicite conciliacao administrativa.");
  }
}

async function lock(subscriptionId: string, db: Prisma.TransactionClient) {
  await db.$queryRaw`SELECT id FROM subscriptions WHERE id = ${subscriptionId} FOR UPDATE`;
}

export async function confirmSubscriptionPayment(input: { subscriptionId: string; userId: string; operationKey: string; method: PaymentMethod; paidDate: string; acknowledgeLegacy: boolean }) {
  if (!isValidDateInput(input.paidDate) || input.paidDate > todayDateInput()) throw new Error("Informe a data real do pagamento, nao futura.");
  return prisma.$transaction(async (db) => {
    await assertAdmin(input.userId, db);
    await db.$queryRaw`SELECT id FROM clients WHERE id = (SELECT "clientId" FROM subscriptions WHERE id = ${input.subscriptionId}) FOR UPDATE`;
    await lock(input.subscriptionId, db);
    const previous = await db.subscriptionCycle.findUnique({ where: { confirmationKey: input.operationKey } });
    if (previous) {
      if (previous.subscriptionId !== input.subscriptionId) throw new Error("Confirmacao invalida.");
      return { alreadyConfirmed: true, cycleId: previous.id };
    }
    const subscription = await load(input.subscriptionId, db);
    if (!subscription.billingFirstDueDate) {
      const legacyPayment = await db.payment.findFirst({ where: { subscriptionId: subscription.id, status: "PAID", deletedAt: null } });
      if (legacyPayment) throw new Error("Existe pagamento legado sem ciclo conciliado. Vincule a evidencia ao ciclo correto antes de confirmar; nenhum novo recebimento foi criado.");
      await assertNoClosedSubscriptionArrears(subscription.clientId, db);
    }
    if (!['CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER'].includes(input.method)) throw new Error("Informe o metodo real do pagamento normal.");
    const preview = projectSubscriptionBilling(subscription);
    if (preview.operationKey !== input.operationKey) throw new Error("Previa desatualizada. Confira novamente antes de confirmar.");
    if (preview.needsInitialReview && !input.acknowledgeLegacy) throw new Error("Confira a data original e a obrigacao registrada antes da primeira confirmacao.");
    const endDate = new Date(preview.coverageEndDate);
    if (!subscription.billingFirstDueDate) {
      const overlapping = await db.subscription.findFirst({ where: { clientId: subscription.clientId, id: { not: subscription.id }, deletedAt: null, active: true, status: "ACTIVE", startDate: { lt: endDate }, OR: [{ endDate: null }, { endDate: { gte: new Date(preview.coverageStartDate) } }] }, select: { id: true } });
      if (overlapping) throw new Error("Outra assinatura ativa cobre este periodo. Conciliacao obrigatoria para nao duplicar mensalidade.");
    }
    const cycle = await persistConfirmedSubscriptionCycle(db, subscription, preview, {
      source: 'NORMAL', method: input.method, paidDate: input.paidDate, userId: input.userId, operationKey: input.operationKey
    });
    return { alreadyConfirmed: false, cycleId: cycle.id };
  }, { timeout: 20000, maxWait: 10000 });
}

type ConfirmedReceipt = { userId: string; operationKey: string } &
  ({ source: 'NORMAL'; method: PaymentMethod; paidDate: string } |
   { source: 'LEGACY_ADMIN_RECONCILIATION'; evidence: Prisma.InputJsonObject });

export async function persistConfirmedSubscriptionCycle(db: Prisma.TransactionClient, subscription: BillingSubscription,
  preview: ReturnType<typeof projectSubscriptionBilling>, receipt: ConfirmedReceipt) {
    await assertAdmin(receipt.userId, db);
    if (receipt.source === 'NORMAL' && (!isValidDateInput(receipt.paidDate) || receipt.paidDate > todayDateInput() || !['CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER'].includes(receipt.method))) throw new Error("Dados reais de pagamento normal obrigatorios.");
    const dueDate = new Date(preview.currentDueDate);
    const endDate = new Date(preview.coverageEndDate);
    const reconciledAt = receipt.source === 'LEGACY_ADMIN_RECONCILIATION' ? new Date() : null;
    const payment = await db.payment.create({ data: {
      clientId: subscription.clientId, subscriptionId: subscription.id, source: receipt.source,
      method: receipt.source === 'NORMAL' ? receipt.method : null,
      status: "PAID", amount: subscription.subscriptionPlan.value,
      paidAt: receipt.source === 'NORMAL' ? startOfSaoPauloDay(receipt.paidDate) : null,
      ...(receipt.source === 'LEGACY_ADMIN_RECONCILIATION' ? { reconciledAt, reconciliationKey: receipt.operationKey, reconciliationEvidence: receipt.evidence } : {}),
      transactions: { create: { type: "INCOME", amount: subscription.subscriptionPlan.value, description: `Mensalidade ${preview.competenceMonth}: ${subscription.subscriptionPlan.name}` } }
    } });
    const cycle = await db.subscriptionCycle.create({ data: {
      confirmationKey: receipt.operationKey, subscriptionId: subscription.id, dueDate, endDate, coverageStartDate: new Date(preview.coverageStartDate),
      competenceMonth: preview.competenceMonth, baseDueDay: preview.baseDay,
      planId: subscription.subscriptionPlanId, planName: subscription.subscriptionPlan.name,
      coveredServiceIds: subscription.subscriptionPlan.services.map((item) => item.serviceId),
      paymentId: payment.id, confirmedById: receipt.userId
    } });
    const change = subscription.dueDayChanges[0];
    if (change && +dueDate >= +change.afterDueDate) {
      await db.subscriptionDueDayChange.update({ where: { id: change.id }, data: { appliedAt: new Date() } });
    }
    await db.subscription.update({ where: { id: subscription.id }, data: {
      active: true, status: "ACTIVE", baseDueDay: preview.newDay, nextCycleDueDate: new Date(preview.nextDueDate), nextCycleStartDate: endDate,
      endDate: new Date(+endDate - 1),
      ...(subscription.billingFirstDueDate ? {} : {
        billingFirstDueDate: dueDate,
        legacyRevenueSnapshot: { active: subscription.active, status: subscription.status, startDate: subscription.startDate.toISOString(), endDate: subscription.endDate?.toISOString() ?? null, value: String(subscription.subscriptionPlan.value), confirmedAt: new Date().toISOString(), planName: subscription.subscriptionPlan.name, coveredServiceIds: subscription.subscriptionPlan.services.map(item => item.serviceId) }
      })
    } });
    await db.auditLog.create({ data: { userId: receipt.userId, action: "SUBSCRIPTION_PAYMENT_CONFIRMED", entity: "Subscription", entityId: subscription.id,
      metadata: { cycleId: cycle.id, paymentId: payment.id, previousEndDate: subscription.endDate?.toISOString() ?? null, nextDueDate: preview.nextDueDate, coverageStartDate: preview.coverageStartDate, coverageEndDate: preview.coverageEndDate, dueDate: preview.currentDueDate, competenceMonth: preview.competenceMonth, amount: String(subscription.subscriptionPlan.value), source: receipt.source, paidDate: receipt.source === 'NORMAL' ? receipt.paidDate : null, method: receipt.source === 'NORMAL' ? receipt.method : null, reconciledAt: reconciledAt?.toISOString() ?? null, baseDay: preview.baseDay, resultingBaseDay: preview.newDay } } });
    return cycle;
}

export async function scheduleSubscriptionDueDay(input: { subscriptionId: string; userId: string; operationKey: string; newDay: number }) {
  assertDueDay(input.newDay);
  return prisma.$transaction(async (db) => {
    await assertAdmin(input.userId, db);
    await lock(input.subscriptionId, db);
    const previous = await db.subscriptionDueDayChange.findUnique({ where: { requestKey: input.operationKey } });
    if (previous) {
      if (previous.subscriptionId !== input.subscriptionId) throw new Error("Alteracao invalida.");
      return previous;
    }
    const preview = await previewSubscriptionBilling(input.subscriptionId, input.userId, input.newDay, db);
    if (preview.operationKey !== input.operationKey) throw new Error("Previa desatualizada. Confira novamente.");
    const change = await db.subscriptionDueDayChange.create({ data: {
      requestKey: input.operationKey, subscriptionId: input.subscriptionId, previousDay: preview.baseDay,
      newDay: input.newDay, afterDueDate: new Date(preview.currentDueDate),
      effectiveDueDate: new Date(preview.nextDueDate), configuredById: input.userId
    } });
    await db.auditLog.create({ data: { userId: input.userId, action: "SUBSCRIPTION_DUE_DAY_SCHEDULED", entity: "Subscription", entityId: input.subscriptionId,
      metadata: { changeId: change.id, previousDay: preview.baseDay, newDay: input.newDay, afterDueDate: preview.currentDueDate, effectiveDueDate: preview.nextDueDate } } });
    return change;
  }, { timeout: 20000, maxWait: 10000 });
}

export type SubscriptionBillingPreview = Awaited<ReturnType<typeof previewSubscriptionBilling>>;
