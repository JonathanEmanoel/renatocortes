import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
let role = 'ADMIN'; let calls = 0; let lastInput;
const code = ts.transpileModule(fs.readFileSync(new URL('../app/api/internal/subscription-billing/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const loadedModule = { exports: {} };
const resolve = name => {
  if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };
  if (name === '@/lib/server/internal-auth') return { getAuthenticatedUser: async () => role ? { user: { id: 'trusted-admin-id', role } } : null };
  if (name === '@/lib/server/subscription-billing') return {
    previewSubscriptionBilling: async () => ({ operationKey: 'a'.repeat(64), nextDueDate: '2026-11-01' }),
    confirmSubscriptionPayment: async input => { calls++; lastInput = input; return {}; },
    scheduleSubscriptionDueDay: async input => { calls++; lastInput = input; return {}; }
  };
  return require(name);
};
vm.runInThisContext(`(function(require,module,exports){${code}\n})`)(resolve, loadedModule, loadedModule.exports);
const route = loadedModule.exports;
const id = '00000000-0000-4000-8000-000000000001';
const request = body => new Request('http://localhost/api/internal/subscription-billing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const base = { subscriptionId: id, operationKey: 'a'.repeat(64) };
const tests = [];
for (const actor of [null, 'CLIENT', 'BARBER', 'DEVELOPER', 'EMPLOYEE']) {
  role = actor;
  assert.equal((await route.GET(new Request(`http://localhost/api/internal/subscription-billing?subscriptionId=${id}`))).status, 403);
  assert.equal((await route.POST(request({ ...base, action: 'schedule', newDay: 10 }))).status, 403);
  tests.push(`GET/POST bloqueados: ${actor ?? 'anonimo'}`);
}
role = 'ADMIN';
assert.equal((await route.GET(new Request(`http://localhost/api/internal/subscription-billing?subscriptionId=${id}`))).status, 200);
tests.push('ADMIN pode obter previa server-side');
for (const field of ['nextDueDate', 'competence', 'paidUntil', 'cycleStart', 'cycleEnd', 'userId']) {
  assert.equal((await route.POST(request({ ...base, action: 'schedule', newDay: 10, [field]: 'adulterado' }))).status, 400);
}
assert.equal(calls, 0); tests.push('Campos de ciclo/ator adulterados rejeitados sem chamar dominio');
for (const day of [0, 32, 1.5]) assert.equal((await route.POST(request({ ...base, action: 'schedule', newDay: day }))).status, 400);
tests.push('Dias invalidos rejeitados');
assert.equal((await route.POST(request({ ...base, action: 'schedule', newDay: 31 }))).status, 200);
assert.equal(lastInput.userId, 'trusted-admin-id'); assert.equal(lastInput.newDay, 31);
tests.push('Ator fornecido pela sessao, nao pelo request');
assert.equal((await route.POST(request({ ...base, action: 'confirm', paidDate: '2026-10-13', method: 'PIX', acknowledgeLegacy: true }))).status, 200);
assert.equal(lastInput.userId, 'trusted-admin-id'); tests.push('Confirmacao encaminha intencao ao dominio protegido');
console.log(JSON.stringify({ pass: tests.length, fail: 0, tests }, null, 2));
