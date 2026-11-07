import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),ts=require('typescript');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const clock='2026-11-06T09:00:00-03:00';
class Clock extends Date {constructor(...args){super(...(args.length?args:[clock]));}static now(){return +new Date(clock);}}
let breaks=[],busy=[],duration=30,writes=0;
const barberId='00000000-0000-4000-8000-000000000001',serviceId='00000000-0000-4000-8000-000000000002';
const db={barber:{findFirst:async()=>({id:barberId,user:{name:'Fixture'}})},service:{findMany:async()=>[{id:serviceId,name:'Fixture',duration,price:30}]},barberAvailability:{findMany:async()=>[{startTime:'09:00',endTime:'18:00'}]},barberScheduleBreak:{findMany:async()=>breaks},appointment:{findMany:async()=>busy,create:async()=>{writes++;return {id:'fixture',services:[],barber:{user:{name:'Fixture'}}};}},$queryRaw:async()=>[], $transaction:async fn=>fn(db)};
const cache=new Map();
function load(file){if(cache.has(file))return cache.get(file);const m={exports:{}};const out=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const resolve=n=>n==='@/lib/prisma'?{prisma:db}:n==='next/server'?{NextResponse:{json:(body,opts)=>({body,status:opts?.status??200})}}:n==='@/lib/server/auth'?{getAuthenticatedClient:async()=>({client:{id:'fixture'},user:{name:'Fixture'}})}:n==='@/lib/google-calendar'?{buildCalendarEvent:()=>({}),buildGoogleCalendarAuthUrl:()=>''}:n.startsWith('@/')?load(n.slice(2)+'.ts'):require(n);
vm.runInNewContext('(function(require,module,exports){'+out+'\n})',{Date:Clock,Intl,URL,console})(resolve,m,m.exports);cache.set(file,m.exports);return m.exports;}
const rules=load('lib/availability-rules.ts'),slots=load('lib/client-scheduling.ts'),api=load('app/api/appointments/route.ts');const checks=[];
async function check(name,fn){await fn();checks.push(name);}
const day={weekDay:1,active:true,startTime:'09:00',endTime:'18:00',breaks:[{startTime:'12:00',endTime:'13:00'}]};
for(const [start,end,allowed] of [[660,690,true],[690,720,true],[690,750,false],[720,750,false],[750,780,false],[750,810,false],[780,810,true],[660,840,false],[540,1080,false]])await check(`Overlap ${start}-${end}`,()=>assert.equal(!rules.overlaps({start,end},{start:720,end:780}),allowed));
await check('Break enclosing appointment',()=>assert.ok(rules.overlaps({start:720,end:780},{start:660,end:840})));
for(const [name,changes] of [['equal',{breaks:[{startTime:'12:00',endTime:'12:00'}]}],['inverted',{breaks:[{startTime:'13:00',endTime:'12:00'}]}],['before',{breaks:[{startTime:'08:00',endTime:'09:30'}]}],['after',{breaks:[{startTime:'17:30',endTime:'19:00'}]}],['overlap',{breaks:[{startTime:'12:00',endTime:'13:00'},{startTime:'12:30',endTime:'14:00'}]}],['invalid clock',{startTime:'24:00'}],['blank',{breaks:[{startTime:'',endTime:''}]}],['overnight',{startTime:'22:00',endTime:'06:00'}]])await check('Reject '+name,()=>assert.equal(rules.availabilityDaySchema.safeParse({...day,...changes}).success,false));
await check('Adjacent and multiple valid breaks',()=>assert.equal(rules.availabilityDaySchema.safeParse({...day,breaks:[{startTime:'12:00',endTime:'12:30'},{startTime:'12:30',endTime:'13:00'},{startTime:'16:00',endTime:'16:15'}]}).success,true));
await check('Duplicate weekdays rejected',()=>assert.equal(rules.weeklyAvailabilitySchema.safeParse(Array(7).fill(day)).success,false));
await check('Description optional and private',()=>assert.equal(rules.availabilityDaySchema.safeParse(day).success,true));
await check('Existing UI weekday label is accepted',()=>assert.equal(rules.availabilityDaySchema.safeParse({...day,label:'Segunda'}).success,true));
for(const minutes of [15,30,45,60,90,120])await check(`Slots full duration ${minutes}`,()=>{const times=slots.clientAvailableTimes('2026-11-09',minutes,[{start:540,end:1080}],[{start:720,end:780},{start:960,end:990}],new Clock());for(const time of times){const start=slots.minutesFromTime(time);assert.ok(!rules.overlaps({start,end:start+minutes},{start:720,end:780}));assert.ok(!rules.overlaps({start,end:start+minutes},{start:960,end:990}));assert.ok(start+minutes<=1080);}});
await check('No breaks preserves exact grid',()=>assert.deepEqual(Array.from(slots.clientAvailableTimes('2026-11-09',30,[{start:540,end:1080}],[],new Clock())),['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00']));
await check('Inactive day has no windows',()=>assert.equal(slots.clientAvailableTimes('2026-11-09',30,[],[{start:720,end:780}],new Clock()).length,0));
await check('Break plus existing appointment',async()=>{breaks=[{startTime:'12:00',endTime:'13:00',label:'Private reason'}];busy=[{dataHora:new Date('2026-11-09T14:00:00-03:00'),service:{duration:30},services:[]}];const r=await api.GET(new Request(`http://local/api/appointments?barberId=${barberId}&serviceId=${serviceId}&date=2026-11-09`));assert.equal(r.status,200);assert.ok(!r.body.times.includes('12:00'));assert.ok(!r.body.times.includes('14:00'));assert.ok(r.body.times.includes('13:00'));assert.ok(!JSON.stringify(r.body).includes('Private reason'));});
await check('Direct POST rejects start before pause for 60min',async()=>{duration=60;const r=await api.POST(new Request('http://local/api/appointments',{method:'POST',body:JSON.stringify({barberId,serviceIds:[serviceId],date:'2026-11-09',time:'11:30'})}));assert.equal(r.status,409);assert.equal(writes,0);});
await check('Stale slot rejected after new pause',async()=>{duration=30;busy=[];breaks=[];const q=`http://local/api/appointments?barberId=${barberId}&serviceId=${serviceId}&date=2026-11-09`;assert.ok((await api.GET(new Request(q))).body.times.includes('12:00'));breaks=[{startTime:'12:00',endTime:'13:00'}];const r=await api.POST(new Request('http://local/api/appointments',{method:'POST',body:JSON.stringify({barberId,serviceIds:[serviceId],date:'2026-11-09',time:'12:00'})}));assert.equal(r.status,409);assert.equal(writes,0);});
await check('Server validator allows exact boundaries',async()=>{const {validateAvailability}=load('lib/server/appointment-availability.ts');duration=30;for(const time of ['11:30','13:00','09:00','14:00'])assert.equal((await validateAvailability({barberId,serviceIds:[serviceId],date:'2026-11-09',time})).ok,true);});
console.log(JSON.stringify({pass:checks.length,fail:0,checks},null,2));
