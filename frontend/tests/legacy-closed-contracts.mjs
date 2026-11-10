import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const req = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = {};
let transaction;
const prisma = { $transaction: async fn => transaction(fn) };
function load(file) {
  if (cache[file]) return cache[file].exports;
  const container = { exports: {} }; cache[file] = container;
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { module: container, exports: container.exports, Date, Intl, require: id => id === '@/lib/prisma' ? { prisma } : id === '@prisma/client' ? {} : id.startsWith('@/') ? load(id.slice(2) + '.ts') : req(id) });
  return container.exports;
}
const { assertNoClosedSubscriptionArrears } = load('lib/server/subscription-billing.ts');
const date = s => new Date(s + 'Z');
const closed = { id: 'b47d38bb-00b7-4d77-b91b-29af71a0fc42', clientId: 'd754249c-0ac5-4784-b2b1-46101be92f38', status: 'CANCELED', active: false, deletedAt: null, startDate: date('2026-09-18T19:56:19.892'), endDate: date('2026-09-18T20:07:19.193'), createdAt: date('2026-09-18T19:56:19.893'), updatedAt: date('2026-09-18T20:07:19.194'), subscriptionPlanId: '2e6f0836-7f29-4c82-88ee-eab3551fbdeb', baseDueDay: null, billingFirstDueDate: null, nextCycleDueDate: null, nextCycleStartDate: null, legacyRevenueSnapshot: null };
function db(rows, evidence = false) { return { subscription: { findMany: async () => rows }, $queryRaw: async () => [{ contradiction: evidence }] }; }
(async () => {
  await assertNoClosedSubscriptionArrears(closed.clientId, db([closed]));
  await assert.rejects(assertNoClosedSubscriptionArrears(closed.clientId, db([closed], true)));
  await assert.rejects(assertNoClosedSubscriptionArrears(closed.clientId, db([{ ...closed, id: 'unreviewed' }])));
  await assert.rejects(assertNoClosedSubscriptionArrears(closed.clientId, db([{ ...closed, status: 'EXPIRED' }])));
  await assert.rejects(assertNoClosedSubscriptionArrears(closed.clientId, db([{ ...closed, updatedAt: new Date() }])));
  await assertNoClosedSubscriptionArrears(closed.clientId, db([]));
  await assertNoClosedSubscriptionArrears(closed.clientId, db([closed, closed]));
  await assert.rejects(assertNoClosedSubscriptionArrears(closed.clientId, db([closed, { ...closed, id: 'unknown' }])));
  await assert.rejects(assertNoClosedSubscriptionArrears(closed.clientId, db([{ ...closed, billingFirstDueDate: new Date(), nextCycleDueDate: closed.endDate }])));
  const { projectSubscriptionBilling, confirmSubscriptionPayment } = load('lib/server/subscription-billing.ts');
  const s = { ...closed, id: 'active-fixture', active: true, status: 'ACTIVE', startDate: date('2026-10-09T14:10:03.069'), endDate: date('2026-11-08T14:10:03.069'), baseDueDay: 8,
    nextCycleDueDate: date('2026-11-08T03:00:00'), nextCycleStartDate: date('2026-11-08T03:00:00'), dueDayChanges: [], client: { user: { name: 'Fixture' } }, subscriptionPlan: { value: 130, name: 'Fixture', updatedAt: new Date(), services: [{ serviceId: 'fixture' }] } };
  const writes = []; let cycle;
  transaction = fn => fn({ ...db([closed]),
    user: { findUnique: async () => ({ role: 'ADMIN', active: true }) },
    $queryRaw: async () => [{ contradiction: false }],
    subscription: { findMany: async () => [closed], findUnique: async () => s, findFirst: async () => null, update: async ({ data }) => Object.assign(s, data) },
    payment: { findFirst: async () => null, create: async ({ data }) => { writes.push('payment', 'income'); return { id: 'payment', ...data }; } },
    subscriptionCycle: { findUnique: async () => cycle, create: async ({ data }) => { writes.push('cycle'); cycle = { id: 'cycle', ...data }; return cycle; } },
    auditLog: { create: async () => ({}) }
  });
  const input = { subscriptionId: s.id, userId: 'admin', operationKey: projectSubscriptionBilling(s).operationKey, method: 'PIX', paidDate: '2026-11-09', acknowledgeLegacy: true };
  await confirmSubscriptionPayment(input);
  assert.equal(s.baseDueDay, 8); assert.equal(s.nextCycleDueDate.toISOString(), '2026-12-08T03:00:00.000Z');
  assert.equal(cycle.coverageStartDate.toISOString(), '2026-11-08T03:00:00.000Z'); assert.equal(cycle.endDate.toISOString(), '2026-12-08T03:00:00.000Z');
  assert.deepEqual(writes, ['payment', 'income', 'cycle']);
  assert.equal((await confirmSubscriptionPayment(input)).alreadyConfirmed, true); assert.equal(writes.length, 3);
  const { reconcileLegacySubscriptionAnchor } = load('lib/server/legacy-subscription-anchors.ts');
  const anchor = { ...s, id: '2c8faf6a-b0f3-458d-b930-2fc5b7837f50', updatedAt: date('2026-10-09T14:10:03.070'),
    endDate: date('2026-11-08T14:10:03.069'), baseDueDay: null, nextCycleDueDate: null, nextCycleStartDate: null,
    billingFirstDueDate: null, legacyRevenueSnapshot: null, payments: [], cycles: [] };
  let audit; let mutations = 0;
  transaction = fn => fn({ user: { findUnique: async () => ({ role: 'ADMIN', active: true }) },
    $queryRaw: async () => [], $executeRawUnsafe: async () => 0, $queryRawUnsafe: async () => [{ transaction_read_only: 'on' }],
    subscription: { findUniqueOrThrow: async () => anchor, findFirst: async () => null,
      update: async ({ data }) => { mutations++; Object.assign(anchor, data); return anchor; } },
    auditLog: { findFirst: async () => audit, create: async ({ data }) => { mutations++; audit = data; return data; } }
  });
  const request = { subscriptionId: anchor.id, userId: 'admin', expectedPlanId: anchor.subscriptionPlanId, expectedAmount: '130', expectedServiceIds: ['fixture'], reason: 'Preservar vencimento operacional aprovado' };
  assert.equal((await reconcileLegacySubscriptionAnchor(request)).status, 'DRY_RUN'); assert.equal(mutations, 0);
  assert.equal((await reconcileLegacySubscriptionAnchor(request, { dryRun: false })).status, 'RECONCILED');
  assert.equal((await reconcileLegacySubscriptionAnchor(request, { dryRun: false })).status, 'ALREADY_RECONCILED'); assert.equal(mutations, 2);
  anchor.payments.push({ id: 'new-payment' });
  await assert.rejects(reconcileLegacySubscriptionAnchor(request, { dryRun: false }), /Baseline mudou/); assert.equal(mutations, 2);
  const jose = { ...s, id: 'jose-fixture', baseDueDay: 11, startDate: date('2026-10-12T13:27:27.092'), endDate: date('2026-11-11T13:27:27.092'), nextCycleDueDate: date('2026-11-11T03:00:00'), nextCycleStartDate: date('2026-11-11T03:00:00'), billingFirstDueDate: null };
  assert.equal(projectSubscriptionBilling(jose).baseDay, 11);
  assert.equal(projectSubscriptionBilling(jose).nextDueDate, '2026-12-11T03:00:00.000Z');
  console.log('9 guard cases + full Alvaro confirmation/idempotency PASS; memory only, no database connection');
  console.log('Anchor dry-run/write/idempotency/changed baseline PASS; memory only');
})().catch(e => { console.error(e.message); process.exitCode = 1; });
