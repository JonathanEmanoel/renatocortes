import { PrismaClient } from "@prisma/client";

function assertDevelopmentDatabaseIsLocal() {
  if (process.env.NODE_ENV !== "development") return;
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL local nao configurada.");
  const url = new URL(value);
  const localHost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase());
  const localDatabase = url.pathname.replace(/^\//, "") === "renato_cortes_test";
  if (!localHost || !localDatabase) {
    throw new Error("Desenvolvimento bloqueado: DATABASE_URL deve usar o PostgreSQL local renato_cortes_test.");
  }
}

assertDevelopmentDatabaseIsLocal();

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
