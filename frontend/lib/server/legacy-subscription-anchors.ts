import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { dateInputFromDate, startOfSaoPauloDay } from '@/lib/server/date-periods';
import { projectSubscriptionBilling } from '@/lib/server/subscription-billing';

const candidates = {
  '2c8faf6a-b0f3-458d-b930-2fc5b7837f50': ['d754249c-0ac5-4784-b2b1-46101be92f38', '2026-10-09T14:10:03.069Z', '2026-11-08T14:10:03.069Z', '2026-10-09T14:10:03.070Z', 8],
  'be6604d8-4f75-4c54-b9f5-f2d88af72909': ['7461f164-5d2e-42c8-9431-652a47c62b97', '2026-10-12T13:27:27.092Z', '2026-11-11T13:27:27.092Z', '2026-10-12T13:27:27.093Z', 11]
} as const;

/** Administrative operation only; dry-run is the default. Never creates receipts or cycles. */
export async function reconcileLegacySubscriptionAnchor(input: {
  subscriptionId: keyof typeof candidates; userId: string; expectedPlanId: string;
  expectedAmount: string; expectedServiceIds: string[]; reason: string;
}, options: { dryRun?: boolean } = {}) {
  const expected = candidates[input.subscriptionId];
  if (!expected || input.reason.trim().length < 20) throw new Error('Candidato/motivo invalido.');
  const dryRun = options.dryRun !== false;
  return prisma.$transaction(async db => {
    if (dryRun) {
      await db.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const ro = await db.$queryRawUnsafe<{ transaction_read_only: string }[]>('SHOW transaction_read_only');
      if (ro[0]?.transaction_read_only !== 'on') throw new Error('READ ONLY obrigatorio.');
    } else {
      await db.$queryRaw`SELECT id FROM clients WHERE id = ${expected[0]} FOR UPDATE`;
      await db.$queryRaw`SELECT id FROM subscriptions WHERE "clientId" = ${expected[0]} ORDER BY id FOR UPDATE`;
    }
    const actor = await db.user.findUnique({ where: { id: input.userId }, select: { role: true, active: true, deletedAt: true } });
    if (!actor || actor.role !== 'ADMIN' || !actor.active || actor.deletedAt) throw new Error('Somente ADMIN.');
    const s = await db.subscription.findUniqueOrThrow({ where: { id: input.subscriptionId }, include: {
      subscriptionPlan: { include: { services: true } }, client: { select: { user: { select: { name: true } } } },
      dueDayChanges: true, payments: true, cycles: true
    } });
    const ids = s.subscriptionPlan.services.map(x => x.serviceId).sort();
    if (s.clientId !== expected[0] || s.status !== 'ACTIVE' || !s.active || s.deletedAt ||
        s.startDate.toISOString() !== expected[1] || s.endDate?.toISOString() !== expected[2] ||
        s.subscriptionPlanId !== input.expectedPlanId || String(s.subscriptionPlan.value) !== input.expectedAmount ||
        JSON.stringify(ids) !== JSON.stringify([...input.expectedServiceIds].sort()) ||
        s.billingFirstDueDate || s.legacyRevenueSnapshot || s.payments.length || s.cycles.length || s.dueDayChanges.length)
      throw new Error('Baseline mudou; nenhuma adaptacao automatica.');
    const due = startOfSaoPauloDay(dateInputFromDate(s.endDate));
    const key = createHash('sha256').update(JSON.stringify(['LEGACY_ANCHOR_V1', input.subscriptionId, expected, input.expectedPlanId, input.expectedAmount, ids])).digest('hex');
    const previous = await db.auditLog.findFirst({ where: { action: 'LEGACY_SUBSCRIPTION_ANCHOR_RECONCILED', entityId: s.id } });
    if (previous) {
      const meta = previous.metadata as { operationKey?: string } | null;
      if (meta?.operationKey !== key || s.baseDueDay !== expected[4] || +s.nextCycleDueDate! !== +due || +s.nextCycleStartDate! !== +due)
        throw new Error('Reconciliacao anterior divergente.');
      return { status: 'ALREADY_RECONCILED', writes: 0 };
    }
    if (s.updatedAt.toISOString() !== expected[3] || s.baseDueDay !== null || s.nextCycleDueDate || s.nextCycleStartDate)
      throw new Error('Ancora/baseline ja alterado.');
    const overlapping = await db.subscription.findFirst({ where: { clientId: s.clientId, id: { not: s.id }, deletedAt: null, status: { in: ['ACTIVE', 'PENDING'] } } });
    if (overlapping) throw new Error('Outro contrato em andamento; revisar.');
    const data = { baseDueDay: expected[4], nextCycleDueDate: due, nextCycleStartDate: due };
    const preview = projectSubscriptionBilling({ ...s, ...data });
    if (dryRun) return { status: 'DRY_RUN', writes: 0, operationKey: key, data, preview };
    await db.subscription.update({ where: { id: s.id }, data });
    await db.auditLog.create({ data: { userId: input.userId, action: 'LEGACY_SUBSCRIPTION_ANCHOR_RECONCILED', entity: 'Subscription', entityId: s.id,
      metadata: { operationKey: key, reason: input.reason, rule: 'PRESERVE_OPERATIONAL_LEGACY_DUE',
        before: { startDate: expected[1], endDate: expected[2], updatedAt: expected[3], baseDueDay: null, nextCycleDueDate: null, nextCycleStartDate: null },
        after: { baseDueDay: expected[4], nextCycleDueDate: due.toISOString(), nextCycleStartDate: due.toISOString() } } } });
    const after = await db.subscription.findUniqueOrThrow({ where: { id: s.id }, include: { payments: true, cycles: true } });
    if (after.startDate.toISOString() !== expected[1] || after.endDate?.toISOString() !== expected[2] ||
        after.billingFirstDueDate || after.legacyRevenueSnapshot || after.payments.length || after.cycles.length ||
        after.baseDueDay !== expected[4] || +after.nextCycleDueDate! !== +due || +after.nextCycleStartDate! !== +due)
      throw new Error('Invariantes falharam; rollback.');
    return { status: 'RECONCILED', operationKey: key };
  }, { isolationLevel: 'Serializable', timeout: 20000, maxWait: 5000 });
}
