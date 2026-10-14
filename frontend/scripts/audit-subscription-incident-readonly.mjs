import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PrismaClient, Prisma } from '@prisma/client';
import ts from 'typescript';

// A separate, explicitly supplied credential. Never falls back to development URLs.
const url = process.env.AUDIT_PRODUCTION_DATABASE_URL;
if (!url) { console.error('AUDIT_PRODUCTION_DATABASE_URL ausente. Auditoria bloqueada; nenhuma conexao aberta.'); process.exit(2); }
let parsed;
try { parsed = new URL(url); } catch { console.error('Configuracao de auditoria invalida.'); process.exit(2); }
if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !/\.(supabase\.co|supabase\.com)$/.test(parsed.hostname)) {
  console.error('Destino de auditoria nao corresponde a Supabase. Nenhuma conexao aberta.'); process.exit(2);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceSHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
if (process.env.AUDIT_EXPECTED_ENGINE_SHA !== sourceSHA) {
  console.error('Confirme o SHA do motor em producao em AUDIT_EXPECTED_ENGINE_SHA. Nenhuma conexao aberta.'); process.exit(2);
}
const require = createRequire(import.meta.url);
const mask = id => id ? `${id.slice(0, 8)}...` : null;
const prisma = new PrismaClient({ datasources: { db: { url } } });
const legacySubscriptionSelect = { id: true, clientId: true, subscriptionPlanId: true, startDate: true, endDate: true, active: true, status: true, createdAt: true, updatedAt: true, deletedAt: true, subscriptionPlan: { include: { services: true } } };

const transactionOptions = { isolationLevel: 'RepeatableRead', timeout: 60000, maxWait: 10000 };
const auditStarted = performance.now();
let transactionStarted;
let phase = 'transaction.acquire';
let queryCount = 0;
let lastFailure = null;
const pending = new Map();
function checkpoint(event, details = {}) {
  console.error(JSON.stringify({ diagnostic: true, event, phase,
    elapsedMs: Math.round(performance.now() - auditStarted),
    transactionElapsedMs: transactionStarted === undefined ? null : Math.round(performance.now() - transactionStarted),
    ...details }));
}
// Never dump raw Prisma messages: they may contain invocation arguments or SQL/PII.
function safeMessage(value) {
  if (typeof value !== 'string') return null;
  const categories = [
    [/Unable to start a transaction/i, 'Unable to start a transaction within the configured acquisition window.'],
    [/expired transaction|transaction.*expired/i, 'Transaction expired; further operations were rejected.'],
    [/Transaction already closed/i, 'Transaction already closed.'],
    [/Transaction not found/i, 'Transaction not found or no longer available.'],
    [/closed.*connection|connection.*closed/i, 'Database connection closed.'],
    [/timed out|timeout/i, 'Timeout reported.'],
    [/Read-only nao garantido/i, 'Read-only verification failed.']
  ];
  const summary = categories.find(([pattern]) => pattern.test(value))?.[1] ?? 'Message withheld: unrecognized diagnostic text.';
  const durations = [...value.matchAll(/\b(\d{1,12})\s*ms\b/g)].map(match => Number(match[1])).slice(0, 6);
  return { summary, reportedMilliseconds: durations };
}
function safeError(error) {
  return {
    code: typeof error?.code === 'string' && /^P\d{4}$/.test(error.code) ? error.code : 'NON_PRISMA_ERROR',
    message: safeMessage(error?.message),
    meta: error?.meta && typeof error.meta === 'object' ? {
      error: safeMessage(error.meta.error),
      fieldsPresent: ['error', 'modelName', 'timeout', 'maxWait'].filter(key => Object.hasOwn(error.meta, key)),
      timeout: Number.isFinite(error.meta.timeout) ? error.meta.timeout : null,
      maxWait: Number.isFinite(error.meta.maxWait) ? error.meta.maxWait : null
    } : null,
    cause: error?.cause ? { message: safeMessage(error.cause.message) } : null
  };
}
async function measure(label, action) {
  const sequence = ++queryCount;
  const started = performance.now();
  pending.set(sequence, label);
  checkpoint('query.start', { sequence, operation: label });
  try {
    const result = await action();
    checkpoint('query.end', { sequence, operation: label, durationMs: Math.round(performance.now() - started) });
    return result;
  } catch (error) {
    lastFailure = { phase, sequence, operation: label };
    checkpoint('query.fail', { ...lastFailure, durationMs: Math.round(performance.now() - started), error: safeError(error) });
    throw error;
  } finally { pending.delete(sequence); }
}
function observedTransaction(tx) {
  const delegates = new Map();
  return new Proxy(tx, { get(target, key) {
    const value = Reflect.get(target, key);
    if (typeof value === 'function') return (...args) => measure(String(key), () => value.apply(target, args));
    if (!value || typeof value !== 'object') return value;
    if (!delegates.has(key)) delegates.set(key, new Proxy(value, { get(delegate, method) {
      const operation = Reflect.get(delegate, method);
      return typeof operation === 'function'
        ? (...args) => measure(`${String(key)}.${String(method)}`, () => operation.apply(delegate, args)) : operation;
    } }));
    return delegates.get(key);
  } });
}

// Replay the explicitly verified committed engine, not uncommitted models.
function publishedEngine(db) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const source = execFileSync('git', ['show', `${sourceSHA}:frontend/${file}`], { cwd: root, encoding: 'utf8', windowsHide: true });
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const loadedModule = { exports: {} };
    cache.set(file, loadedModule.exports);
    const resolve = name => {
      if (name === '@/lib/prisma') return { prisma: db };
      if (name === '@prisma/client') return { Prisma };
      if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`);
      return require(name);
    };
    vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(resolve, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  return { payout: load('lib/server/subscription-payouts.ts'), finance: load('lib/server/finance-rules.ts'), report: load('lib/server/barber-report.ts') };
}

try {
  checkpoint('transaction.request', { transactionOptions });
  const result = await prisma.$transaction(async rawTx => {
    transactionStarted = performance.now();
    checkpoint('transaction.acquired');
    const tx = observedTransaction(rawTx);
    phase = 'readonly.setup';
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const readonly = await tx.$queryRawUnsafe('SHOW transaction_read_only');
    if (readonly[0]?.transaction_read_only !== 'on') throw new Error('Read-only nao garantido.');
    checkpoint('readonly.verified');
    phase = 'incident.identification';
    const clients = await tx.user.findMany({ where: { name: { contains: 'Matheus', mode: 'insensitive' }, deletedAt: null }, select: { id: true, name: true, client: { select: { id: true } } } });
    const barbers = await tx.barber.findMany({ where: { user: { name: { equals: 'Renan', mode: 'insensitive' } } }, select: { id: true, user: { select: { name: true } } } });
    const visits = await tx.appointment.findMany({ where: {
      clientId: { in: clients.flatMap(row => row.client ? [row.client.id] : []) }, barberId: { in: barbers.map(row => row.id) },
      dataHora: { gte: new Date('2026-10-13T00:00:00-03:00'), lt: new Date('2026-10-14T00:00:00-03:00') }, deletedAt: null
    }, include: { service: true, services: { include: { service: true } }, commissions: true, payments: { include: { transactions: true } } } });
    const manualCandidates = await tx.manualService.findMany({ where: { clientId: { in: clients.flatMap(row => row.client ? [row.client.id] : []) }, barberId: { in: barbers.map(row => row.id) }, serviceDate: { gte: new Date('2026-10-13T00:00:00-03:00'), lt: new Date('2026-10-14T00:00:00-03:00') }, deletedAt: null }, select: { id: true } });
    if (visits.length !== 1 || manualCandidates.length) return { readonly: true, blocked: true, reason: 'Identificacao/origem nao inequivoca para correcao de Appointment', appointmentCandidateCount: visits.length, manualCandidateCount: manualCandidates.length, candidateIds: [...visits, ...manualCandidates].map(row => mask(row.id)) };
    const visit = visits[0];
    phase = 'incident.financialEvidence';
    const subscriptions = await tx.subscription.findMany({ where: { clientId: visit.clientId }, select: legacySubscriptionSelect });
    const payments = await tx.payment.findMany({ where: { OR: [{ appointmentId: visit.id }, { subscriptionId: { in: subscriptions.map(row => row.id) } }] }, include: { transactions: true } });
    const transactions = await tx.financialTransaction.findMany({ where: { OR: [{ description: { startsWith: `Atendimento finalizado: ${visit.id} - ` } }, { paymentId: { in: payments.map(row => row.id) } }] }, include: { expense: true } });
    const closures = await tx.financialClosure.findMany({ where: { startDate: { lte: visit.dataHora }, endDate: { gte: visit.dataHora }, closedAt: { not: null } } });
    const audit = await tx.auditLog.findMany({ where: { OR: [{ entity: 'Subscription', entityId: { in: subscriptions.map(row => row.id) } }, { entity: 'Appointment', entityId: visit.id }] }, orderBy: { createdAt: 'asc' } });
    // Explicit old scalar select avoids querying the new billing columns.
    const db = new Proxy(tx, { get(target, key) {
      if (key === 'subscription') return { findMany: args => target.subscription.findMany({ where: args.where, select: legacySubscriptionSelect }) };
      if (key === 'manualService') return { findMany: args => target.manualService.findMany(args.include?.subscription ? { ...args, include: { ...args.include, subscription: { select: legacySubscriptionSelect } } } : args) };
      return target[key];
    } });
    phase = 'engine.load';
    const engineLoadStarted = performance.now();
    checkpoint('engine.load.start');
    const engine = publishedEngine(db);
    checkpoint('engine.load.end', { durationMs: Math.round(performance.now() - engineLoadStarted) });
    phase = 'engine.appointmentFinancials';
    const appointment = { ...visit, client: { subscriptions } };
    const financials = engine.finance.appointmentFinancials(appointment);
    phase = 'engine.calculateSubscriptionPayouts';
    const poolStarted = performance.now();
    checkpoint('pool.start');
    const pool = await engine.payout.calculateSubscriptionPayouts('2026-10', db);
    checkpoint('pool.end', { durationMs: Math.round(performance.now() - poolStarted) });
    const distribution = pool.currentDistribution.find(row => row.barberId === visit.barberId);
    phase = 'engine.getBarberReport';
    const reportStarted = performance.now();
    checkpoint('report.start');
    const report = await engine.report.getBarberReport(engine.report.parseBarberReportFilters({ barberId: visit.barberId, period: 'month', month: '2026-10' }));
    checkpoint('report.end', { durationMs: Math.round(performance.now() - reportStarted) });
    phase = 'result.prepare';
    return {
      readonly: true, sourceSHA,
      incident: { id: mask(visit.id), client: 'Matheus', clientId: mask(visit.clientId), barber: 'Renan', barberId: mask(visit.barberId), operationalTime: visit.dataHora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), status: visit.status, origin: 'Appointment', services: financials.snapshot.services.map(row => ({ name: row.name, price: row.price, covered: row.covered })), chargedGross: visit.status === 'COMPLETED' ? financials.chargedGross : 0, calculatedCommission: visit.status === 'COMPLETED' ? financials.commission : 0, coveredVisit: visit.status === 'COMPLETED' && financials.hasCoveredVisit },
      subscriptions: subscriptions.map(row => ({ id: mask(row.id), plan: row.subscriptionPlan.name, value: Number(row.subscriptionPlan.value), startDate: row.startDate, endDate: row.endDate, status: row.status, active: row.active, originalBaseDayVerified: false, availableBaseDay: row.startDate.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo', day: 'numeric' }) })),
      commissions: visit.commissions.map(row => ({ id: mask(row.id), amount: Number(row.amount), paid: row.paid, paidAt: row.paidAt })),
      payments: payments.map(row => ({ id: mask(row.id), subscriptionId: mask(row.subscriptionId), appointmentId: mask(row.appointmentId), amount: Number(row.amount), status: row.status, paidAt: row.paidAt })),
      transactions: transactions.map(row => ({ id: mask(row.id), type: row.type, amount: Number(row.amount), paymentId: mask(row.paymentId), expense: row.expense ? { id: mask(row.expense.id), amount: Number(row.expense.amount), status: row.expense.status, paidAt: row.expense.paidAt } : null })),
      closedPeriods: closures.map(row => ({ id: mask(row.id), startDate: row.startDate, endDate: row.endDate, closedAt: row.closedAt })),
      poolBefore: { revenue: pool.revenueBase, poolAmount: pool.poolAmount, totalVisits: pool.totalAttendances, barberVisits: distribution?.count ?? 0, estimate: pool.rows.find(row => row.barberId === visit.barberId && row.type === 'MAIN')?.calculatedAmount, realizedGains: report.summary.totalCommission },
      auditEvents: audit.map(row => ({ action: row.action, createdAt: row.createdAt, entityId: mask(row.entityId) })),
      correctionExecuted: false, simulationBlockedUntilPaymentAndCoverageEvidenceReviewed: true
    };
  }, transactionOptions);
  phase = 'transaction.finished';
  checkpoint('transaction.finished', { queryCount });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify({ auditFailed: true, ...safeError(error), phase, lastFailure,
    pendingOperations: [...pending.values()], queryCount,
    elapsedMs: Math.round(performance.now() - auditStarted),
    transactionElapsedMs: transactionStarted === undefined ? null : Math.round(performance.now() - transactionStarted),
    transactionOptions, productionWrites: 0 })); process.exitCode = 1;
} finally { await prisma.$disconnect(); }
