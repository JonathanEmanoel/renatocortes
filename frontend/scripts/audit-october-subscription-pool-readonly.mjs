import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const expectedSHA = 'd3e008af0c18e18ee327fdb7027624f2aaa8ffef';
const mask = id => id ? `${id.slice(0, 8)}...` : null;
const cents = amount => Math.round(Number(amount) * 100);
const operational = date => date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const barberName = row => /^(renan|renato|[ií]talo)$/i.test(row.user.name.trim()) ? row.user.name.trim() : `Profissional ${mask(row.id)}`;
const legacySelect = { id: true, clientId: true, subscriptionPlanId: true, startDate: true, endDate: true,
  active: true, status: true, deletedAt: true, subscriptionPlan: { include: { services: true } } };

// Loads committed before-engine or explicitly labelled local after-engine. No global DB access.
export function loadEngine(sourceSHA, local = false) {
  const require = createRequire(import.meta.url);
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const source = local ? fs.readFileSync(path.join(root, 'frontend', file), 'utf8') : execFileSync('git', ['show', `${sourceSHA}:frontend/${file}`],
      { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const loaded = { exports: {} };
    cache.set(file, loaded.exports);
    const resolve = name => {
      if (name === '@/lib/prisma') return { prisma: new Proxy({}, { get() { throw new Error('GLOBAL_DATABASE_ACCESS_BLOCKED'); } }) };
      if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`);
      return require(name);
    };
    vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(resolve, loaded, loaded.exports);
    return loaded.exports;
  }
  return { finance: load('lib/server/finance-rules.ts'), payout: load('lib/server/subscription-payouts.ts') };
}
function memoryDB(data) {
  return Object.fromEntries(['barber', 'subscription', 'appointment', 'manualService', 'subscriptionPayout'].map(model =>
    [model, { findMany: async () => data[model] }]));
}
const normalizedSubscription = row => ({ ...row, billingFirstDueDate: null, legacyRevenueSnapshot: null, cycles: [] });

// No write delegates exist in the replay DB. Synthetic payment has no fabricated ID/date/method.
export async function simulate(data, sub, target, before, published, local) {
  const included = data.subscription.find(row => row.id === sub.id);
  const oldContribution = included ? cents(included.subscriptionPlan.value) : 0;
  const targetServices = target.services.length ? target.services.map(row => ({ id: row.serviceId, name: row.service.name, price: Number(row.price) })) :
    [{ id: target.service.id, name: target.service.name, price: Number(target.service.price) }];
  const linkedIds = new Set(sub.subscriptionPlan.services.map(row => row.serviceId));
  if (targetServices.length !== 1 || targetServices[0].name !== 'Corte Degradê Navalhado' || targetServices[0].price !== 30 || !linkedIds.has(targetServices[0].id)) throw new Error('INCIDENT_SERVICE_CHANGED');
  if (published.finance.appointmentFinancials(target).hasCoveredVisit) throw new Error('INCIDENT_ALREADY_COVERED');
  const corrected = { ...target, financialSnapshot: { version: 1, plan: sub.subscriptionPlan.name,
    services: targetServices.map(row => ({ ...row, covered: linkedIds.has(row.id) })) } };
  const revised = normalizedSubscription(sub);
  revised.billingFirstDueDate = new Date('2026-10-01T03:00:00Z');
  revised.baseDueDay = 1;
  revised.nextCycleDueDate = new Date('2026-11-01T03:00:00Z');
  revised.nextCycleStartDate = revised.nextCycleDueDate;
  revised.endDate = new Date('2026-11-01T02:59:59.999Z');
  revised.legacyRevenueSnapshot = { active: sub.active, status: sub.status, startDate: sub.startDate.toISOString(), endDate: sub.endDate?.toISOString() ?? null, value: String(sub.subscriptionPlan.value) };
  revised.cycles = [{ dueDate: revised.billingFirstDueDate, coverageStartDate: revised.billingFirstDueDate,
    endDate: revised.nextCycleDueDate, competenceMonth: '2026-10', payment: { status: 'PAID', amount: 75, deletedAt: null, paidAt: null } }];
  const replay = {
    ...data, subscription: [...data.subscription.filter(row => row.id !== sub.id).map(normalizedSubscription), revised],
    appointment: data.appointment.map(row => row.id === target.id ? corrected : row)
  };
  const after = await local.payout.calculateSubscriptionPayouts('2026-10', memoryDB(replay));
  const beforeFinancials = local.finance.appointmentFinancials(target);
  const afterFinancials = local.finance.appointmentFinancials(corrected);
  const expectedRevenue = cents(before.revenueBase) - oldContribution + 7500;
  if (cents(after.revenueBase) !== expectedRevenue || after.totalAttendances !== before.totalAttendances + 1 ||
      afterFinancials.chargedGross !== 0 || afterFinancials.commission !== 0 || !afterFinancials.hasCoveredVisit) throw new Error('SIMULATION_INVARIANT_FAILED');
  const renanBefore = before.currentDistribution.find(row => row.barberId === target.barberId);
  const renanAfter = after.currentDistribution.find(row => row.barberId === target.barberId);
  if (!renanBefore || !renanAfter || renanAfter.count !== renanBefore.count + 1) throw new Error('SIMULATION_VISIT_FAILED');
  return { after, oldContribution: oldContribution / 100, beforeFinancials, afterFinancials, renanBefore, renanAfter };
}

async function main() {
  let prisma;
  let stage = 'configuration';
  const started = performance.now();
  try {
    const url = process.env.AUDIT_PRODUCTION_DATABASE_URL;
    if (!url) throw new Error('AUDIT_CONFIGURATION_MISSING');
    const destination = new URL(url);
    if (!['postgres:', 'postgresql:'].includes(destination.protocol) || !/\.(supabase\.co|supabase\.com)$/.test(destination.hostname)) throw new Error('AUDIT_DESTINATION_BLOCKED');
    const sourceSHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
    if (sourceSHA !== expectedSHA || process.env.AUDIT_EXPECTED_ENGINE_SHA !== sourceSHA) throw new Error('AUDIT_SHA_BLOCKED');
    stage = 'engine.load';
    const published = loadEngine(sourceSHA);
    const local = loadEngine(sourceSHA, true);
    prisma = new PrismaClient({ datasources: { db: { url } } });
    const result = await prisma.$transaction(async tx => {
      stage = 'readonly.verify';
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const ro = await tx.$queryRawUnsafe('SHOW transaction_read_only');
      if (ro[0]?.transaction_read_only !== 'on') throw new Error('READONLY_NOT_CONFIRMED');
      const identities = await tx.$queryRawUnsafe(`SELECT current_user AS username, current_database() AS database,
        rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolinherit FROM pg_roles WHERE rolname=current_user`);
      const role = identities[0];
      if (!role || role.username !== 'renato_auditoria' || role.database !== 'postgres' ||
        ['rolsuper', 'rolcreatedb', 'rolcreaterole', 'rolreplication', 'rolinherit'].some(key => role[key])) throw new Error('AUDIT_ROLE_BLOCKED');
      const permissions = await tx.$queryRawUnsafe(`SELECT count(*)::int AS writable FROM pg_tables WHERE schemaname='public'
        AND (has_table_privilege(current_user, quote_ident(schemaname)||'.'||quote_ident(tablename), 'INSERT')
          OR has_table_privilege(current_user, quote_ident(schemaname)||'.'||quote_ident(tablename), 'UPDATE')
          OR has_table_privilege(current_user, quote_ident(schemaname)||'.'||quote_ident(tablename), 'DELETE')
          OR has_table_privilege(current_user, quote_ident(schemaname)||'.'||quote_ident(tablename), 'TRUNCATE'))`);
      if (permissions[0]?.writable !== 0) throw new Error('WRITABLE_ROLE_BLOCKED');
      stage = 'published.pool.capture';
      const captured = {};
      // Invoke exact published queries; only enrich selections with legacy IDs for decomposition.
      const readDB = {
        barber: { findMany: async args => (captured.barber = await tx.barber.findMany(args)) },
        subscription: { findMany: async args => (captured.subscription = await tx.subscription.findMany({ where: args.where, select: legacySelect })) },
        appointment: { findMany: async args => (captured.appointment = await tx.appointment.findMany({ where: args.where, select: {
          ...args.select, clientId: true, client: { select: { subscriptions: { select: legacySelect } } }
        } })) },
        manualService: { findMany: async args => (captured.manualService = await tx.manualService.findMany(args)) },
        subscriptionPayout: { findMany: async args => (captured.subscriptionPayout = await tx.subscriptionPayout.findMany(args)) }
      };
      const before = await published.payout.calculateSubscriptionPayouts('2026-10', readDB);
      stage = 'incident.identify';
      const candidates = await tx.appointment.findMany({ where: {
        client: { user: { name: { contains: 'Matheus', mode: 'insensitive' } } },
        barber: { user: { name: { equals: 'Renan', mode: 'insensitive' } } },
        dataHora: { gte: new Date('2026-10-13T03:00:00Z'), lt: new Date('2026-10-14T03:00:00Z') }, deletedAt: null
      }, select: { id: true } });
      if (candidates.length !== 1 || !candidates[0].id.startsWith('75a25464')) throw new Error('INCIDENT_AMBIGUOUS');
      const target = captured.appointment.find(row => row.id === candidates[0].id);
      if (!target || target.dataHora.toISOString() !== '2026-10-13T15:00:00.000Z') throw new Error('INCIDENT_CHANGED');
      const subscriptions = target.client.subscriptions.filter(row => !row.deletedAt && row.subscriptionPlan.name === 'Plano Cabelo' && row.startDate <= target.dataHora);
      if (subscriptions.length !== 1 || cents(subscriptions[0].subscriptionPlan.value) !== 7500) throw new Error('SUBSCRIPTION_AMBIGUOUS');
      const sub = subscriptions[0];
      const manualDuplicate = await tx.manualService.count({ where: { clientId: target.clientId, barberId: target.barberId,
        serviceDate: { gte: new Date('2026-10-13T03:00:00Z'), lt: new Date('2026-10-14T03:00:00Z') }, deletedAt: null } });
      if (manualDuplicate) throw new Error('INCIDENT_DUPLICATE');
      const commissions = await tx.employeeCommission.findMany({ where: { appointmentId: target.id } });
      const normalIncome = await tx.financialTransaction.findMany({ where: { description: { startsWith: `Atendimento finalizado: ${target.id} - ` }, deletedAt: null } });
      const individualPayments = await tx.payment.count({ where: { appointmentId: target.id, status: 'PAID', deletedAt: null } });
      const closed = await tx.financialClosure.count({ where: { closedAt: { not: null }, startDate: { lte: target.dataHora }, endDate: { gte: target.dataHora } } });
      if (commissions.length !== 1 || commissions[0].barberId !== target.barberId || cents(commissions[0].amount) !== 1500 || commissions[0].paid || commissions[0].paidAt ||
          normalIncome.length !== 1 || normalIncome[0].type !== 'INCOME' || cents(normalIncome[0].amount) !== 3000 || normalIncome[0].paymentId || normalIncome[0].expenseId || individualPayments || closed) throw new Error('INCIDENT_FINANCIAL_CHANGED');
      stage = 'decomposition.verify';
      const revenueComponents = captured.subscription.map(row => ({ subscriptionId: mask(row.id), client: row.clientId === target.clientId ? 'Matheus (incident)' : `Cliente ${mask(row.clientId)}`,
        plan: row.subscriptionPlan.name, value: Number(row.subscriptionPlan.value), startDate: row.startDate, endDate: row.endDate, status: row.status, active: row.active,
        criterion: 'Exact published query: ACTIVE, active, not deleted, startDate <= monthEnd, endDate null or >= monthStart (inclusive).', contribution: Number(row.subscriptionPlan.value) }));
      const visitComponents = [];
      for (const row of captured.appointment) {
        if (!published.finance.appointmentFinancials(row).hasCoveredVisit) continue;
        const eligible = row.client.subscriptions.find(item => published.finance.hasActiveSubscriptionAt([item], row.dataHora));
        visitComponents.push({ id: mask(row.id), barberId: mask(row.barberId), operationalTime: operational(row.dataHora), origin: 'Appointment', subscriptionId: mask(eligible?.id),
          subscriptionIdentityProven: Boolean(eligible), snapshotAuthoritative: row.financialSnapshot !== null, competence: '2026-10', visits: 1 });
      }
      for (const row of captured.manualService) visitComponents.push({ id: mask(row.id), barberId: mask(row.barberId), operationalTime: operational(row.serviceDate),
        origin: 'ManualService', subscriptionId: mask(row.subscriptionId), subscriptionIdentityProven: true, competence: '2026-10', visits: 1 });
      const revenueSum = captured.subscription.reduce((sum, row) => sum + cents(row.subscriptionPlan.value), 0);
      const renanBefore = before.currentDistribution.find(row => row.barberId === target.barberId);
      const blockers = [];
      if (revenueSum !== 43000 || cents(before.revenueBase) !== 43000 || cents(before.poolAmount) !== 17200) blockers.push('Revenue/pool do not match audited 430/172 baseline.');
      if (visitComponents.length !== 5 || before.totalAttendances !== 5 || renanBefore?.count !== 1 || cents(renanBefore?.amount ?? 0) !== 3440) blockers.push('Visits/distribution do not match audited 5/1/34.40 baseline.');
      if (visitComponents.some(row => !row.subscriptionIdentityProven)) blockers.push('Snapshot-covered visit lacks an identifiable eligible subscription; inspect historical snapshot linkage.');
      for (const distribution of before.currentDistribution) {
        if (visitComponents.filter(row => row.barberId === mask(distribution.barberId)).length !== distribution.count) blockers.push('Visit decomposition differs from engine distribution.');
      }
      const anyPaid = captured.subscriptionPayout.some(row => row.status === 'PAID' || Number(row.paidAmount) > 0 || row.paidAt !== null);
      if (anyPaid) blockers.push('Existing paid payout history requires explicit adjustment review; no automatic clawback.');
      const matheusIncluded = captured.subscription.some(row => row.id === sub.id);
      const includedTarget = published.finance.appointmentFinancials(target).hasCoveredVisit;
      if (includedTarget) blockers.push('Incident already counts as covered; cannot add a second visit.');
      stage = 'simulation.memory';
      const scenario = blockers.length ? null : await simulate(captured, sub, target, before, published, local);
      const byBarber = before.currentDistribution.map(row => ({ barberId: mask(row.barberId), barber: barberName(captured.barber.find(item => item.id === row.barberId)), visits: row.count, estimate: row.amount }));
      return { readonly: true, sourceSHA, octoberRevenue: { before: before.revenueBase, components: revenueComponents, sumVerified: revenueSum === 43000 && cents(before.revenueBase) === revenueSum,
          matheusIncludedIn430: matheusIncluded, matheusContribution: matheusIncluded ? Number(sub.subscriptionPlan.value) : 0 },
        octoberVisits: { before: before.totalAttendances, components: visitComponents.map(row => ({ ...row, barber: byBarber.find(item => item.barberId === row.barberId)?.barber })),
          sumVerified: visitComponents.length === 5 && before.totalAttendances === 5, byBarber, matheus13OctIncluded: includedTarget },
        octoberPayouts: { existing: captured.subscriptionPayout.map(row => ({ id: mask(row.id), barberId: mask(row.barberId), barber: barberName(row.barber), status: row.status,
          competence: row.competenceMonth, type: row.type, calculatedAmount: Number(row.calculatedAmount), paidAmount: Number(row.paidAmount), paidAt: row.paidAt })), anyPaid },
        simulationAfterCorrection: scenario ? { engine: 'local uncommitted cycle-aware engine, in-memory only', subscriptionRevenue: scenario.after.revenueBase, pool40Percent: scenario.after.poolAmount,
          removedLegacyContribution: scenario.oldContribution, replacementCycleAmount: 75, totalVisits: scenario.after.totalAttendances, renanVisits: scenario.renanAfter.count,
          renanShare: scenario.renanAfter.count / scenario.after.totalAttendances * 100, renanEstimate: scenario.renanAfter.amount,
          renanEstimateDifference: (cents(scenario.renanAfter.amount) - cents(scenario.renanBefore.amount)) / 100,
          normalAppointmentIncome: { before: scenario.beforeFinancials.chargedGross, after: scenario.afterFinancials.chargedGross },
          normalCommission: { before: scenario.beforeFinancials.commission, after: scenario.afterFinancials.commission },
          otherBarbers: scenario.after.currentDistribution.filter(row => row.barberId !== target.barberId).map(row => {
            const prior = before.currentDistribution.find(item => item.barberId === row.barberId);
            return { barberId: mask(row.barberId), barber: barberName(captured.barber.find(item => item.id === row.barberId)), visits: row.count,
              share: row.count / scenario.after.totalAttendances * 100, before: prior?.amount ?? 0, after: row.amount, difference: (cents(row.amount) - cents(prior?.amount ?? 0)) / 100 };
          }), paidPayoutsCreated: 0, paymentIsSyntheticMemoryEvidenceOnly: true } : null,
        matheus: { subscriptionId: mask(sub.id), appointmentId: mask(target.id), baseDay: 1, baseDaySource: 'business-confirmed', octoberAmount: 75,
          dueDate: '2026-10-01T00:00:00-03:00', nextDueDate: '2026-11-01T00:00:00-03:00', paymentSource: 'business-confirmed-legacy-reconciliation', exactPaidDateKnown: false, methodKnown: false },
        conclusion: blockers.length ? 'BLOCKED' : 'READONLY_DECOMPOSITION_AND_MEMORY_SIMULATION_VERIFIED', safeToPrepareCorrection: blockers.length === 0,
        preparationIsNotExecutionAuthorization: true, implementationGates: ['Legacy reconciliation must represent unknown paid date/method honestly.', 'Payment/cycle/reclassification must share one transaction.', 'Backup/migration/release/explicit write authorization required.'],
        blockers, productionWrites: 0 };
    }, { isolationLevel: 'RepeatableRead', timeout: 60000, maxWait: 10000 });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const allowed = ['AUDIT_CONFIGURATION_MISSING', 'AUDIT_DESTINATION_BLOCKED', 'AUDIT_SHA_BLOCKED', 'READONLY_NOT_CONFIRMED', 'AUDIT_ROLE_BLOCKED', 'WRITABLE_ROLE_BLOCKED',
      'GLOBAL_DATABASE_ACCESS_BLOCKED', 'INCIDENT_AMBIGUOUS', 'INCIDENT_CHANGED', 'SUBSCRIPTION_AMBIGUOUS', 'INCIDENT_DUPLICATE', 'INCIDENT_FINANCIAL_CHANGED', 'INCIDENT_SERVICE_CHANGED', 'INCIDENT_ALREADY_COVERED', 'SIMULATION_INVARIANT_FAILED', 'SIMULATION_VISIT_FAILED'];
    console.error(JSON.stringify({ conclusion: 'BLOCKED', stage, code: /^P\d{4}$/.test(error?.code ?? '') ? error.code : 'AUDIT_FAILED',
      reason: allowed.includes(error?.message) ? error.message : 'Details withheld to protect credentials and PII.', elapsedMs: Math.round(performance.now() - started), productionWrites: 0 }));
    process.exitCode = 1;
  } finally {
    if (prisma) { try { await prisma.$disconnect(); } catch { console.error(JSON.stringify({ conclusion: 'BLOCKED', stage: 'disconnect', productionWrites: 0 })); process.exitCode = 1; } }
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
