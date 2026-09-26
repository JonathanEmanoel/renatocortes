import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Registra eventos operacionais com ator e entidade opcionais no cliente global.
 * A falha de escrita e absorvida: esta auditoria nao garante registro duravel
 * nem participa automaticamente da transacao da operacao que a chamou.
 * O chamador deve autorizar a operacao e selecionar metadados adequados.
 */
export async function createAuditLog(input: {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.auditLog
    .create({
      data: {
        userId: input.userId ?? undefined,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? undefined,
        metadata: input.metadata
      }
    })
    .catch(() => null);
}
