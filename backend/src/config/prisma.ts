import { PrismaClient } from "@prisma/client";

// Cliente Prisma compartilhado pela API Express.
export const prisma = new PrismaClient();
