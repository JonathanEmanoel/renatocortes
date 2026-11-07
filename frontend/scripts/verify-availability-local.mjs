import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const frontend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'renato-breaks-local-')),app=path.join(root,'frontend'),cluster=path.join(root,'cluster');
const pg=path.join(process.env.LOCALAPPDATA,'RenatoCortesTools/PostgreSQL17/pgsql/bin');
const allow=new Set(['PATH','PATHEXT','SYSTEMROOT','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','HOME','APPDATA','LOCALAPPDATA','PROGRAMDATA','PROGRAMFILES','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE']);
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>allow.has(k.toUpperCase())));
let started=false,next,stage='setup';const checks=[];
const write=(p,s)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s);};
async function run(name,exe,args,cwd=app,extra={}){const p=spawn(exe,args,{cwd,env:{...env,...extra},windowsHide:true,stdio:['ignore','pipe','pipe']});let out='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>out+=x);const code=await new Promise((r,j)=>{p.on('error',j);p.on('close',r);});write(path.join(root,name+'.log'),out.replace(/postgres(?:ql)?:\/\/[^\s"']+/g,'[LOCAL_CONNECTION]'));assert.equal(code,0,name+' failed');checks.push(name);return out;}
async function pgctl(args){const p=spawn(path.join(pg,'pg_ctl.exe'),args,{env,windowsHide:true,stdio:'ignore'});assert.equal(await new Promise(r=>p.on('close',r)),0);}
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function main(){
 fs.mkdirSync(app);
 for(const name of ['app','components','lib','utils','types','store','public','prisma','tests'])if(fs.existsSync(path.join(frontend,name)))fs.cpSync(path.join(frontend,name),path.join(app,name),{recursive:true});
 for(const name of ['package.json','package-lock.json','tsconfig.json','next-env.d.ts','next.config.ts','postcss.config.mjs','postcss.config.js','tailwind.config.ts','eslint.config.mjs'])if(fs.existsSync(path.join(frontend,name)))fs.copyFileSync(path.join(frontend,name),path.join(app,name));
 fs.symlinkSync(path.join(frontend,'node_modules'),path.join(app,'node_modules'),'junction');
 const pgPort=await port(),httpPort=await port();
 await run('initdb',path.join(pg,'initdb.exe'),['-D',cluster,'-U','postgres','-A','trust','--encoding=UTF8','--no-locale']);
 await pgctl(['-D',cluster,'-l',path.join(root,'postgres.log'),'-o',`-h 127.0.0.1 -p ${pgPort} -c log_statement=none -c log_min_error_statement=panic`,'-w','start']);started=true;
 Object.assign(env,{PGHOST:'127.0.0.1',PGPORT:String(pgPort),PGUSER:'postgres',PGDATABASE:'postgres',PGSSLMODE:'disable'});
 await run('createdb',path.join(pg,'createdb.exe'),['--no-password','renato_cortes_test']);
 const url=`postgresql://postgres@127.0.0.1:${pgPort}/renato_cortes_test`;
 assert.equal(new URL(url).hostname,'127.0.0.1');
 Object.assign(env,{DATABASE_URL:url,DIRECT_URL:url,TEST_DATABASE_URL:url,CONFIRM_LOCAL_TEST_DATABASE:'renato_cortes_test',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:1',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'local-fixture',NEXT_TELEMETRY_DISABLED:'1',TZ:'UTC',AVAILABILITY_FIXTURE:path.join(root,'fixture.json')});
 const config=path.join(root,'prisma.config.cjs'),require=createRequire(import.meta.url);
 write(config,`const {defineConfig}=require(${JSON.stringify(require.resolve('prisma/config'))});module.exports=defineConfig({engine:'classic',schema:${JSON.stringify(path.join(app,'prisma/schema.prisma'))},datasource:{url:process.env.DIRECT_URL}});`);
 const cli=path.join(frontend,'node_modules/prisma/build/index.js'),tsx=path.join(frontend,'node_modules/tsx/dist/cli.mjs');
 stage='generate';await run('prisma-generate',process.execPath,[cli,'generate','--config',config]);
 await run('prisma-validate',process.execPath,[cli,'validate','--config',config]);
 const migration='20261107000000_barber_schedule_breaks',pending=path.join(app,'prisma/migrations',migration),held=path.join(root,'new-migration');fs.renameSync(pending,held);
 stage='baseline';await run('migrations-baseline',process.execPath,[cli,'migrate','deploy','--config',config]);
 await run('baseline-seed',process.execPath,[tsx,'tests/availability-postgres.ts','--baseline']);
 fs.renameSync(held,pending);stage='migration';await run('migration-additive',process.execPath,[cli,'migrate','deploy','--config',config]);
 await run('migration-idempotent',process.execPath,[cli,'migrate','deploy','--config',config]);
 stage='tests';await run('postgres-concurrency',process.execPath,[tsx,'tests/availability-postgres.ts']);
 for(const file of ['availability-breaks.mjs','scheduling-regression.mjs','finance-regression.mjs','auth-resilience.mjs','subscription-billing-api.mjs'])await run(file,process.execPath,['tests/'+file]);
 await run('typecheck',process.execPath,[path.join(frontend,'node_modules/typescript/bin/tsc'),'--noEmit','--incremental','false']);
 await run('lint',process.execPath,[path.join(frontend,'node_modules/eslint/bin/eslint.js'),'.','--max-warnings=0']);
 if(!process.argv.includes('--skip-build')){stage='build';await run('build',process.execPath,[path.join(frontend,'node_modules/next/dist/bin/next'),'build']);}
 if(process.argv.includes('--serve')){
  stage='local-http';
  const fixture=JSON.parse(fs.readFileSync(env.AVAILABILITY_FIXTURE));
  // These fixture adapters exist only in the disposable copy, never in the application.
  write(path.join(app,'middleware.ts'),`import {NextResponse} from 'next/server';export function middleware(){return NextResponse.next();}`);
  write(path.join(app,'lib/server/internal-auth.ts'),`import {cookies} from 'next/headers';import {prisma} from '@/lib/prisma';export {getDashboardPath} from '@/lib/auth-routes';export function getInternalProfileByEmail(){return null;}export async function getAuthenticatedUser(){const role=(await cookies()).get('qa_role')?.value;if(!['ADMIN','BARBER','CLIENT'].includes(role??''))return null;const user=await prisma.user.findFirst({where:{role:role as 'ADMIN'|'BARBER'|'CLIENT'},include:{barber:true,client:true}});return user?{user,authUser:null}:null;}export async function getAuthenticatedUserFromToken(){return null;}`);
  write(path.join(app,'lib/server/auth.ts'),`import {cookies} from 'next/headers';import {prisma} from '@/lib/prisma';export async function getAuthenticatedClient(){if((await cookies()).get('qa_role')?.value!=='CLIENT')return null;const client=await prisma.client.findUnique({where:{id:${JSON.stringify(fixture.clientId)}},include:{user:true}});return client?{client,user:client.user}:null;}`);
  write(path.join(app,'app/qa-login/page.tsx'),`export default function Login(){return <main><h1>LOCAL FIXTURE AUTH</h1><form action="/qa-session" method="post"><label>Perfil<select name="role"><option>BARBER</option><option>ADMIN</option><option>CLIENT</option></select></label><button>Entrar no teste local</button></form></main>}`);
  write(path.join(app,'app/qa-session/route.ts'),`import {NextResponse} from 'next/server';export async function POST(req:Request){const f=await req.formData();const role=String(f.get('role'));const r=NextResponse.redirect(new URL(role==='ADMIN'?'/admin/disponibilidade':'/funcionario/disponibilidade',req.url),303);r.cookies.set('qa_role',role,{httpOnly:true,sameSite:'lax'});return r;}`);
  write(path.join(app,'app/qa-mobile/page.tsx'),`export default async function Mobile({searchParams}:{searchParams:Promise<{width?:string}>}){const p=await searchParams;const w=['375','390','430'].includes(p.width??'')?Number(p.width):390;return <main><h1>LOCAL viewport {w}</h1><iframe title="Mobile" src="/funcionario/disponibilidade" style={{width:w,height:844,border:'1px solid white'}}/></main>}`);
  next=spawn(process.execPath,[path.join(frontend,'node_modules/next/dist/bin/next'),'dev','-H','127.0.0.1','-p',String(httpPort)],{cwd:app,env,windowsHide:true,stdio:['ignore','pipe','pipe']});const log=fs.createWriteStream(path.join(root,'next.log'));next.stdout.pipe(log);next.stderr.pipe(log);
  const base=`http://localhost:${httpPort}`;let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/qa-login')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready);
  const endpoint=base+'/api/internal/availability',headers={'Content-Type':'application/json',Cookie:'qa_role=BARBER'};
  const days=Array.from({length:7},(_,weekDay)=>({weekDay,active:weekDay===1,startTime:'09:00',endTime:'18:00',breaks:weekDay===1?[{startTime:'12:00',endTime:'13:00',label:'Privado'}]:[]}));
  const put=(body,h=headers)=>fetch(endpoint,{method:'PUT',headers:h,body:JSON.stringify(body)});
  assert.equal((await put({barberId:fixture.barberId,days},{'Content-Type':'application/json'})).status,403);
  assert.equal((await put({barberId:fixture.adminBarberId,days})).status,403);
  assert.equal((await put({barberId:fixture.barberId,days})).status,200);
  const r=await fetch(base+`/api/appointments?barberId=${fixture.barberId}&serviceId=${fixture.serviceId}&date=2035-11-05`,{headers:{Cookie:'qa_role=CLIENT'}});assert.equal(r.status,200);const payload=await r.json();assert.ok(!payload.times.includes('12:00'));assert.ok(payload.times.includes('13:00'));assert.ok(!JSON.stringify(payload).includes('Privado'));
  const blocked=await fetch(base+'/api/appointments',{method:'POST',headers:{...headers,Cookie:'qa_role=CLIENT'},body:JSON.stringify({barberId:fixture.barberId,serviceIds:[fixture.serviceId],date:'2035-11-05',time:'12:00'})});assert.equal(blocked.status,409);
  checks.push('HTTP authorization, weekly save, client slots privacy and direct POST');
  write(path.join(root,'result.json'),JSON.stringify({root,base,checks,productionConnections:0},null,2));console.log(JSON.stringify({ready:true,root,base,checks,productionConnections:0}));
  await new Promise(resolve=>{const timer=setInterval(()=>{if(fs.existsSync(path.join(root,'STOP'))){clearInterval(timer);resolve();}},300);});
 }
 write(path.join(root,'result.json'),JSON.stringify({root,checks,productionConnections:0},null,2));console.log(JSON.stringify({root,status:'PASS',checks,productionConnections:0}));
}
main().catch(e=>{console.error(JSON.stringify({root,stage,status:'FAIL',reason:e.code==='ERR_ASSERTION'?e.message:'LOCAL_TEST_FAILED',productionConnections:0}));process.exitCode=1;}).finally(async()=>{if(next){next.kill();await new Promise(r=>{next.once('exit',r);setTimeout(r,2000);});}if(started)await pgctl(['-D',cluster,'-m','fast','-w','stop']);});
