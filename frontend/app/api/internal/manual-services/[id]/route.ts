import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/server/audit";
import { SERVICE_COMMISSION_PERCENT } from "@/lib/server/finance-rules";
import {
  assertManualServiceOwner,
  canAdminManualServices,
  pendingManualServiceRequest,
  replaceManualServiceItems,
  snapshotManualService
} from "@/lib/server/manual-services";
import { startOfSaoPauloDay } from "@/lib/server/date-periods";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const itemSchema = z.object({
  serviceId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1)
});

const updateSchema = z.object({
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  customerName: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  subscriptionId: z.string().uuid().optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
  items: z.array(itemSchema).min(1),
  highQuantityConfirmed: z.boolean().optional()
});

function parseAuditMetadata(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, Prisma.JsonValue>;
}

async function findLegacyManualAudit(tx: Prisma.TransactionClient, commission: { barberId: string; createdAt: Date }) {
  const lower = new Date(commission.createdAt);
  lower.setMinutes(lower.getMinutes() - 10);
  const upper = new Date(commission.createdAt);
  upper.setMinutes(upper.getMinutes() + 10);
  const audits = await tx.auditLog.findMany({
    where: { action: "MANUAL_SERVICE_CREATE", createdAt: { gte: lower, lte: upper } },
    orderBy: { createdAt: "asc" }
  });
  return audits.find((audit) => {
    const metadata = parseAuditMetadata(audit.metadata);
    return metadata.barberId === commission.barberId && typeof metadata.manualServiceId !== "string";
  }) ?? null;
}

