import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { legacyReconciliationKey, reconcileLegacySubscriptionPaymentAndAppointment } from '@/lib/server/legacy-subscription-reconciliation';
import { calculateSubscriptionPayouts } from '@/lib/server/subscription-payouts';
import { getFinanceMetrics } from '@/lib/server/finance-rules';
import { confirmSubscriptionPayment, previewSubscriptionBilling } from '@/lib/server/subscription-billing';

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/renato_cortes_test' || process.env.CONFIRM_LOCAL_TEST_DATABASE !== 'renato_cortes_test' || process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url) throw new Error('Teste bloqueado fora do banco local descartavel.');
const checks: string[] = [];
const check = (name: string) => checks.push(name);
async function clear() {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  if (rows.length) await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${rows.map(row => `"public"."${row.tablename.replaceAll('"', '""')}"`).join(',')} RESTART IDENTITY CASCADE`);
}
async function fixture(extra = false) {
  await clear();
  const suffix = randomUUID();
  const admin = await prisma.user.create({ data: { authId: `admin-${suffix}`, email: `admin-${suffix}@local.test`, name: 'Admin fixture', role: 'ADMIN' } });
  const barbers = [];
  for (const name of ['Italo', 'Renan', 'Renato']) barbers.push(await prisma.user.create({ data: { authId: `${name}-${suffix}`, email: `${name}-${suffix}@local.test`, name, role: 'BARBER', barber: { create: {} } }, include: { barber: true } }));
  const client = await prisma.user.create({ data: { authId: `client-${suffix}`, email: `client-${suffix}@local.test`, name: 'Matheus ficticio', role: 'CLIENT', client: { create: {} } }, include: { client: true } });
  const other = await prisma.user.create({ data: { authId: `other-${suffix}`, email: `other-${suffix}@local.test`, name: 'Outro ficticio', role: 'CLIENT', client: { create: {} } }, include: { client: true } });
  const cut = await prisma.service.create({ data: { name: `Corte ${suffix}`, price: 30, duration: 30 } });
  const extraService = await prisma.service.create({ data: { name: `Extra ${suffix}`, price: 10, duration: 5 } });
  const plan = await prisma.subscriptionPlan.create({ data: { name: `Plano Cabelo ${suffix}`, value: 75, services: { create: { serviceId: cut.id } } } });
  const otherPlan = await prisma.subscriptionPlan.create({ data: { name: `Outros ${suffix}`, value: 355, services: { create: { serviceId: cut.id } } } });
  const subscription = await prisma.subscription.create({ data: { clientId: client.client!.id, subscriptionPlanId: plan.id, active: true, status: 'ACTIVE', startDate: new Date('2026-09-01T03:00:00Z'), endDate: new Date('2026-10-01T03:00:00Z') } });
  await prisma.subscription.create({ data: { clientId: other.client!.id, subscriptionPlanId: otherPlan.id, active: true, status: 'ACTIVE', startDate: new Date('2026-09-01T03:00:00Z'), endDate: new Date('2026-11-01T03:00:00Z') } });
  for (const index of [0,1,2,2,2]) await prisma.appointment.create({ data: { clientId: other.client!.id, barberId: barbers[index].barber!.id, serviceId: cut.id,
    dataHora: new Date('2026-10-12T15:00:00Z'), status: 'COMPLETED', financialSnapshot: { version: 1, plan: otherPlan.name, services: [{ id: cut.id, name: cut.name, price: 30, covered: true }] } } });
  const appointment = await prisma.appointment.create({ data: { clientId: client.client!.id, barberId: barbers[1].barber!.id, serviceId: cut.id,
    dataHora: new Date('2026-10-13T15:00:00Z'), status: 'COMPLETED', services: { create: [cut, ...(extra ? [extraService] : [])].map(row => ({ serviceId: row.id, price: row.price, duration: row.duration })) } } });
  const gross = extra ? 40 : 30;
  const commission = await prisma.employeeCommission.create({ data: { appointmentId: appointment.id, barberId: appointment.barberId, amount: gross / 2, percentage: 50 } });
  const income = await prisma.financialTransaction.create({ data: { type: 'INCOME', amount: gross, description: `Atendimento finalizado: ${appointment.id} - Fixture` } });
  const input = { subscriptionId: subscription.id, appointmentId: appointment.id, userId: admin.id, competenceMonth: '2026-10', baseDay: 1, amount: 75,
    reason: 'Responsavel confirmou mensalidade legada de outubro e vencimento dia 1; data e metodo desconhecidos.',
    evidence: { paymentConfirmedByBusiness: true as const, baseDayConfirmedByBusiness: true as const }, operationKey: '',
    expected: { appointmentId: appointment.id, clientId: client.client!.id, barberId: appointment.barberId, serviceId: cut.id, dataHora: appointment.dataHora.toISOString(),
      planId: plan.id, incomeId: income.id, commissionId: commission.id, normalGross: gross, normalCommission: gross / 2, revenue: 430, pool: 172, totalVisits: 5,
      barberCounts: barbers.map((row,index) => ({ barberId: row.barber!.id, count: [1,1,3][index] })) } };
  input.operationKey = legacyReconciliationKey(input);
  return { input, admin, barbers, client, subscription, appointment, commission, income, cut, plan };
}
async function records() {
  return { payments: await prisma.payment.findMany({ orderBy: { id: 'asc' } }), cycles: await prisma.subscriptionCycle.findMany({ orderBy: { id: 'asc' } }),
    subscriptions: await prisma.subscription.findMany({ orderBy: { id: 'asc' } }), appointments: await prisma.appointment.findMany({ orderBy: { id: 'asc' } }),
    commissions: await prisma.employeeCommission.findMany({ orderBy: { id: 'asc' } }), income: await prisma.financialTransaction.findMany({ orderBy: { id: 'asc' } }),
    audits: await prisma.auditLog.findMany({ orderBy: { id: 'asc' } }), payouts: await prisma.subscriptionPayout.findMany() };
}
async function run() {
  let f = await fixture();
  const untouched = await records();
  const financeStart = new Date('2026-10-01T03:00:00Z');
  const financeEnd = new Date('2026-11-01T02:59:59.999Z');
  assert.equal((await getFinanceMetrics(financeStart,financeEnd)).grossRevenue,460);
  const dry = await reconcileLegacySubscriptionPaymentAndAppointment(f.input, { dryRun: true });
  assert.equal(dry.status, 'DRY_RUN'); assert.deepEqual(await records(), untouched); check('Dry-run READ ONLY nao modifica nenhuma tabela');
  const first = await reconcileLegacySubscriptionPaymentAndAppointment(f.input);
  assert.equal(first.status, 'RECONCILED'); check('A: happy path administrativo');
  const pool = await calculateSubscriptionPayouts('2026-10');
  assert.equal(pool.revenueBase,430); check('B: R$430 continua R$430, nao R$505');
  assert.equal((await getFinanceMetrics(financeStart,financeEnd)).grossRevenue,430);check('Dashboard: bruto 460 para 430, sem dupla receita do Payment/Transaction');
  assert.equal(pool.poolAmount,172); check('C: pool continua R$172');
  assert.equal(pool.totalAttendances,6); check('D: visitas 5 para 6');
  const renan = pool.currentDistribution.find(row => row.barberId === f.appointment.barberId)!;
  assert.equal(renan.count,2); check('E: Renan 1 para 2');
  assert.equal(renan.amount,57.33); assert.equal(pool.currentDistribution.find(row=>row.barberId===f.barbers[0].barber!.id)!.amount,28.67); assert.equal(pool.currentDistribution.find(row=>row.barberId===f.barbers[2].barber!.id)!.amount,86); check('F: rateio auditado 57,33 / 28,67 / 86,00');
  assert.equal((await prisma.appointment.findUniqueOrThrow({where:{id:f.appointment.id}})).id,f.appointment.id); assert.equal(await prisma.appointment.count(),6); check('G: mesmo Appointment e nenhuma copia');
  assert.equal(Number((await prisma.financialTransaction.findUniqueOrThrow({where:{id:f.income.id}})).amount),0); check('H: mesmo INCOME 30 para 0');
  assert.equal(Number((await prisma.employeeCommission.findUniqueOrThrow({where:{id:f.commission.id}})).amount),0); check('I: mesma comissao 15 para 0');
  const receipt=await prisma.payment.findFirstOrThrow({where:{subscriptionId:f.subscription.id},include:{transactions:true}});
  assert.equal(receipt.method,null);assert.equal(receipt.paidAt,null);assert.equal(receipt.source,'LEGACY_ADMIN_RECONCILIATION');assert(receipt.reconciledAt);assert.equal(receipt.transactions.length,1);assert.equal(Number(receipt.amount),75);check('S: metodo e data reais UNKNOWN; timestamp de conciliacao distinto');
  assert.equal(await prisma.subscriptionPayout.count(),0);check('U: nenhum payout criado ou PAID');
  const completed=await records();
  const again=await reconcileLegacySubscriptionPaymentAndAppointment(f.input);
  assert.equal(again.status,'ALREADY_RECONCILED');assert.deepEqual(await records(),completed);check('M: retry ALREADY_RECONCILED, zero novas alteracoes');
  f=await fixture();await prisma.employeeCommission.update({where:{id:f.commission.id},data:{paid:true,paidAt:new Date()}});
  const paidState=await records();await assert.rejects(reconcileLegacySubscriptionPaymentAndAppointment(f.input),/Comissao paga/);assert.deepEqual(await records(),paidState);check('J: comissao paga bloqueada sem clawback');
  f=await fixture();await prisma.financialClosure.create({data:{startDate:new Date('2026-10-01T03:00:00Z'),endDate:new Date('2026-11-01T02:59:59Z'),closedAt:new Date()}});
  await assert.rejects(reconcileLegacySubscriptionPaymentAndAppointment(f.input),/Periodo fechado/);assert.equal(await prisma.payment.count(),0);check('K: periodo fechado bloqueia antes de registrar recebimento');
  f=await fixture();await prisma.payment.create({data:{subscriptionId:f.subscription.id,method:'PIX',status:'PAID',amount:75,paidAt:new Date()}});
  await assert.rejects(reconcileLegacySubscriptionPaymentAndAppointment(f.input),/Payment existente/);assert.equal(await prisma.payment.count(),1);assert.equal(await prisma.subscriptionCycle.count(),0);check('L: Payment existente nao duplica');
  f=await fixture();const prior=await prisma.payment.create({data:{subscriptionId:f.subscription.id,method:'PIX',status:'PAID',amount:75,paidAt:new Date()}});
  await prisma.subscriptionCycle.create({data:{subscriptionId:f.subscription.id,paymentId:prior.id,confirmationKey:randomUUID(),dueDate:new Date('2026-10-01T03:00:00Z'),endDate:new Date('2026-11-01T03:00:00Z'),competenceMonth:'2026-10',baseDueDay:1,planId:f.plan.id,planName:f.plan.name,coveredServiceIds:[f.cut.id],confirmedById:f.admin.id}});
  await assert.rejects(reconcileLegacySubscriptionPaymentAndAppointment(f.input),/Payment\/ciclo existente/);assert.equal(await prisma.payment.count(),1);assert.equal(await prisma.subscriptionCycle.count(),1);check('L adicional: ciclo existente nao duplica');
  for(const [label,action] of [['N','SUBSCRIPTION_PAYMENT_CONFIRMED'],['O','LEGACY_SUBSCRIPTION_RECONCILED']]){
    f=await fixture();const original=await records();
    await prisma.$executeRawUnsafe(`CREATE FUNCTION public.reject_legacy_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = '${action}' THEN RAISE EXCEPTION 'fixture rollback'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER reject_legacy_fixture BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION public.reject_legacy_fixture()');
    try{await assert.rejects(reconcileLegacySubscriptionPaymentAndAppointment(f.input));assert.deepEqual(await records(),original);}
    finally{await prisma.$executeRawUnsafe('DROP TRIGGER reject_legacy_fixture ON audit_logs');await prisma.$executeRawUnsafe('DROP FUNCTION public.reject_legacy_fixture()');}
    check(`${label}: falha real PostgreSQL ${action} provoca rollback TOTAL`);
  }
  f=await fixture();await prisma.subscriptionPlanService.deleteMany({where:{subscriptionPlanId:f.plan.id}});await assert.rejects(reconcileLegacySubscriptionPaymentAndAppointment(f.input),/Servico nao pertence/);assert.equal(await prisma.payment.count(),0);check('P: ID de servico sem vinculo bloqueia');
  f=await fixture();const wrong={...f.input,appointmentId:randomUUID()};wrong.operationKey=legacyReconciliationKey(wrong);await assert.rejects(reconcileLegacySubscriptionPaymentAndAppointment(wrong),/Outro Appointment/);check('Q: outro Appointment bloqueia');
  f=await fixture(true);await reconcileLegacySubscriptionPaymentAndAppointment(f.input);assert.equal(Number((await prisma.financialTransaction.findUniqueOrThrow({where:{id:f.income.id}})).amount),10);assert.equal(Number((await prisma.employeeCommission.findUniqueOrThrow({where:{id:f.commission.id}})).amount),5);assert.equal((await calculateSubscriptionPayouts('2026-10')).totalAttendances,6);check('R: extra legitimo R$10/comissao R$5 preservado; uma visita');
  f=await fixture();const preview=await previewSubscriptionBilling(f.subscription.id,f.admin.id);
  await assert.rejects(confirmSubscriptionPayment({subscriptionId:f.subscription.id,userId:f.admin.id,operationKey:preview.operationKey,method:null as never,paidDate:'2026-10-01',acknowledgeLegacy:true}),/metodo real/);
  await assert.rejects(confirmSubscriptionPayment({subscriptionId:f.subscription.id,userId:f.admin.id,operationKey:preview.operationKey,method:'PIX',paidDate:'',acknowledgeLegacy:true}),/data real/);assert.equal(await prisma.payment.count(),0);check('T: normal continua exigindo metodo e data reais');
  f=await fixture();const concurrent=await Promise.all([reconcileLegacySubscriptionPaymentAndAppointment(f.input),reconcileLegacySubscriptionPaymentAndAppointment(f.input)]);
  assert.deepEqual(concurrent.map(row=>row.status).sort(),['ALREADY_RECONCILED','RECONCILED']);assert.equal(await prisma.payment.count(),1);assert.equal(await prisma.subscriptionCycle.count(),1);check('Concorrencia PostgreSQL: apenas uma conciliacao, outro retry reconhece estado');
  for(const userId of [f.client.id,f.barbers[1].id,randomUUID()])await assert.rejects(reconcileLegacySubscriptionPaymentAndAppointment({...f.input,userId}),/ADMIN/);check('CLIENT/BARBER/anonimo nao conciliam');
  console.log(JSON.stringify({pass:checks.length,fail:0,checks,productionWrites:0,safeDatabase:'renato_cortes_test'},null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await clear();await prisma.$disconnect();});
