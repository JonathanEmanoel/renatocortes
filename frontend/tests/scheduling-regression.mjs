import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const requireDependency = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ts = requireDependency('typescript');
const RealDate = Date;
let instant = '2026-09-16T09:00:00-03:00';
class Clock extends RealDate {
  constructor(...args) { super(...(args.length ? args : [instant])); }
  static now() { return +new RealDate(instant); }
}
let windows, busy, duration, writes, authenticated, owned, transactionQueue = Promise.resolve();
const barberId = '00000000-0000-4000-8000-000000000001';
const serviceId = '00000000-0000-4000-8000-000000000002';
const service = () => ({ id: serviceId, duration, price: 30, name: 'Corte' });
const db = {
  barber: { findFirst: async () => ({ id: barberId, user: { name: 'Barbeiro', phone: '819997207222' } }) },
  service: { findMany: async () => [service()] },
  barberAvailability: { findMany: async () => windows },
  appointment: {
    findMany: async ({ where }) => busy.filter((item) => !where.id?.not || item.id !== where.id.not),
    findFirst: async ({ where }) => owned?.id === where.id && where.clientId === 'client' ? owned : null,
    update: async ({ data }) => { writes++; return data; },
    create: async ({ data }) => { writes++; const created={ ...data, id: `created-${writes}`, barber: { user: { name: 'Barbeiro' } }, service: service(), services: [{ service: service(), price: 30, duration }] };busy.push({id:created.id,dataHora:data.dataHora,service:service(),services:[{duration}]});return created; }
  },
  $queryRaw: async () => [{ locked: 1 }],
  $transaction: (fn) => { const next=transactionQueue.then(()=>fn(db));transactionQueue=next.catch(()=>{});return next; }
};
const cache = new Map();
function load(relative) {
  if (cache.has(relative)) return cache.get(relative);
  const filename = path.join(root, relative);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loaded = { exports: {} };
  function resolve(name) {
    if (name === '@/lib/prisma') return { prisma: db };
    if (name === '@/lib/server/auth') return { getAuthenticatedClient: async () => authenticated ? { client: { id: 'client' }, user: { name: 'Cliente' } } : null };
    if (name === '@/lib/google-calendar') return { buildCalendarEvent: () => ({}), buildGoogleCalendarAuthUrl: () => '' };
    if (name === '@/lib/whatsapp') return { buildWhatsAppUrl: () => '' };
    if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
    return requireDependency(name);
  }
  vm.runInNewContext('(function(require,module,exports){' + output + '\n})', { Date: Clock, Intl, URL, console }, { filename })(resolve, loaded, loaded.exports);
  cache.set(relative, loaded.exports);
  return loaded.exports;
}
const rule = load('lib/client-scheduling.ts');
const api = load('app/api/appointments/route.ts');
const results = [];
function reset(time = '09:00') {
  instant = `2026-09-16T${time}:00-03:00`; duration = 60; writes = 0; authenticated = true;
  windows = [{ startTime: '08:00', endTime: '22:00' }]; busy = []; owned = null;
  transactionQueue = Promise.resolve();
}
async function check(name, fn) {
  try { reset(); await fn(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL', detail: error.message }); }
}
async function slots(date = '2026-09-16') {
  return api.GET(new Request(`http://test/api/appointments?barberId=${barberId}&serviceId=${serviceId}&date=${date}`));
}
async function post(time, date = '2026-09-16') {
  return api.POST(new Request('http://test/api/appointments', { method: 'POST', body: JSON.stringify({ barberId, serviceIds: [serviceId], date, time }) }));
}
for (const [now, denied, allowed] of [['09:00', ['10:00', '11:30', '18:00'], ['12:00', '15:00']], ['14:00', ['15:00', '17:00'], ['18:00', '20:00']], ['19:00', ['20:00', '21:00'], []]]) {
  await check(`API e lista frontend: agora ${now}`, async () => {
    reset(now); const result = await slots(); assert.equal(result.status, 200);
    for (const time of denied) { assert.ok(!result.body.times.includes(time)); assert.equal((await post(time)).status, 409); }
    assert.equal(writes, 0);
    for (const time of allowed) { assert.ok(result.body.times.includes(time)); assert.equal((await post(time)).status, 200); }
  });
}
await check('Sem expediente noturno: lista vazia e mensagem', async () => {
  reset('14:00'); windows = [{ startTime: '08:00', endTime: '18:00' }]; const result = await slots();
  assert.equal(result.body.times.length, 0); assert.match(result.body.message, /amanha/); assert.equal((await post('18:00')).status, 409);
});
await check('Noite bloqueia hoje, amanha 08h preservado', async () => {
  reset('19:00'); assert.match((await slots()).body.message, /encerrados/);
  assert.ok((await slots('2026-09-17')).body.times.includes('08:00')); assert.equal((await post('08:00', '2026-09-17')).status, 200);
});
for (const [now, allowed, denied] of [['11:59', '12:00', '18:00'], ['12:00', '18:00', '17:00'], ['17:59', '18:00', '17:59'], ['18:00', null, '21:00']]) {
  await check(`Limite ${now}`, async () => {
    reset(now); const result = await slots();
    assert.equal((await post(denied)).status, 409); assert.ok(!result.body.times.includes(denied));
    if (allowed) { assert.ok(result.body.times.includes(allowed)); assert.equal((await post(allowed)).status, 200); }
    else assert.equal(result.body.times.length, 0);
  });
}
await check('Duracao 60min: 18h/19h validos, 19h30 invalido', async () => {
  reset('14:00'); windows = [{ startTime: '18:00', endTime: '20:00' }];
  assert.deepEqual(Array.from((await slots()).body.times), ['18:00', '19:00']);
  assert.equal((await post('19:00')).status, 200); assert.equal((await post('19:30')).status, 409);
});
await check('Expediente 19h: ultimo slot de 60min e 18h', async () => {
  reset('14:00'); windows = [{ startTime: '08:00', endTime: '19:00' }];
  assert.ok((await slots()).body.times.includes('18:00')); assert.equal((await post('18:00')).status, 200);
});
await check('Intervalo real e multiplas faixas', async () => {
  windows = [{ startTime: '08:00', endTime: '12:00' }, { startTime: '13:00', endTime: '18:00' }];
  assert.ok(!(await slots()).body.times.includes('12:00')); assert.equal((await post('12:00')).status, 409);
  assert.equal((await post('13:00')).status, 200);
});
await check('Conflito no turno permitido e intervalo adjacente', async () => {
  busy = [{ dataHora: new RealDate('2026-09-16T15:00:00-03:00'), service: { duration: 60 }, services: [] }];
  assert.ok(!(await slots()).body.times.includes('15:00')); assert.equal((await post('15:00')).status, 409);
  assert.equal((await post('14:00')).status, 200); assert.equal((await post('16:00')).status, 200);
});
await check('Duas criacoes simultaneas para o mesmo horario geram uma unica reserva', async () => {
  const outcomes = await Promise.all([post('15:00'), post('15:00')]);
  assert.deepEqual(outcomes.map((item) => item.status).sort(), [200, 409]);
  assert.equal(busy.filter((item) => item.dataHora.toISOString() === new RealDate('2026-09-16T15:00:00-03:00').toISOString()).length, 1);
});
await check('Timezone UTC e meia-noite brasileira', async () => {
  instant = '2026-09-16T15:00:00Z'; assert.equal((await post('15:00')).status, 409); assert.equal((await post('18:00')).status, 200);
  instant = '2026-09-17T01:00:00Z'; assert.equal((await post('22:00')).status, 409); assert.equal((await post('08:00', '2026-09-17')).status, 200);
  instant = '2026-09-17T03:00:00Z'; assert.ok(!(await slots('2026-09-17')).body.times.includes('08:00'));
});
await check('Datas/horas invalidas e passado', async () => {
  for (const [date, time] of [['2026-09-15', '15:00'], ['2026-02-31', '15:00'], ['2026-09-16', '25:00'], ['2026-09-16', '12:60']]) assert.equal((await post(time, date)).status, 409);
});
await check('Folga e endpoint nao autenticado', async () => {
  windows = []; assert.equal((await slots()).body.times.length, 0); assert.equal((await post('15:00')).status, 409);
  authenticated = false; assert.equal((await slots()).status, 401); assert.equal((await post('15:00')).status, 401);
});
await check('Reagendamento: propriedade, exclusao propria e turno na API PATCH', async () => {
  owned = { id: '00000000-0000-4000-8000-000000000003', barberId, serviceId, services: [], service: service() };
  busy = [{ id: owned.id, dataHora: new RealDate('2026-09-16T15:00:00-03:00'), service: service(), services: [] }];
  const result = await api.GET(new Request(`http://test/api/appointments?appointmentId=${owned.id}&date=2026-09-16`));
  assert.ok(result.body.times.includes('15:00'));
  assert.equal((await api.GET(new Request('http://test/api/appointments?appointmentId=00000000-0000-4000-8000-000000000004&date=2026-09-16'))).status, 404);
  for (const [time, expected] of [['10:00', 409], ['15:00', 200]]) assert.equal((await api.PATCH(new Request('http://test/api/appointments', { method: 'PATCH', body: JSON.stringify({ action: 'reschedule', appointmentId: owned.id, date: '2026-09-16', time }) }))).status, expected);
});
await check('Duracoes 35min preservam fim de expediente', () => {
  const times = rule.clientAvailableTimes('2026-09-16', 35, [{ start: 13 * 60 + 10, end: 19 * 60 }], [], new Clock());
  assert.ok(times.includes('17:10')); assert.ok(!times.includes('18:10'));
  instant = '2026-09-16T14:00:00-03:00';
  assert.ok(rule.clientAvailableTimes('2026-09-16', 35, [{ start: 13 * 60 + 10, end: 19 * 60 }], [], new Clock()).includes('18:10'));
});
console.log(JSON.stringify({ results, pass: results.filter((item) => item.status === 'PASS').length, fail: results.filter((item) => item.status === 'FAIL').length }, null, 2));
if (results.some((item) => item.status === 'FAIL')) process.exitCode = 1;