async function updateLegacyManualService({
  legacyId,
  role,
  sessionBarberId,
  userId,
  payload
}: {
  legacyId: string;
  role: string;
  sessionBarberId?: string;
  userId: string;
  payload: z.infer<typeof updateSchema>;
}) {
  const hasHighQuantity = payload.items.some((item) => item.quantity > 50);
  if (hasHighQuantity && !payload.highQuantityConfirmed) {
    return NextResponse.json({ message: "Confirme a quantidade alta antes de salvar." }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const commission = await tx.employeeCommission.findFirst({
      where: {
        id: legacyId,
        appointmentId: null,
        saleId: null,
        ...(canAdminManualServices(role) ? {} : { barberId: sessionBarberId })
      }
    });
    if (!commission) throw new Error("Atendimento legado nao encontrado ou fora da sua permissao.");

    const audit = await findLegacyManualAudit(tx, commission);
    if (!audit) throw new Error("Registro legado sem audit log vinculado. Edicao bloqueada para evitar inconsistencia.");

    const services = await tx.service.findMany({
      where: { id: { in: payload.items.map((item) => item.serviceId) }, active: true, deletedAt: null }
    });
    if (services.length !== new Set(payload.items.map((item) => item.serviceId)).size) {
      throw new Error("Um ou mais servicos estao indisponiveis.");
    }
    const serviceById = new Map(services.map((service) => [service.id, service]));
    const gross = payload.items.reduce((sum, item) => sum + Number(serviceById.get(item.serviceId)?.price ?? 0) * item.quantity, 0);
    const serviceDate = startOfSaoPauloDay(payload.serviceDate);
    const metadata = parseAuditMetadata(audit.metadata);
    const items = payload.items.map((item) => ({ serviceId: item.serviceId, quantity: item.quantity }));

    await tx.employeeCommission.update({
      where: { id: commission.id },
      data: {
        amount: gross * (SERVICE_COMMISSION_PERCENT / 100),
        percentage: SERVICE_COMMISSION_PERCENT,
        createdAt: serviceDate
      }
    });
    await tx.auditLog.update({
      where: { id: audit.id },
      data: {
        createdAt: serviceDate,
        metadata: {
          ...metadata,
          barberId: commission.barberId,
          customerName: payload.customerName?.trim() || null,
          serviceIds: payload.items.map((item) => item.serviceId),
          items,
          serviceDate: serviceDate.toISOString()
        }
      }
    });
    if (audit.entityId) {
      await tx.financialTransaction.update({
        where: { id: audit.entityId },
        data: {
          amount: gross,
          description: `Atendimento avulso legado: ${services.map((service) => service.name).join(" + ")}${payload.customerName ? ` - ${payload.customerName}` : ""}`,
          createdAt: serviceDate,
          deletedAt: null
        }
      }).catch(() => null);
    }
    return { auditId: audit.id, gross };
  });

  await createAuditLog({
    userId,
    action: "MANUAL_SERVICE_LEGACY_UPDATE",
    entity: "EmployeeCommission",
    entityId: legacyId,
    metadata: result
  });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await getAuthenticatedUser();
    if (!session || session.user.role === "CLIENT") {
      return NextResponse.json({ message: "Acesso nao autorizado." }, { status: 403 });
    }

    const { id } = await context.params;
    const payload = updateSchema.safeParse(await request.json());
    if (!payload.success) return NextResponse.json({ message: "Confira os dados do atendimento." }, { status: 400 });

    if (id.startsWith("legacy-")) {
      return updateLegacyManualService({
        legacyId: id.replace("legacy-", ""),
        role: session.user.role,
        sessionBarberId: session.user.barber?.id,
        userId: session.user.id,
        payload: payload.data
      });
    }

    const manualService = await assertManualServiceOwner({
      role: session.user.role,
      sessionBarberId: session.user.barber?.id,
      manualServiceId: id
    });
    if (pendingManualServiceRequest(manualService)) {
      return NextResponse.json({ message: "Ja existe uma alteracao pendente para este atendimento." }, { status: 409 });
    }

    const hasHighQuantity = !payload.data.subscriptionId && payload.data.items.some((item) => item.quantity > 50);
    if (hasHighQuantity && !payload.data.highQuantityConfirmed) {
      return NextResponse.json({ message: "Confirme a quantidade alta antes de salvar." }, { status: 400 });
    }

    const previousSnapshot = snapshotManualService(manualService);
    const deletedAt = manualService.deletedAt ?? null;

    await prisma.$transaction(async (tx) => {
      await replaceManualServiceItems(
        tx,
        id,
        {
          barberId: manualService.barberId,
          serviceDate: startOfSaoPauloDay(payload.data.serviceDate),
          customerName: payload.data.customerName,
          clientId: payload.data.clientId ?? null,
          subscriptionId: payload.data.subscriptionId ?? null,
          notes: payload.data.notes,
          items: payload.data.items
        },
        deletedAt
      );

      const updated = await tx.manualService.findUniqueOrThrow({
        where: { id },
        include: {
          barber: { include: { user: true } },
          client: { include: { user: true } },
          subscription: { include: { subscriptionPlan: { include: { services: true } } } },
          items: { include: { service: true } },
          changeRequests: true
        }
      });

      if (!canAdminManualServices(session.user.role)) {
        await tx.manualServiceChangeRequest.create({
          data: {
            manualServiceId: id,
            requestedById: session.user.id,
            type: "UPDATE",
            previousSnapshot,
            proposedSnapshot: snapshotManualService(updated)
          }
        });
      }
    });

    await createAuditLog({
      userId: session.user.id,
      action: "MANUAL_SERVICE_UPDATE",
      entity: "ManualService",
      entityId: id,
      metadata: { requiresApproval: !canAdminManualServices(session.user.role) }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel alterar o atendimento.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const session = await getAuthenticatedUser();
    if (!session || session.user.role === "CLIENT") {
      return NextResponse.json({ message: "Acesso nao autorizado." }, { status: 403 });
    }

    const { id } = await context.params;
    if (id.startsWith("legacy-")) {
      const legacyId = id.replace("legacy-", "");
      await prisma.$transaction(async (tx) => {
        const commission = await tx.employeeCommission.findFirst({
          where: {
            id: legacyId,
            appointmentId: null,
            saleId: null,
            ...(canAdminManualServices(session.user.role) ? {} : { barberId: session.user.barber?.id })
          }
        });
        if (!commission) throw new Error("Atendimento legado nao encontrado ou fora da sua permissao.");
        const audit = await findLegacyManualAudit(tx, commission);
        if (audit?.entityId) await tx.financialTransaction.updateMany({ where: { id: audit.entityId }, data: { deletedAt: new Date() } });
        if (audit) {
          await tx.auditLog.update({
            where: { id: audit.id },
            data: { metadata: { ...parseAuditMetadata(audit.metadata), maintenanceHiddenAt: new Date().toISOString() } }
          });
        }
        await tx.employeeCommission.delete({ where: { id: commission.id } });
      });

      await createAuditLog({
        userId: session.user.id,
        action: "MANUAL_SERVICE_LEGACY_DELETE",
        entity: "EmployeeCommission",
        entityId: legacyId,
        metadata: { mode: "hide" }
      });
      return NextResponse.json({ ok: true });
    }

    const manualService = await assertManualServiceOwner({
      role: session.user.role,
      sessionBarberId: session.user.barber?.id,
      manualServiceId: id
    });
    if (pendingManualServiceRequest(manualService)) {
      return NextResponse.json({ message: "Ja existe uma alteracao pendente para este atendimento." }, { status: 409 });
    }

    const previousSnapshot = snapshotManualService(manualService);
    await prisma.$transaction(async (tx) => {
      await tx.manualService.update({ where: { id }, data: { deletedAt: new Date() } });
      if (!canAdminManualServices(session.user.role)) {
        await tx.manualServiceChangeRequest.create({
          data: {
            manualServiceId: id,
            requestedById: session.user.id,
            type: "DELETE",
            previousSnapshot,
            proposedSnapshot: Prisma.JsonNull
          }
        });
      }
    });

    await createAuditLog({
      userId: session.user.id,
      action: "MANUAL_SERVICE_DELETE",
      entity: "ManualService",
      entityId: id,
      metadata: { requiresApproval: !canAdminManualServices(session.user.role) }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel excluir o atendimento.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
