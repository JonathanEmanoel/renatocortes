import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { reconcileLegacySubscriptionAnchor } from '@/lib/server/legacy-subscription-anchors';
import { assertNoClosedSubscriptionArrears, confirmSubscriptionPayment, previewSubscriptionBilling, projectSubscriptionBilling } from '@/lib/server/subscription-billing';
import { isReviewedLegacyCancellation } from '@/lib/server/legacy-closed-contracts';
import { dueDateInMonth } from '@/lib/server/subscription-calendar';

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/renato_cortes_test' || process.env.CONFIRM_LOCAL_TEST_DATABASE !== 'renato_cortes_test' || process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url) throw new Error('LOCAL TEST DATABASE ONLY');
const clientId = 'd754249c-0ac5-4784-b2b1-46101be92f38';
const subId = '2c8faf6a-b0f3-458d-b930-2fc5b7837f50';
const oldId = 'b47d38bb-00b7-4d77-b91b-29af71a0fc42';
const planId = '2e6f0836-7f29-4c82-88ee-eab3551fbdeb';
const created: { customer?: string; admin?: string; plan?: string; service?: string } = {};
let ownFixtures = false;
const checks: string[] = [];
const original = prisma.$transaction.bind(prisma);
function signal() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
async function main() {
  // Never overwrite a restored/local record that was not created by this test.
  if (await prisma.client.findUnique({ where: { id: clientId } }) || await prisma.subscription.findFirst({ where: { id: { in: [subId, oldId] } } })) throw new Error('Fixture IDs already occupied; no overwrite allowed');
  const suffix = randomUUID();
  const admin = await prisma.user.create({ data: { authId: 'rc-admin-' + suffix, email: suffix + '@local.test', name: 'RC fixture admin', role: 'ADMIN' } }); created.admin = admin.id;
  const customer = await prisma.user.create({ data: { authId: 'rc-customer-' + suffix, email: 'customer-' + suffix + '@local.test', name: 'RC fixture customer', role: 'CLIENT', client: { create: { id: clientId } } } }); created.customer = customer.id; ownFixtures = true;
  let plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId }, include: { services: true } });
  if (!plan) {
    const service = await prisma.service.create({ data: { name: 'RC fixture ' + suffix, duration: 30, price: 30 } }); created.service = service.id;
    plan = await prisma.subscriptionPlan.create({ data: { id: planId, name: 'RC fixture plan ' + suffix, value: 130, services: { create: { serviceId: service.id } } }, include: { services: true } }); created.plan = plan.id;
  }
  assert.equal(Number(plan.value), 130);
  const request = { subscriptionId: subId as typeof subId, userId: admin.id, expectedPlanId: planId, expectedAmount: '130', expectedServiceIds: plan.services.map(x => x.serviceId), reason: 'Local RC fixture preserving audited legacy due date' };
  await prisma.subscription.create({ data: { id: oldId, clientId, subscriptionPlanId: planId, status: 'CANCELED', active: false, startDate: new Date('2026-09-18T19:56:19.892Z'), createdAt: new Date('2026-09-18T19:56:19.893Z'), endDate: new Date('2026-09-18T20:07:19.193Z'), updatedAt: new Date('2026-09-18T20:07:19.194Z') } });
  async function reset() {
    await prisma.auditLog.deleteMany({ where: { entityId: subId } });
    const receipts = await prisma.payment.findMany({ where: { subscriptionId: subId }, select: { id: true } });
    await prisma.subscriptionCycle.deleteMany({ where: { subscriptionId: subId } });
    await prisma.financialTransaction.deleteMany({ where: { paymentId: { in: receipts.map(x => x.id) } } });
    await prisma.payment.deleteMany({ where: { subscriptionId: subId } });
    await prisma.subscription.deleteMany({ where: { id: subId } });
    await prisma.subscription.create({ data: { id: subId, clientId, subscriptionPlanId: planId, status: 'ACTIVE', active: true, startDate: new Date('2026-10-09T14:10:03.069Z'), endDate: new Date('2026-11-08T14:10:03.069Z'), updatedAt: new Date('2026-10-09T14:10:03.070Z') } });
  }
  for (const first of ['reconcile', 'confirm'] as const) {
    await reset();
    const before = await prisma.subscription.findUniqueOrThrow({ where: { id: subId }, include: { subscriptionPlan: { include: { services: true } }, client: { select: { user: { select: { name: true } } } }, dueDayChanges: true } });
    const projected = projectSubscriptionBilling({ ...before, baseDueDay: 8, nextCycleDueDate: new Date('2026-11-08T03:00:00Z'), nextCycleStartDate: new Date('2026-11-08T03:00:00Z') });
    const payment = { subscriptionId: subId, userId: admin.id, operationKey: projected.operationKey, method: 'PIX' as const, paidDate: '2026-11-09', acknowledgeLegacy: true };
    const held = signal(), secondStarted = signal(), release = signal(); let calls = 0;
    prisma.$transaction = ((fn: (db: Prisma.TransactionClient) => Promise<unknown>, options: { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number; maxWait?: number }) => original(async db => {
      if (++calls === 1) { await db.$queryRaw`SELECT id FROM clients WHERE id = ${clientId} FOR UPDATE`; held.resolve(); await release.promise; }
      else secondStarted.resolve();
      return fn(db);
    }, options)) as typeof prisma.$transaction;
    const reconcile = () => reconcileLegacySubscriptionAnchor(request, { dryRun: false });
    const confirm = () => confirmSubscriptionPayment(payment);
    const a = (first === 'reconcile' ? reconcile() : confirm()).then(value => ({ ok: true, value }), error => ({ ok: false, error }));
    await held.promise;
    const b = (first === 'reconcile' ? confirm() : reconcile()).then(value => ({ ok: true, value }), error => ({ ok: false, error }));
    await secondStarted.promise; release.resolve();
    const outcomes = await Promise.all([a, b]); prisma.$transaction = original;
    assert.equal(outcomes.filter(x => x.ok).length, 1);
    const rejected = outcomes.find(x => !x.ok) as { error: Error };
    assert.match(rejected.error.message, /Previa desatualizada|vencimento operacional|serialize|write conflict|deadlock/i);
    assert.equal(await prisma.payment.count({ where: { subscriptionId: subId } }), 0);
    let state = await prisma.subscription.findUniqueOrThrow({ where: { id: subId } });
    // Serializable conflict can abort the reconciler; retry requires a fresh, unchanged baseline.
    if (state.baseDueDay === null) await reconcileLegacySubscriptionAnchor(request, { dryRun: false });
    state = await prisma.subscription.findUniqueOrThrow({ where: { id: subId } }); assert.equal(state.baseDueDay, 8);
    const preview = await previewSubscriptionBilling(subId, admin.id);
    await confirmSubscriptionPayment({ ...payment, operationKey: preview.operationKey });
    await confirmSubscriptionPayment({ ...payment, operationKey: preview.operationKey });
    const receipts = await prisma.payment.findMany({ where: { subscriptionId: subId } }); assert.equal(receipts.length, 1); assert.equal(Number(receipts[0].amount), 130);
    assert.equal(await prisma.financialTransaction.count({ where: { paymentId: receipts[0].id } }), 1);
    assert.equal(await prisma.subscriptionCycle.count({ where: { subscriptionId: subId } }), 1);
    const final = await prisma.subscription.findUniqueOrThrow({ where: { id: subId } }); assert.equal(final.baseDueDay, 8); assert.equal(final.nextCycleDueDate?.toISOString(), '2026-12-08T03:00:00.000Z');
    checks.push(first + '_first_real_locks_stale_request_aborted_then_fresh_confirmation_unique');
  }
  await reset();
  assert.equal((await reconcileLegacySubscriptionAnchor(request)).status, 'DRY_RUN');
  await prisma.payment.create({ data: { subscriptionId: subId, clientId, method: 'PIX', amount: 130, status: 'PAID' } });
  await assert.rejects(reconcileLegacySubscriptionAnchor(request, { dryRun: false }), /Baseline mudou/);
  assert.equal((await prisma.subscription.findUniqueOrThrow({ where: { id: subId } })).baseDueDay, null);
  checks.push('payment_created_after_dryrun_blocks_anchor_without_partial_write');
  await reset();
  await prisma.subscription.update({ where: { id: subId }, data: { updatedAt: new Date() } });
  await assert.rejects(reconcileLegacySubscriptionAnchor(request, { dryRun: false }), /baseline|Baseline/);
  assert.equal(await prisma.auditLog.count({ where: { action: 'LEGACY_SUBSCRIPTION_ANCHOR_RECONCILED', entityId: subId } }), 0); checks.push('changed_baseline_aborted');
  const old = await prisma.subscription.findUniqueOrThrow({ where: { id: oldId } });
  for (const status of ['PENDING', 'ACTIVE'] as const) { assert.equal(await isReviewedLegacyCancellation({ ...old, status }, prisma), false); }
  await prisma.payment.create({ data: { subscriptionId: oldId, clientId, method: 'PIX', amount: 130, status: 'PAID' } });
  assert.equal(await isReviewedLegacyCancellation(old, prisma), false);
  await assert.rejects(assertNoClosedSubscriptionArrears(clientId), /legada/); checks.push('pending_not_H3_and_financial_contradiction_blocked_real_SQL');
  await prisma.payment.deleteMany({ where: { subscriptionId: oldId } });
  await reset();
  await prisma.subscription.update({ where: { id: oldId }, data: { status: 'PENDING' } });
  await assert.rejects(reconcileLegacySubscriptionAnchor(request, { dryRun: false }), /Outro contrato/);
  checks.push('previous_PENDING_without_payment_blocks_anchor_not_H3');
  await prisma.payment.create({ data: { subscriptionId: oldId, clientId, method: 'PIX', amount: 130, status: 'PAID' } });
  await assert.rejects(reconcileLegacySubscriptionAnchor(request, { dryRun: false }), /Outro contrato/);
  checks.push('previous_PENDING_with_payment_not_exempted');
  await prisma.payment.deleteMany({ where: { subscriptionId: oldId } });
  await prisma.subscription.update({ where: { id: oldId }, data: { status: 'CANCELED', updatedAt: new Date('2026-09-18T20:07:19.194Z') } });
  await prisma.subscription.update({ where: { id: subId }, data: { status: 'PENDING', active: false } });
  await assert.rejects(reconcileLegacySubscriptionAnchor(request, { dryRun: false }), /Baseline mudou/);
  await prisma.subscription.update({ where: { id: subId }, data: { status: 'ACTIVE', active: true, updatedAt: new Date('2026-10-09T14:10:03.070Z') } });
  assert.equal(await prisma.subscription.count({ where: { clientId, status: 'ACTIVE' } }), 1);
  assert.equal((await reconcileLegacySubscriptionAnchor(request)).status, 'DRY_RUN');
  checks.push('same_PENDING_becomes_ACTIVE_single_identity_valid');
  for (const day of [8, 28, 29, 30, 31]) {
    await reset();
    const due = dueDateInMonth('2026-11', day);
    await prisma.subscription.update({ where: { id: subId }, data: { baseDueDay: day, nextCycleDueDate: due, nextCycleStartDate: due } });
    const preview = await previewSubscriptionBilling(subId, admin.id);
    await confirmSubscriptionPayment({ subscriptionId: subId, userId: admin.id, operationKey: preview.operationKey, method: 'PIX', paidDate: '2026-10-31', acknowledgeLegacy: true });
    const state = await prisma.subscription.findUniqueOrThrow({ where: { id: subId } }); assert.equal(state.baseDueDay, day); assert.equal(state.nextCycleDueDate?.toISOString(), dueDateInMonth('2026-12', day).toISOString());
    checks.push('early_month_boundary_payment_base_' + day);
  }
  console.log(JSON.stringify({ pass: checks.length, fail: 0, checks, productionWrites: 0 }));
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'Test failed'); process.exitCode = 1; }).finally(async () => {
  prisma.$transaction = original;
  if (ownFixtures) {
    const ids = [subId, oldId]; const p = await prisma.payment.findMany({ where: { subscriptionId: { in: ids } }, select: { id: true } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.subscriptionCycle.deleteMany({ where: { subscriptionId: { in: ids } } });
    await prisma.financialTransaction.deleteMany({ where: { paymentId: { in: p.map(x => x.id) } } });
    await prisma.payment.deleteMany({ where: { subscriptionId: { in: ids } } });
    await prisma.subscription.deleteMany({ where: { id: { in: ids } } });
    await prisma.client.delete({ where: { id: clientId } });
  }
  if (created.customer) await prisma.user.delete({ where: { id: created.customer } });
  if (created.admin) await prisma.user.delete({ where: { id: created.admin } });
  if (created.plan) { await prisma.subscriptionPlanService.deleteMany({ where: { subscriptionPlanId: created.plan } }); await prisma.subscriptionPlan.delete({ where: { id: created.plan } }); }
  if (created.service) await prisma.service.delete({ where: { id: created.service } });
  await prisma.$disconnect();
});
