import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import ts from 'typescript';

const mask = id => id ? `${id.slice(0, 8)}...` : null;
const money = value => Number(value);
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const expectedPublishedSHA = 'd3e008af0c18e18ee327fdb7027624f2aaa8ffef';
let stage = 'configuration';
let prisma;
const started = performance.now();
function blocked(reason) {
  return { readonly: true, conclusion: 'BLOCKED', conclusionMeaning: reason, productionWrites: 0 };
}
// Replays committed source only; this synchronous engine must not open a database.
function loadPublishedFinance(sourceSHA) {
  const require = createRequire(import.meta.url);
  const cache = new Map();
  const load = file => {
    if (cache.has(file)) return cache.get(file);
    const source = execFileSync('git', ['show', `${sourceSHA}:frontend/${file}`], { cwd: sourceRoot, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const loadedModule = { exports: {} };
    cache.set(file, loadedModule.exports);
    const resolve = name => {
      if (name === '@/lib/prisma') return { prisma: new Proxy({}, { get() { throw new Error('ENGINE_DATABASE_ACCESS_BLOCKED'); } }) };
      if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`);
      return require(name);
    };
    vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(resolve, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  };
  return load('lib/server/finance-rules.ts');
}
const legacySubscriptionSelect = {
  id: true, clientId: true, subscriptionPlanId: true, startDate: true, endDate: true,
  status: true, active: true, createdAt: true, updatedAt: true, deletedAt: true,
  subscriptionPlan: { include: { services: { include: { service: true } } } }
};
function safeAudit(row) {
  const meta = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {};
  const dates = {};
  for (const key of ['startDate', 'endDate', 'dueDate', 'coverageStartDate', 'coverageEndDate', 'paidAt']) {
    if (typeof meta[key] === 'string' && /^\d{4}-\d{2}-\d{2}(?:T[\d:.+-]+Z?)?$/.test(meta[key])) dates[key] = meta[key];
  }
  return { id: mask(row.id), action: /^[A-Z_]{1,100}$/.test(row.action) ? row.action : '[action omitted]',
    entityId: mask(row.entityId), createdAt: row.createdAt, dates,
    paymentId: typeof meta.paymentId === 'string' ? mask(meta.paymentId) : null,
    competenceMonth: typeof meta.competenceMonth === 'string' && /^\d{4}-\d{2}$/.test(meta.competenceMonth) ? meta.competenceMonth : null };
}

try {
  const url = process.env.AUDIT_PRODUCTION_DATABASE_URL;
  if (!url) throw new Error('AUDIT_CONFIGURATION_MISSING');
  const parsed = new URL(url);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !/\.(supabase\.co|supabase\.com)$/.test(parsed.hostname)) throw new Error('AUDIT_DESTINATION_BLOCKED');
  const sourceSHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8', windowsHide: true }).trim();
  if (process.env.AUDIT_EXPECTED_ENGINE_SHA !== sourceSHA || sourceSHA !== expectedPublishedSHA) throw new Error('AUDIT_SHA_BLOCKED');
  stage = 'engine.load';
  const engine = loadPublishedFinance(sourceSHA);
  const approvalSource = execFileSync('git', ['show', `${sourceSHA}:frontend/app/api/internal/subscriptions/route.ts`],
    { cwd: sourceRoot, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const approvalFacts = {
    sourceFile: 'frontend/app/api/internal/subscriptions/route.ts', sourceSHA,
    setsActiveOnApproval: /status:\s*"ACTIVE"/.test(approvalSource),
    resetsStartDateToApprovalTime: /startDate:\s*now/.test(approvalSource),
    setsThirtyDayEnd: /endDate\.setDate\(endDate\.getDate\(\)\s*\+\s*30\)/.test(approvalSource),
    createsPaymentInThisRoute: /prisma\.payment\.(create|upsert)/.test(approvalSource),
    caveat: 'ACTIVE is persisted separately from endDate; published coverage engine checks dates without updating status. This route does not prove historical payment or original anchor.'
  };
  prisma = new PrismaClient({ datasources: { db: { url } } });
  stage = 'transaction.acquire';
  const result = await prisma.$transaction(async tx => {
    stage = 'readonly.verify';
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const ro = await tx.$queryRawUnsafe('SHOW transaction_read_only');
    if (ro[0]?.transaction_read_only !== 'on') throw new Error('READONLY_NOT_CONFIRMED');
    const identities = await tx.$queryRawUnsafe(`SELECT current_user AS username, current_database() AS database,
      rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolinherit FROM pg_roles WHERE rolname = current_user`);
    const identity = identities[0];
    if (!identity || identity.username !== 'renato_auditoria' || identity.database !== 'postgres' ||
        ['rolsuper', 'rolcreatedb', 'rolcreaterole', 'rolreplication', 'rolinherit'].some(key => identity[key])) throw new Error('AUDIT_ROLE_BLOCKED');
    const grants = await tx.$queryRawUnsafe(`SELECT count(*)::int AS writable FROM pg_tables WHERE schemaname = 'public'
      AND (has_table_privilege(current_user, quote_ident(schemaname)||'.'||quote_ident(tablename), 'INSERT')
        OR has_table_privilege(current_user, quote_ident(schemaname)||'.'||quote_ident(tablename), 'UPDATE')
        OR has_table_privilege(current_user, quote_ident(schemaname)||'.'||quote_ident(tablename), 'DELETE')
        OR has_table_privilege(current_user, quote_ident(schemaname)||'.'||quote_ident(tablename), 'TRUNCATE'))`);
    if (grants[0]?.writable !== 0) throw new Error('WRITABLE_ROLE_BLOCKED');
    stage = 'incident.identify';
    const visits = await tx.appointment.findMany({ where: {
      client: { user: { name: { contains: 'Matheus', mode: 'insensitive' } } },
      barber: { user: { name: { equals: 'Renan', mode: 'insensitive' } } },
      dataHora: { gte: new Date('2026-10-13T03:00:00Z'), lt: new Date('2026-10-14T03:00:00Z') }, deletedAt: null
    }, select: { id: true, clientId: true, barberId: true, dataHora: true, status: true, serviceId: true,
      financialSnapshot: true, service: true, services: { include: { service: true } } } });
    if (visits.length !== 1) return blocked('Incident appointment candidates are not unique.');
    const visit = visits[0];
    if (!visit.id.startsWith('75a25464') || visit.dataHora.toISOString() !== '2026-10-13T15:00:00.000Z' || visit.status !== 'COMPLETED') return blocked('Incident cross-check differs from previously verified evidence.');
    const items = visit.services.length ? visit.services.map(row => ({ serviceId: row.serviceId, name: row.service.name, price: money(row.price) })) : [{ serviceId: visit.serviceId, name: visit.service.name, price: money(visit.service.price) }];
    if (items.length !== 1 || items[0].name !== 'Corte Degradê Navalhado' || items[0].price !== 30) return blocked('Service/amount differs from incident evidence.');
    const duplicates = await tx.manualService.count({ where: { clientId: visit.clientId, barberId: visit.barberId, serviceDate: { gte: new Date('2026-10-13T03:00:00Z'), lt: new Date('2026-10-14T03:00:00Z') }, deletedAt: null } });
    if (duplicates) return blocked('Manual visit exists on incident day; identity requires review.');
    stage = 'subscription.relationships';
    const subscriptions = await tx.subscription.findMany({ where: { clientId: visit.clientId }, select: legacySubscriptionSelect });
    const candidates = subscriptions.filter(row => !row.deletedAt && row.startDate <= visit.dataHora && row.subscriptionPlan.name === 'Plano Cabelo');
    if (candidates.length !== 1) return blocked('Subscription identity is ambiguous or missing.');
    const sub = candidates[0];
    const links = await tx.subscriptionPlanService.findMany({ where: { subscriptionPlanId: sub.subscriptionPlanId }, include: { service: true } });
    const otherServices = await tx.service.findMany({ where: { OR: [{ name: { contains: 'corte', mode: 'insensitive' } }, { name: { contains: 'cabelo', mode: 'insensitive' } }] } });
    const financials = engine.appointmentFinancials({ ...visit, client: { subscriptions } });
    const linked = links.some(row => row.serviceId === items[0].serviceId);
    const valid = engine.hasActiveSubscriptionAt([sub], visit.dataHora);
    const engineCovered = financials.snapshot.services.some(row => row.id === items[0].serviceId && row.covered);
    stage = 'payments.history';
    const payments = await tx.payment.findMany({ where: { OR: [{ clientId: visit.clientId }, { subscriptionId: { in: subscriptions.map(row => row.id) } }, { appointmentId: visit.id }] },
      select: { id: true, clientId: true, subscriptionId: true, appointmentId: true, saleId: true, method: true, status: true, amount: true, createdAt: true, paidAt: true, deletedAt: true } });
    const transactions = await tx.financialTransaction.findMany({ where: { OR: [
      { paymentId: { in: payments.map(row => row.id) } },
      ...subscriptions.map(row => ({ description: { contains: row.id } })),
      { description: { contains: visit.id } }
    ] }, select: { id: true, type: true, amount: true, paymentId: true, expenseId: true, createdAt: true, deletedAt: true } });
    const audits = await tx.auditLog.findMany({ where: { OR: [
      { entity: 'Subscription', entityId: { in: subscriptions.map(row => row.id) } },
      { entity: 'SubscriptionPlan', entityId: sub.subscriptionPlanId },
      { entity: 'Service', entityId: { in: [...new Set([items[0].serviceId, ...links.map(row => row.serviceId)])] } },
      { entity: 'Payment', entityId: { in: payments.map(row => row.id) } }
    ] }, select: { id: true, entityId: true, action: true, metadata: true, createdAt: true }, orderBy: { createdAt: 'asc' } });
    // Receipt date alone does not identify which overdue monthly cycle was paid.
    const octoberReceipts = payments.filter(row => row.subscriptionId === sub.id && row.status === 'PAID' && !row.deletedAt && row.paidAt && row.paidAt >= new Date('2026-10-01T03:00:00Z') && row.paidAt < new Date('2026-11-01T03:00:00Z'));
    const explicitProof = octoberReceipts.filter(payment => audits.some(row => {
      const meta = row.metadata;
      return row.entityId === sub.id && row.action === 'SUBSCRIPTION_PAYMENT_CONFIRMED' && meta && typeof meta === 'object' &&
        meta.paymentId === payment.id && meta.competenceMonth === '2026-10' && typeof meta.dueDate === 'string' &&
        /^2026-10-\d{2}T/.test(meta.dueDate);
    }));
    const proven = explicitProof.length === 1;
    const uncertain = octoberReceipts.length > 0 && !proven;
    const conclusion = uncertain ? 'BLOCKED' : linked ? (proven ? 'A' : 'B') : (proven ? 'C' : 'D');
    return { readonly: true, sourceSHA, connection: { user: identity.username, database: identity.database, writablePublicTables: 0 },
      incident: { id: mask(visit.id), clientId: mask(visit.clientId), barberId: mask(visit.barberId), operationalTime: visit.dataHora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), status: visit.status, appointmentServices: items.map(row => ({ ...row, serviceId: mask(row.serviceId) })) },
      coverage: { appointmentService: items[0].name, appointmentServiceId: mask(items[0].serviceId), plan: sub.subscriptionPlan.name, planId: mask(sub.subscriptionPlanId),
        planServices: links.map(row => ({ relationshipId: mask(row.id), planId: mask(row.subscriptionPlanId), serviceId: mask(row.serviceId), name: row.service.name, price: money(row.service.price), active: row.service.active, deleted: Boolean(row.service.deletedAt) })),
        otherCatalogServices: otherServices.map(row => ({ id: mask(row.id), name: row.name, active: row.active, deleted: Boolean(row.deletedAt), equivalenceProven: false })),
        serviceLinkedToPlan: linked, subscriptionValidOnVisitDate: valid, publishedEngineCovered: engineCovered,
        snapshotPresent: visit.financialSnapshot !== null,
        coveredFalseReason: engineCovered ? 'Engine classifies service as covered.' : visit.financialSnapshot !== null ? 'Persisted financial snapshot is authoritative; current links/vigency are reported separately.' : [!linked && 'Exact service ID is absent from plan links.', !valid && 'Subscription does not pass published status/active/deletedAt/startDate/endDate checks.'].filter(Boolean).join(' '),
        eligibilityChecks: { active: sub.active, status: sub.status, deleted: Boolean(sub.deletedAt), startsBeforeVisit: sub.startDate <= visit.dataHora, endsAfterVisit: !sub.endDate || sub.endDate >= visit.dataHora },
        historicalRelationshipProven: false, historyCaveat: 'Current join rows have no history timestamps; audit events require review. Name similarity is not equivalence.' },
      octoberPayment: { dueDate: sub.endDate, dueDateIsStoredCoverageEndNotVerifiedOriginalDue: true,
        publishedApprovalBehavior: approvalFacts,
        subscription: { id: mask(sub.id), startDate: sub.startDate, endDate: sub.endDate, active: sub.active, status: sub.status, createdAt: sub.createdAt, updatedAt: sub.updatedAt },
        paymentsFound: payments.map(row => ({ id: mask(row.id), subscriptionId: mask(row.subscriptionId), appointmentId: mask(row.appointmentId), saleId: mask(row.saleId), method: row.method, status: row.status, amount: money(row.amount), createdAt: row.createdAt, paidAt: row.paidAt, deleted: Boolean(row.deletedAt) })),
        transactionsFound: transactions.map(row => ({ id: mask(row.id), paymentId: mask(row.paymentId), expenseId: mask(row.expenseId), type: row.type, amount: money(row.amount), createdAt: row.createdAt, deleted: Boolean(row.deletedAt) })),
        auditEvents: audits.map(safeAudit), octoberPaymentProven: proven,
        reason: proven ? 'PAID receipt linked to subscription and explicit audited October cycle.' : uncertain ? 'October receipt exists but cycle allocation is not proven; manual evidence review required.' : 'Queried persisted evidence does not prove October payment. ACTIVE and appointment income are not payment evidence.' },
      baseDay: { candidate: Number(sub.startDate.toLocaleDateString('en-US', { timeZone: 'America/Sao_Paulo', day: 'numeric' })), historicallyProven: false, evidence: 'Candidate inferred only from stored startDate; no immutable original anchor in legacy select.' },
      conclusion, conclusionMeaning: { A: 'Coverage relationship and October payment proven.', B: 'Coverage relationship proven; October payment not proven.', C: 'October payment proven; coverage relationship not proven.', D: 'Coverage relationship and October payment not proven.', BLOCKED: 'Receipt exists but October cycle evidence is insufficient.' }[conclusion],
      correctionExecuted: false, productionWrites: 0 };
  }, { isolationLevel: 'RepeatableRead', timeout: 60000, maxWait: 10000 });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const known = ['AUDIT_CONFIGURATION_MISSING', 'AUDIT_DESTINATION_BLOCKED', 'AUDIT_SHA_BLOCKED', 'READONLY_NOT_CONFIRMED', 'AUDIT_ROLE_BLOCKED', 'WRITABLE_ROLE_BLOCKED', 'ENGINE_DATABASE_ACCESS_BLOCKED'];
  console.error(JSON.stringify({ auditFailed: true, conclusion: 'BLOCKED', stage,
    code: /^P\d{4}$/.test(error?.code ?? '') ? error.code : 'LOCAL_OR_CONFIGURATION_ERROR',
    reason: known.includes(error?.message) ? error.message : 'Failure details withheld to protect credentials and PII.',
    elapsedMs: Math.round(performance.now() - started), productionWrites: 0 }));
  process.exitCode = 1;
} finally {
  if (prisma) {
    try { await prisma.$disconnect(); }
    catch { console.error(JSON.stringify({ conclusion: 'BLOCKED', stage: 'disconnect', productionWrites: 0 })); process.exitCode = 1; }
  }
}
