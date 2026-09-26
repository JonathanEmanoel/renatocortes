import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readEnvValue(file, key) {
  if (!fs.existsSync(file)) return null;
  const line = fs.readFileSync(file, "utf8").split(/\r?\n/).find((item) => item.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim().replace(/^['"]|['"]$/g, "") : null;
}

function identity(value) {
  const url = new URL(value);
  return `${url.hostname.toLowerCase()}:${url.port || "5432"}/${url.pathname.replace(/^\//, "")}/${decodeURIComponent(url.username)}`;
}

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error("TEST_DATABASE_URL e obrigatoria para testes PostgreSQL isolados.");

const expectedDatabase = "renato_cortes_test";
const explicitConfirmation = process.env.CONFIRM_LOCAL_TEST_DATABASE;
if (explicitConfirmation !== expectedDatabase) {
  throw new Error(`Defina CONFIRM_LOCAL_TEST_DATABASE=${expectedDatabase} para autorizar o banco descartavel.`);
}

const productionCandidates = [
  readEnvValue(path.join(root, ".env"), "DATABASE_URL"),
  readEnvValue(path.join(root, ".env.local"), "DATABASE_URL"),
  readEnvValue(path.join(root, ".env"), "DIRECT_URL"),
  readEnvValue(path.join(root, ".env.local"), "DIRECT_URL")
].filter(Boolean);

const testIdentity = identity(testUrl);
if (productionCandidates.some((candidate) => identity(candidate) === testIdentity)) {
  throw new Error("TEST_DATABASE_URL aponta para o mesmo banco configurado pela aplicacao. Execucao bloqueada.");
}

const parsedTestUrl = new URL(testUrl);
const host = parsedTestUrl.hostname.toLowerCase();
const database = parsedTestUrl.pathname.replace(/^\//, "");

if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  throw new Error("Banco de teste remoto bloqueado. Use exclusivamente localhost ou 127.0.0.1.");
}

if (database !== expectedDatabase) {
  throw new Error(`Banco destrutivo bloqueado: esperado ${expectedDatabase}, recebido ${database || "vazio"}.`);
}

console.log(JSON.stringify({ safe: true, host, database }));
