import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { legacyReconciliationKey, reconcileLegacySubscriptionPaymentAndAppointment, type LegacyReconciliationInput } from '@/lib/server/legacy-subscription-reconciliation';
import { calculateSubscriptionPayouts } from '@/lib/server/subscription-payouts';

const requiredMigrations = ['20261013000000_subscription_billing_cycles', '20261013001000_subscription_coverage_boundaries', '20261014000000_legacy_subscription_reconciliation'];
const mask = (id: string) => `${id.slice(0,8)}...`;
let client: PrismaClient | undefined;
let stage = 'configuration';
async function main() {
  const write = process.argv.includes('--write');
  if (!process.argv.includes('--production')) throw new Error('EXPLICIT_PRODUCTION_REQUIRED');
  if (write && !process.argv.includes('--confirm-write=RECONCILE_MATHEUS_OCTOBER')) throw new Error('WRITE_CONFIRMATION_REQUIRED');
  const url = process.env.LEGACY_RECONCILIATION_DATABASE_URL;
  if (!url) throw new Error('SEPARATE_CREDENTIAL_REQUIRED');
  const destination = new URL(url);
  if (!['postgres:', 'postgresql:'].includes(destination.protocol) || !/\.(supabase\.co|supabase\.com)$/.test(destination.hostname) ||
      !process.env.LEGACY_RECONCILIATION_EXPECTED_HOST || destination.hostname !== process.env.LEGACY_RECONCILIATION_EXPECTED_HOST) throw new Error('PRODUCTION_DESTINATION_MISMATCH');
  const release = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();
  if (process.env.LEGACY_RECONCILIATION_EXPECTED_RELEASE_SHA !== release) throw new Error('EXPECTED_RELEASE_REQUIRED');
  if (write) {
    const dirty = execFileSync('git',['status','--porcelain'],{encoding:'utf8',windowsHide:true});
    if (dirty.trim()) throw new Error('WRITE_REQUIRES_CLEAN_RELEASE');
  }
  const actorId = process.env.LEGACY_RECONCILIATION_ADMIN_ID;
  const operationKey = process.env.LEGACY_RECONCILIATION_OPERATION_KEY;
  const expectedUser = process.env.LEGACY_RECONCILIATION_EXPECTED_USER;
  const reason = process.env.LEGACY_RECONCILIATION_REASON;
  if (!actorId || !operationKey || !expectedUser || !reason || reason.trim().length < 20) throw new Error('ADMIN_KEY_USER_EVIDENCE_REQUIRED');
  client = new PrismaClient({datasources:{db:{url}}});
  stage = 'readonly.preflight';
  const input = await client.$transaction(async db => {
    await db.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const ro = await db.$queryRawUnsafe<{transaction_read_only:string}[]>('SHOW transaction_read_only');
    if(ro[0]?.transaction_read_only!=='on')throw new Error('READONLY_REQUIRED');
    const identity = await db.$queryRawUnsafe<{username:string;database:string;superuser:boolean}[]>(`SELECT current_user AS username,current_database() AS database,rolsuper AS superuser FROM pg_roles WHERE rolname=current_user`);
    if(identity[0]?.username!==expectedUser || identity[0]?.database!=='postgres' || identity[0]?.superuser || (write && identity[0]?.username==='renato_auditoria'))throw new Error('PRINCIPAL_MISMATCH');
    const migrations = await db.$queryRaw<{migration_name:string}[]>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    if(requiredMigrations.some(name=>!migrations.some(row=>row.migration_name===name)))throw new Error('MIGRATIONS_NOT_READY');
    const appointments = await db.appointment.findMany({where:{client:{user:{name:{contains:'Matheus',mode:'insensitive'}}},barber:{user:{name:{equals:'Renan',mode:'insensitive'}}},
      dataHora:{gte:new Date('2026-10-13T03:00:00Z'),lt:new Date('2026-10-14T03:00:00Z')},deletedAt:null},include:{service:true,services:{include:{service:true}},commissions:true}});
    if(appointments.length!==1)throw new Error('INCIDENT_AMBIGUOUS');
    const appointment=appointments[0];
    if(appointment.status!=='COMPLETED'||appointment.dataHora.toISOString()!=='2026-10-13T15:00:00.000Z'||appointment.service.name!=='Corte Degradê Navalhado'||
      appointment.services.length>1 || Number(appointment.services[0]?.price??appointment.service.price)!==30)throw new Error('INCIDENT_CHANGED');
    const subscriptions=await db.subscription.findMany({where:{clientId:appointment.clientId,deletedAt:null,subscriptionPlan:{name:'Plano Cabelo'}},include:{subscriptionPlan:{include:{services:true}}}});
    if(subscriptions.length!==1||Number(subscriptions[0].subscriptionPlan.value)!==75)throw new Error('SUBSCRIPTION_AMBIGUOUS');
    const subscription=subscriptions[0];
    const key=legacyReconciliationKey({subscriptionId:subscription.id,appointmentId:appointment.id,competenceMonth:'2026-10',baseDay:1});
    if(operationKey!==key)throw new Error('OPERATION_KEY_MISMATCH');
    const prior=await db.auditLog.findFirst({where:{entity:'Appointment',entityId:appointment.id,action:'LEGACY_SUBSCRIPTION_RECONCILED'}});
    let expected: LegacyReconciliationInput['expected'];
    if(prior){
      const meta=prior.metadata as {expected?:LegacyReconciliationInput['expected'];operationKey?:string}|null;
      if(meta?.operationKey!==key||!meta.expected)throw new Error('PRIOR_AUDIT_INVALID');
      expected=meta.expected;
    }else{
      const incomes=await db.financialTransaction.findMany({where:{deletedAt:null,description:{startsWith:`Atendimento finalizado: ${appointment.id} - `}}});
      if(incomes.length!==1||appointment.commissions.length!==1)throw new Error('FINANCIAL_IDENTITY_AMBIGUOUS');
      const pool=await calculateSubscriptionPayouts('2026-10',db);
      const barbers=await db.barber.findMany({include:{user:true}});
      for(const [name,count] of [['Renan',1],['Renato',3],['Italo',1]] as const){
        const matched=barbers.filter(row=>row.user.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()===name.toLowerCase());
        if(matched.length!==1||pool.currentDistribution.find(row=>row.barberId===matched[0].id)?.count!==count)throw new Error('AUDITED_DISTRIBUTION_CHANGED');
      }
      if(pool.revenueBase!==430||pool.poolAmount!==172||pool.totalAttendances!==5)throw new Error('AUDITED_POOL_CHANGED');
      expected={appointmentId:appointment.id,clientId:appointment.clientId,barberId:appointment.barberId,serviceId:appointment.serviceId,dataHora:appointment.dataHora.toISOString(),
        planId:subscription.subscriptionPlanId,incomeId:incomes[0].id,commissionId:appointment.commissions[0].id,normalGross:30,normalCommission:15,
        revenue:430,pool:172,totalVisits:5,barberCounts:pool.currentDistribution.map(row=>({barberId:row.barberId,count:row.count}))};
    }
    return {subscriptionId:subscription.id,appointmentId:appointment.id,userId:actorId,competenceMonth:'2026-10',baseDay:1,amount:75,reason,operationKey,
      evidence:{paymentConfirmedByBusiness:true as const,baseDayConfirmedByBusiness:true as const},expected};
  },{isolationLevel:'RepeatableRead',timeout:60000,maxWait:10000});
  stage=write?'authorized.write.domain':'readonly.dryRun.domain';
  const result=await reconcileLegacySubscriptionPaymentAndAppointment(input,{dryRun:!write},client);
  console.log(JSON.stringify({status:result.status,mode:write?'WRITE':'DRY_RUN',release,appointmentId:mask(input.appointmentId),subscriptionId:mask(input.subscriptionId),
    projection:result.projection ? {...result.projection,distribution:result.projection.distribution.map(row=>({...row,barberId:mask(row.barberId)}))}:null,
    writesExecuted:write&&result.status==='RECONCILED',exactPaidDateKnown:false,methodKnown:false},null,2));
}
main().catch(()=>{console.error(JSON.stringify({blocked:true,stage,details:'Failure details withheld to protect credentials/PII; no automatic retry outside domain.'}));process.exitCode=1;})
  .finally(async()=>{if(client){try{await client.$disconnect();}catch{process.exitCode=1;}}});
