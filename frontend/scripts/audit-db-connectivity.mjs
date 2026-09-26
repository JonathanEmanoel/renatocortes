import "dotenv/config";
import { performance } from "node:perf_hooks";
import { PrismaClient } from "@prisma/client";

async function probe(label, datasourceUrl, attempts = 8) {
  const results = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const startedAt = performance.now();
    const client = new PrismaClient({ datasourceUrl });
    try {
      await client.$queryRaw`SELECT 1 AS ok`;
      results.push({ attempt, ok: true, milliseconds: Math.round(performance.now() - startedAt) });
    } catch (error) {
      results.push({
        attempt,
        ok: false,
        milliseconds: Math.round(performance.now() - startedAt),
        code: typeof error?.code === "string" ? error.code : error?.name ?? "UNKNOWN"
      });
    } finally {
      await client.$disconnect().catch(() => undefined);
    }
  }
  return { label, passed: results.filter((item) => item.ok).length, failed: results.filter((item) => !item.ok).length, results };
}

if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) {
  throw new Error("DATABASE_URL e DIRECT_URL precisam estar configuradas.");
}

const output = [];
output.push(await probe("DATABASE_URL_POOLER", process.env.DATABASE_URL));
output.push(await probe("DIRECT_URL_SESSION", process.env.DIRECT_URL));
console.log(JSON.stringify(output, null, 2));
if (output.some((item) => item.failed > 0)) process.exitCode = 1;
