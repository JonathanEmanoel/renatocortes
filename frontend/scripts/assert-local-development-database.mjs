import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedDatabase = "renato_cortes_test";
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

function readEnvValue(file, key) {
  if (!fs.existsSync(file)) return null;
  const line = fs.readFileSync(file, "utf8").split(/\r?\n/).find((item) => item.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim().replace(/^['"]|['"]$/g, "") : null;
}

function configuredValue(key) {
  return process.env[key]
    || readEnvValue(path.join(root, ".env.local"), key)
    || readEnvValue(path.join(root, ".env"), key);
}

function assertLocalUrl(key) {
  const value = configuredValue(key);
  if (!value) throw new Error(`${key} nao configurada. Execucao bloqueada.`);

  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  const database = url.pathname.replace(/^\//, "");
  if (!localHosts.has(host) || database !== expectedDatabase) {
    throw new Error(`${key} remota ou fora de ${expectedDatabase}. Execucao local bloqueada.`);
  }
  return { host, database };
}

const database = assertLocalUrl("DATABASE_URL");
assertLocalUrl("DIRECT_URL");
console.log(JSON.stringify({ safe: true, host: database.host, database: database.database }));
