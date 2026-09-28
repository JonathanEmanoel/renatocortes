import { PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV === "development") {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL local nao configurada.");
  const url = new URL(value);
  const localHost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase());
  const localDatabase = url.pathname.replace(/^\//, "") === "renato_cortes_test";
  if (!localHost || !localDatabase) {
    throw new Error("Backend local bloqueado: use exclusivamente o banco renato_cortes_test em localhost.");
  }
}

// Cliente Prisma compartilhado pela API Express.
export const prisma = new PrismaClient();
