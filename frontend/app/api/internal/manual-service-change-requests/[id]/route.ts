import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/server/audit";
import { restoreManualServiceFromSnapshot, type ManualServiceSnapshot } from "@/lib/server/manual-services";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const requestSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(500).optional()
});

/**
 * Confere o minimo estrutural de um snapshot salvo em JSON.
 * A validacao e propositalmente simples porque a restauracao completa ainda
 * depende de `restoreManualServiceFromSnapshot` gravar campos esperados.
 */
function isSnapshot(value: unknown): value is ManualServiceSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.barberId === "string" && typeof record.serviceDate === "string" && Array.isArray(record.items);
}

/**
 * Aprova ou recusa solicitacoes de alteracao/exclusao de atendimento manual.
 * Aprovar mantem a mudanca ja aplicada; recusar restaura o snapshot anterior
 * para retirar impacto financeiro indevido de uma edicao nao aceita.
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await getAuthenticatedUser();
    if (!session || (session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER")) {
      return NextResponse.json({ message: "Acesso nao autorizado." }, { status: 403 });
    }

    const { id } = await context.params;
    const payload = requestSchema.safeParse(await request.json());
    if (!payload.success) return NextResponse.json({ message: "Acao invalida." }, { status: 400 });

    const changeRequest = await prisma.manualServiceChangeRequest.findFirst({
      where: { id, status: "PENDING" },
      include: { manualService: true }
    });
    if (!changeRequest) return NextResponse.json({ message: "Solicitacao pendente nao encontrada." }, { status: 404 });

    if (payload.data.action === "approve") {
      await prisma.manualServiceChangeRequest.update({
        where: { id },
        data: {
          status: "APPROVED",
          decidedById: session.user.id,
          decidedAt: new Date(),
          reason: payload.data.reason
        }
      });
    } else {
      const previousSnapshot = changeRequest.previousSnapshot;
      if (!isSnapshot(previousSnapshot)) {
        return NextResponse.json({ message: "Snapshot anterior invalido para restauracao." }, { status: 500 });
      }
      await prisma.$transaction(async (tx) => {
        await restoreManualServiceFromSnapshot(tx, changeRequest.manualServiceId, previousSnapshot);
        await tx.manualServiceChangeRequest.update({
          where: { id },
          data: {
            status: "REJECTED",
            decidedById: session.user.id,
            decidedAt: new Date(),
            reason: payload.data.reason
          }
        });
      });
    }

    await createAuditLog({
      userId: session.user.id,
      action: payload.data.action === "approve" ? "MANUAL_SERVICE_CHANGE_APPROVE" : "MANUAL_SERVICE_CHANGE_REJECT",
      entity: "ManualServiceChangeRequest",
      entityId: id,
      metadata: { manualServiceId: changeRequest.manualServiceId, type: changeRequest.type }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel processar a solicitacao.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
