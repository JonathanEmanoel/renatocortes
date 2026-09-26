import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const requireDependency = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const ts = requireDependency(root + '/frontend/node_modules/typescript');
// Execute actual TypeScript functions with an in-memory Prisma boundary. No database URL is used.
const results = { checks: [] };
const {Prisma} = requireDependency(root + '/frontend/node_modules/@prisma/client');
let db;
let role = 'ADMIN';
const cache = new Map();
function load(relative) {
  if (cache.has(relative)) return cache.get(relative);
  const filename = root+'/frontend/'+relative;
  const source = fs.readFileSync(filename,'utf8');
  const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const loadedModule = {exports:{}};
  const customRequire = (name) => {
    if (name === '@/lib/prisma') return {prisma:new Proxy({}, {get:(_,k)=>db[k]})};
    if (name === '@/lib/server/internal-auth') return {getAuthenticatedUser:async()=> role ? {user:{id:'admin',role}} : null};
    if (name === '@/lib/server/audit') return {createAuditLog:async()=>{}};
    if (name === 'next/server') return {NextResponse:{json:(body,options)=>({body,status:options?.status??200})}};
    if (name.startsWith('@/')) return load(name.slice(2)+'.ts');
    if (name === '@prisma/client') return {Prisma};
    return requireDependency(requireDependency.resolve(name,{paths:[root+'/frontend']}));
  };
  vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename})(customRequire,loadedModule,loadedModule.exports);
  cache.set(relative,loadedModule.exports);
  return loadedModule.exports;
}
const payout = load('lib/server/subscription-payouts.ts');
const finance = load('lib/server/finance-rules.ts');
const manual = load('lib/server/manual-services.ts');
const report = load('lib/server/barber-report.ts');
let state;
function reset(counts=[2,2,0], revenue=1000) {
  state = {payouts:[],expenses:[],transactions:[],counts,revenue,active:[true,true,true],appointments:[]};
  const barbers = ()=>['a','b','c'].map((id,i)=>({id,user:{name:id},active:state.active[i]}));
  db = {
    barber:{findMany:async(args)=>barbers().filter(b=>!args?.where?.active||b.active)},
    subscription:{findMany:async()=>[{subscriptionPlan:{value:state.revenue}}]},
    appointment:{findMany:async()=>state.appointments},
    manualService:{findMany:async()=>state.counts.flatMap((n,i)=>Array.from({length:n},(_,j)=>({id:`${i}-${j}`,barberId:['a','b','c'][i],serviceDate:new Date('2026-08-31T15:00:00Z'),createdAt:new Date('2026-09-02T15:00:00Z'),items:[{coveredBySubscription:true},{coveredBySubscription:true}]})))},
    subscriptionPayout:{
      findUnique:async({where})=>where.operationKey ? state.payouts.find(p=>p.operationKey===where.operationKey) ?? null : null,
      findFirst:async({where})=>state.payouts.find(p=>where.expenseId?.in.includes(p.expenseId)) ?? null,
      findMany:async({where})=>state.payouts.filter(p=>(!where.barberId||p.barberId===where.barberId)&&(!where.status||p.status===where.status)&&(!where.paidAt||p.paidAt>=where.paidAt.gte&&p.paidAt<=where.paidAt.lte)),
      aggregate:async({where})=>({_max:{adjustmentNumber:Math.max(0,...state.payouts.filter(p=>p.barberId===where.barberId).map(p=>p.adjustmentNumber))}}),
      upsert:async({where,create})=>{
        const k=where.competenceMonth_barberId_adjustmentNumber;
        let p=state.payouts.find(p=>p.barberId===k.barberId&&p.competenceMonth===k.competenceMonth&&p.adjustmentNumber===k.adjustmentNumber);
        if(!p){p={...create,id:'p'+state.payouts.length,barber:{user:{name:create.barberId}}};state.payouts.push(p);}return {...p};
      },
      updateMany:async({where,data})=>{const p=state.payouts.find(p=>p.id===where.id&&p.status===where.status);if(!p)return {count:0};Object.assign(p,data);return {count:1};},
      update:async({where,data})=>{const p=state.payouts.find(p=>p.id===where.id);Object.assign(p,data);return p;}
    },
    expenseCategory:{upsert:async()=>({id:'category'})},
    expense:{create:async({data})=>{const e={...data,id:`00000000-0000-4000-8000-${String(state.expenses.length+1).padStart(12,'0')}`};state.expenses.push(e);return e;},update:async({where,data})=>{const e=state.expenses.find(e=>e.id===where.id);Object.assign(e,data);return e;}},
    financialTransaction:{create:async({data})=>{state.transactions.push(data);return data;}}
  };
  let queue=Promise.resolve();
  db.$queryRaw=async(strings)=>{const sql=strings.join('?');if(/information_schema\.columns/.test(sql))return [{exists:true}];assert.match(sql,/pg_advisory_xact_lock/);state.locks=(state.locks??0)+1;return [{locked:1}];};
  db.$transaction=fn=>{const next=queue.then(async()=>{
    const before={payouts:state.payouts.map(p=>({...p})),expenses:state.expenses.map(e=>({...e})),transactions:[...state.transactions]};
    try{return await fn(db);}catch(error){Object.assign(state,before);throw error;}
  });queue=next.catch(()=>{});return next;};
}
async function check(name,fn){try {const detail=await fn();results.checks.push({name,status:'PASS',detail});}catch(e){results.checks.push({name,status:'FAIL',detail:e.message});}}
async function operation(barberId='a',adjustment=false){const calculation=await payout.calculateSubscriptionPayouts('2026-08');const row=calculation.rows.find(r=>r.barberId===barberId&&r.type===(adjustment?'ADJUSTMENT':'MAIN')&&(r.isVirtual||!adjustment));return {competenceMonth:'2026-08',barberId,adjustment,paidById:'admin',operationKey:row?.operationKey??'0'.repeat(64)};}
async function pay(barberId='a',adjustment=false){return payout.paySubscriptionPayout(await operation(barberId,adjustment));}
(async()=>{
await check('60/40; 2/2; zero barber',async()=>{reset();const r=await payout.calculateSubscriptionPayouts('2026-08');assert.equal(r.businessShare,600);assert.equal(r.poolAmount,400);assert.deepEqual(r.rows.map(x=>x.calculatedAmount),[200,200,0]);});
await check('3/2; retroactive before payment',async()=>{reset([3,2,0]);const r=await payout.calculateSubscriptionPayouts('2026-08');assert.deepEqual(r.rows.map(x=>x.calculatedAmount),[240,160,0]);});
await check('zero attendances',async()=>{reset([0,0,0]);const r=await payout.calculateSubscriptionPayouts('2026-08');assert.equal(r.distributedTotal,0);await assert.rejects(pay(),/positivo/);});
await check('cent rounding deterministic',()=>{const counts=['a','b','c'].map(barberId=>({barberId,count:1}));assert.deepEqual([...payout.distributeSubscriptionPoolCents(10000,counts).values()],[3334,3333,3333]);});
await check('single payment; cash date; retry; other barber remains pending',async()=>{reset();await pay();assert.equal(state.expenses.length,1);assert.equal(state.transactions.length,1);assert.equal(state.payouts[0].competenceMonth,'2026-08');assert.equal(+state.payouts[0].paidAt,+state.expenses[0].paidAt);await assert.rejects(pay(),/ja foi pago/);assert.equal(state.expenses.length,1);const r=await payout.calculateSubscriptionPayouts('2026-08');assert.equal(r.rows[1].status,'PENDING');});
await check('MAIN simultaneous calls; two tabs',async()=>{reset();const outcomes=await Promise.allSettled([pay(),pay()]);assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(state.expenses.length,1);});
await check('ADJUSTMENT concurrent stale calculation',async()=>{reset();await pay('a');await pay('b');state.counts=[3,2,0];const outcomes=await Promise.allSettled([pay('a',true),pay('a',true)]);const adjustments=state.payouts.filter(p=>p.type==='ADJUSTMENT');assert.equal(adjustments.length,1,`created ${adjustments.length} adjustments; outcomes=${outcomes.map(x=>x.status).join(',')}; total paid a=${state.payouts.filter(p=>p.barberId==='a').reduce((s,p)=>s+Number(p.paidAmount),0)}`);});
await check('paid MAIN historical display immutable',async()=>{reset();await pay();state.counts=[3,2,0];const r=await payout.calculateSubscriptionPayouts('2026-08');assert.equal(r.rows.find(x=>x.barberId==='a'&&x.type==='MAIN').calculatedAmount,200);});
await check('positive and negative adjustment; no automatic clawback',async()=>{reset();await pay('a');await pay('b');state.counts=[3,2,0];const r=await payout.calculateSubscriptionPayouts('2026-08');assert.deepEqual(r.rows.filter(x=>x.type==='ADJUSTMENT').map(x=>[x.calculatedAmount,x.status]),[[40,'PENDING'],[-40,'REVIEW']]);assert.equal(state.expenses.length,2);});
await check('inactive barber paid history retained',async()=>{reset();await pay();state.active[0]=false;const r=await payout.calculateSubscriptionPayouts('2026-08');assert.equal(r.paidTotal,200);});
await check('Corte+Barba manual = one visit',async()=>{reset([1,0,0]);const r=await payout.calculateSubscriptionPayouts('2026-08');assert.equal(r.totalAttendances,1);});
await check('covered extra commission; normal weekly percent',()=>{const r=manual.manualServiceTotals({items:[{quantity:1,chargedUnitPrice:0,coveredBySubscription:true},{quantity:1,chargedUnitPrice:30,coveredBySubscription:false}]});assert.equal(r.chargedGross,30);assert.equal(r.commission,15);assert.equal(finance.SERVICE_COMMISSION_PERCENT,50);});
await check('pending/rejected/inactive subscription eligibility',()=>{for(const status of ['PENDING','REJECTED','CANCELED'])assert.equal(finance.hasActiveSubscriptionAt([{active:true,status,startDate:new Date('2026-08-01'),endDate:null}],new Date('2026-08-15')),false);});
await check('paidAt period selection',async()=>{reset();await pay();const p=state.payouts[0];p.paidAt=new Date('2026-09-05T15:00:00Z');assert.equal(await payout.paidSubscriptionPayoutTotalForBarber('a',new Date('2026-08-01'),new Date('2026-09-01')),0);assert.equal(await payout.paidSubscriptionPayoutTotalForBarber('a',new Date('2026-09-01'),new Date('2026-10-01')),200);});
const endpoint=load('app/api/internal/subscription-payouts/route.ts');
await check('BARBER CLIENT anonymous endpoint denied',async()=>{for(role of ['BARBER','CLIENT',null])assert.equal((await endpoint.POST({json:async()=>({})})).status,403);});
await check('only ADMIN manages payments (DEVELOPER denied)',async()=>{role='DEVELOPER';assert.equal((await endpoint.POST({json:async()=>({})})).status,403);});
function sampleAppointment(covered=true){return {id:'appointment',barberId:'a',status:'COMPLETED',dataHora:new Date('2026-08-31T15:00:00Z'),service:{id:'cut',name:'Corte',price:20},services:[{serviceId:'cut',price:20,service:{id:'cut',name:'Corte',price:20}},{serviceId:'beard',price:30,service:{id:'beard',name:'Barba',price:30}}],client:{user:{name:'Synthetic'},subscriptions:[{active:true,status:'ACTIVE',deletedAt:null,startDate:new Date('2026-08-01'),endDate:null,subscriptionPlan:{name:'Plan',services:[{serviceId:covered?'cut':'other'}]}}]}};}
const filters={barberId:'a',period:'month',month:'2026-08',types:['site','manual','subscription','sales'],productType:'all',commission:'all'};
function reportDb(appointment){reset([0,0,0]);state.appointments=[appointment];db.barber.findFirst=async()=>({id:'a',user:{name:'a'}});db.service={findMany:async()=>[]};db.product={findMany:async()=>[]};db.employeeCommission={findMany:async()=>[]};db.auditLog={findMany:async()=>[]};db.sale={findMany:async()=>[]};}
await check('appointment x manual covered visit',async()=>{reportDb(sampleAppointment());const r=await payout.calculateSubscriptionPayouts('2026-08');assert.equal(r.totalAttendances,1);});
await check('report estimate uses same eligible visits as payout',async()=>{reportDb(sampleAppointment(false));const r=await report.getBarberReport(filters);const p=await payout.calculateSubscriptionPayouts('2026-08');assert.equal(r.summary.subscriptionBarberAppointments,p.totalAttendances);});
await check('site covered plus extra counts one daily attendance',async()=>{reportDb(sampleAppointment());const r=await report.getBarberReport(filters);const series=report.getBarberDailySeries(r);const day=series.find(d=>d.dateLabel==='31/08');assert.equal(day?.count,1,JSON.stringify(day));});
await check('site extra immediate commission and paid estimate separation',async()=>{reportDb(sampleAppointment());const r=await report.getBarberReport(filters);assert.equal(r.summary.siteCommission,15);assert.equal(r.summary.subscriptionCommission,0);assert.equal(r.summary.totalCommission,15);});
await check('admin finance excludes covered service and includes regular commission',async()=>{reportDb(sampleAppointment());db.financialTransaction.findMany=async()=>[];db.expense.findMany=async()=>[];state.revenue=0;const r=await finance.getFinanceMetrics(new Date('2026-08-01'),new Date('2026-09-01'));assert.equal(r.grossRevenue,30);assert.equal(r.netProfit,15);});
await check('subscriber extra finalization persists commission',async()=>{reportDb(sampleAppointment());role='ADMIN';const a=sampleAppointment();a.id='00000000-0000-4000-8000-000000000001';a.status='CONFIRMED';db.appointment.findFirst=async()=>a;db.appointment.updateMany=async({data})=>{Object.assign(a,data);return {count:1};};db.employeeCommission.findFirst=async()=>null;let amount=0;db.employeeCommission.create=async({data})=>{amount+=data.amount;return data;};const route=load('app/api/internal/appointments/route.ts');const response=await route.PATCH({json:async()=>({appointmentId:a.id,action:'finish'})});assert.equal(response.status,200);assert.equal(amount,15);assert.equal(state.transactions[0].amount,30);assert.equal(a.financialSnapshot.services.length,2);});

const baselineCount=results.checks.length;
await check('adjustment simple then identical sequential retries',async()=>{reset();await pay('a');await pay('b');state.counts=[3,2,0];const request=await operation('a',true);await payout.paySubscriptionPayout(request);await assert.rejects(payout.paySubscriptionPayout(request),/ja foi pago/);await assert.rejects(payout.paySubscriptionPayout(request),/ja foi pago/);assert.equal(state.payouts.filter(p=>p.type==='ADJUSTMENT').length,1);assert.equal(state.payouts.filter(p=>p.barberId==='a').reduce((s,p)=>s+Number(p.paidAmount),0),240);assert.ok(state.locks>=5);});
await check('old operation retry after another retroactive change',async()=>{reset();await pay();state.counts=[3,2,0];const request=await operation('a',true);await payout.paySubscriptionPayout(request);state.counts=[4,2,0];await assert.rejects(payout.paySubscriptionPayout(request),/ja foi pago/);assert.equal(state.expenses.length,2);});
await check('stale confirmation rejected',async()=>{reset();const request=await operation();state.counts=[3,2,0];await assert.rejects(payout.paySubscriptionPayout(request),/calculo mudou/);assert.equal(state.expenses.length,0);});
await check('paid snapshot fields preserved after retroactive',async()=>{reset();await pay();const before={...state.payouts[0]};state.counts=[3,2,0];const r=await payout.calculateSubscriptionPayouts('2026-08');const main=r.rows.find(r=>r.barberId==='a'&&r.type==='MAIN');assert.equal(main.calculatedAmount,200);assert.equal(main.subscriberAttendances,2);assert.equal(main.sharePercent,50);assert.deepEqual(main.snapshot,before.snapshot);assert.equal(main.paidById,'admin');assert.equal(main.expenseId,before.expenseId);assert.equal(r.rows.find(r=>r.barberId==='a'&&r.type==='ADJUSTMENT').calculatedAmount,40);});
const expenses=load('app/api/internal/expenses/route.ts');
await check('linked payout expense PATCH blocked',async()=>{reset();role='ADMIN';await pay();const e=state.expenses[0];const response=await expenses.PATCH({json:async()=>({expenseId:e.id,name:'Alteracao',amount:150,status:'PAID'})});assert.equal(response.status,409);assert.equal(Number(state.expenses[0].amount),200);assert.equal(Number(state.payouts[0].paidAmount),200);});
await check('linked payout expense DELETE blocked',async()=>{reset();role='ADMIN';await pay();const response=await expenses.DELETE({json:async()=>({expenseId:state.expenses[0].id})});assert.equal(response.status,409);assert.equal(state.expenses[0].deletedAt,undefined);});
await check('protected expense maintenance guard',async()=>{reset();await pay();const protection=load('lib/server/expense-protection.ts');await assert.rejects(protection.assertExpenseNotLinkedToPayout(db,[state.expenses[0].id]),/vinculada/);});
await check('avulso multiplier x5 preserved',async()=>{reportDb(sampleAppointment());state.appointments=[];const service={id:'cut',name:'Corte',price:20};db.manualService.findMany=async({where})=>where.subscriptionId?[]:[{id:'manual5',barberId:'a',serviceDate:new Date('2026-08-31T15:00:00Z'),subscriptionId:null,customerName:'',client:null,items:[{quantity:5,chargedUnitPrice:20,unitPrice:20,coveredBySubscription:false,serviceId:'cut',service}],changeRequests:[]}];const r=await report.getBarberReport(filters);assert.equal(r.summary.manualCount,5);assert.equal(r.summary.manualCommission,50);});
await check('appointment snapshot survives plan cancellation and price change',()=>{const a=sampleAppointment();a.financialSnapshot=finance.appointmentFinancials(a).snapshot;a.client.subscriptions[0].active=false;a.services[1].price=100;const financials=finance.appointmentFinancials(a);assert.equal(financials.chargedGross,30);assert.equal(financials.commission,15);assert.equal(financials.hasCoveredVisit,true);});
await check('payment failure rolls back all financial writes in transaction double',async()=>{reset();db.financialTransaction.create=async()=>{throw new Error('injected failure');};await assert.rejects(pay(),/injected failure/);assert.equal(state.payouts.length,0);assert.equal(state.expenses.length,0);});
results.baseline={pass:results.checks.slice(0,baselineCount).filter(r=>r.status==='PASS').length,fail:results.checks.slice(0,baselineCount).filter(r=>r.status==='FAIL').length};
console.log(JSON.stringify(results,null,2));
if(results.checks.some(r=>r.status==='FAIL'))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
