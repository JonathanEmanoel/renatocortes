import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const requireDependency = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ts = requireDependency("typescript");
let sessionResult = null;
let sessionError = null;
const cache = new Map();

function load(relative) {
  if (cache.has(relative)) return cache.get(relative);
  const filename = path.join(root, relative);
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const loaded = { exports: {} };
  const customRequire = (name) => {
    if (name === "next/server") {
      return { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };
    }
    if (name === "@/lib/server/internal-auth") {
      const resolve = async () => {
        if (sessionError) throw sessionError;
        return sessionResult;
      };
      return { getAuthenticatedUser: resolve, getAuthenticatedUserFromToken: resolve };
    }
    if (name.startsWith("@/")) return load(`${name.slice(2)}.ts`);
    return requireDependency(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename })(customRequire, loaded, loaded.exports);
  cache.set(relative, loaded.exports);
  return loaded.exports;
}

const errors = load("lib/server/database-errors.ts");
const route = load("app/api/auth/me/route.ts");

assert.equal(errors.getDatabaseFailureKind({ code: "P1001" }), "unavailable");
assert.equal(errors.getDatabaseFailureKind({ code: "P2022" }), "schema");
assert.equal(errors.getDatabaseFailureKind(new Error("senha invalida")), null);

sessionError = { code: "P1001", name: "PrismaClientInitializationError" };
let response = await route.GET(new Request("http://test/api/auth/me"));
assert.equal(response.status, 503);
assert.match(response.body.message, /sessao foi preservada/i);

sessionError = null;
sessionResult = null;
response = await route.GET(new Request("http://test/api/auth/me"));
assert.equal(response.status, 401);

sessionResult = { user: { id: "1", name: "Renato", email: "renato@example.com", role: "ADMIN", barber: { id: "b" } } };
response = await route.GET(new Request("http://test/api/auth/me"));
assert.equal(response.status, 200);
assert.equal(response.body.role, "ADMIN");
assert.equal(response.body.hasBarber, true);

console.log(JSON.stringify({ pass: 8, fail: 0 }, null, 2));
