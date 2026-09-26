import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const requireDependency = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = requireDependency(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ts = requireDependency('typescript');
// Browser real, componente real; somente apresentacao externa e API sao isoladas.
const modules = new Map();
function pack(filename) {
  if (modules.has(filename)) return filename;
  modules.set(filename, '');
  const source = fs.readFileSync(filename, 'utf8');
  let code = /\.tsx?$/.test(filename) ? ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText : source;
  code = code.replaceAll('process.env.NODE_ENV', '"production"');
  code = code.replace(/require\(["']([^"']+)["']\)/g, (_, name) => {
    if (['@/lib/use-client-slots', '@/lib/client-scheduling', '@/lib/server/date-periods'].includes(name)) return `require(${JSON.stringify(pack(path.join(root, name.slice(2) + '.ts')))})`;
    if (name.startsWith('@/') || name === 'lucide-react') return `require("ui-stubs")`;
    const resolved = requireDependency.resolve(name, { paths: [path.dirname(filename)] });
    pack(resolved); return `require(${JSON.stringify(resolved)})`;
  });
  modules.set(filename, code); return filename;
}
const formId = pack(path.join(root, 'app/cliente/agendamento/scheduling-form.tsx'));
const reactId = pack(requireDependency.resolve('react'));
const domId = pack(requireDependency.resolve('react-dom/client'));
modules.set('ui-stubs', `const React=require(${JSON.stringify(reactId)});
exports.ClientShell=({children})=>React.createElement('main',null,children);
exports.SectionTitle=({title})=>React.createElement('h2',null,title);
exports.ServiceCard=({service,onClick})=>React.createElement('button',{onClick},service.name);
exports.BarberCard=({barber,onClick})=>React.createElement('button',{onClick},barber.name);
exports.Button=({children,variant,...props})=>React.createElement('button',props,children);
exports.formatCurrency=(n)=>String(n);exports.cn=(...a)=>a.filter(Boolean).join(' ');
for(const name of ['ArrowLeft','CalendarDays','CheckCircle2','Clock','Scissors'])exports[name]=()=>null;`);
const props = { services: [{ id: 's', name: 'Corte teste', durationMinutes: 60, priceValue: 30 }], barbers: [{ id: 'b', name: 'Barbeiro teste' }], dates: [{ value: '2026-09-16', label: 'QUA 16/09' }, { value: '2026-09-17', label: 'QUI 17/09' }], availabilityByBarber: { b: [{ weekDay: 3, startTime: '08:00', endTime: '22:00' }, { weekDay: 4, startTime: '08:00', endTime: '22:00' }] } };
const bundle = `const registry={${[...modules].map(([id, source]) => `${JSON.stringify(id)}:function(require,module,exports){${source}\n}`).join(',')}}; const cache={}; function require(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;registry[id](require,m,m.exports);return m.exports;} const React=require(${JSON.stringify(reactId)});require(${JSON.stringify(domId)}).createRoot(document.getElementById('root')).render(React.createElement(require(${JSON.stringify(formId)}).SchedulingForm,${JSON.stringify(props)}));`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    const page = await browser.newPage({ viewport });
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    let response = { times: ['12:00', '15:00'], message: 'Somente tarde', validForMs: 15000 };
    let fail = false;
    await page.route('http://scheduling.test/**', async (route) => {
      if (route.request().url().includes('/api/appointments')) await route.fulfill({ status: fail ? 500 : 200, contentType: 'application/json', body: JSON.stringify(fail ? { message: 'Falha de consulta' } : response) });
      else await route.fulfill({ contentType: 'text/html', body: '<html><body><div id="root"></div></body></html>' });
    });
    await page.goto('http://scheduling.test'); await page.addScriptTag({ content: bundle });
    await page.getByRole('button', { name: 'Corte teste', exact: true }).click();
    await page.getByRole('button', { name: 'Horario', exact: true }).click();
    await page.getByRole('button', { name: '12:00', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '10:00', exact: true }).count(), 0);
    response = { times: ['18:00', '19:00'], message: 'Somente noite', validForMs: 15000 };
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByRole('button', { name: '18:00', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '12:00', exact: true }).count(), 0);
    response = { times: [], message: 'Os agendamentos para hoje foram encerrados.', validForMs: 15000 };
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByText(response.message).waitFor();
    assert.equal(await page.getByRole('button', { name: '18:00', exact: true }).count(), 0);
    fail = true; await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByText('Falha de consulta').waitFor();
    assert.equal(await page.getByRole('button', { name: '19:00', exact: true }).count(), 0);
    fail = false; response = { times: ['08:00'], message: '', validForMs: 15000 };
    await page.getByRole('button', { name: 'Data', exact: true }).click();
    await page.getByRole('button', { name: 'QUI 17/09', exact: true }).click();
    await page.getByRole('button', { name: 'Horario', exact: true }).click();
    await page.getByRole('button', { name: '08:00', exact: true }).waitFor();
    response = { times: ['08:00'], message: '', validForMs: 500 };
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByRole('button', { name: '08:00', exact: true }).waitFor();
    response = { times: [], message: 'Turno encerrado pelo relogio do servidor.', validForMs: 15000 };
    await page.getByText(response.message).waitFor();
    assert.equal(await page.getByRole('button', { name: '08:00', exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log(`PASS frontend ${viewport.width}px: tarde/noite/encerrado/falha/amanha; sem slots antigos ou erros React`);
    await page.close();
  }
} finally { await browser.close(); }
