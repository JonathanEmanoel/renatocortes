import { Prisma, type ManualServiceChangeStatus, type ManualServiceChangeType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SERVICE_COMMISSION_PERCENT } from "@/lib/server/finance-rules";
import { endOfSaoPauloDay, isValidDateInput, startOfSaoPauloDay, todayDateInput } from "@/lib/server/date-periods";

export type ManualServiceInputItem = {
  serviceId: string;
  quantity: number;
};

export type ManualServiceInput = {
  barberId: string;
  serviceDate: Date;
  customerName?: string | null;
  clientId?: string | null;
  subscriptionId?: string | null;
  notes?: string | null;
  items: ManualServiceInputItem[];
};

type ManualServiceWithDetails = Prisma.ManualServiceGetPayload<{
  include: {
    barber: { include: { user: true } };
    client: { include: { user: true } };
    subscription: { include: { subscriptionPlan: { include: { services: true } } } };
    items: { include: { service: true } };
    changeRequests: true;
  };
}>;

export type ManualServiceSnapshot = {
  barberId: string;
  clientId: string | null;
  subscriptionId: string | null;
  customerName: string | null;
  serviceDate: string;
  notes: string | null;
  deletedAt: string | null;
  items: {
    serviceId: string;
    quantity: number;
    unitPrice: string;
    chargedUnitPrice: string;
    duration: number;
    coveredBySubscription: boolean;
    subscriptionPlanName: string | null;
  }[];
};

export function isInternalRole(role: string) {
  return role === "BARBER" || role === "ADMIN" || role === "DEVELOPER";
}

export function canAdminManualServices(role: string) {
  return role === "ADMIN" || role === "DEVELOPER";
}

export function assertPastOrToday(date: Date) {
  const todayEnd = endOfSaoPauloDay(todayDateInput());
  if (Number.isNaN(date.getTime()) || date > todayEnd) {
    throw new Error("Informe uma data de atendimento valida, sem datas futuras.");
  }
}

export function parseManualServiceDateInput(value?: string) {
  const dateInput = value ?? todayDateInput();
  if (!isValidDateInput(dateInput)) {
    throw new Error("Informe uma data de atendimento valida.");
  }
  if (dateInput > todayDateInput()) {
    throw new Error("A data do atendimento nao pode ser futura.");
  }
  return startOfSaoPauloDay(dateInput);
}

export function normalizeQuantity(quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("A quantidade deve ser um numero inteiro maior que zero.");
  return quantity;
}

export async function assertManualServiceOwner({
  role,
  sessionBarberId,
  manualServiceId
}: {
  role: string;
  sessionBarberId?: string;
  manualServiceId: string;
}) {
  const manualService = await prisma.manualService.findFirst({
    where: {
      id: manualServiceId,
      ...(canAdminManualServices(role) ? {} : { barberId: sessionBarberId })
    },
    include: {
      barber: { include: { user: true } },
      client: { include: { user: true } },
      subscription: { include: { subscriptionPlan: { include: { services: true } } } },
      items: { include: { service: true } },
      changeRequests: true
    }
  });

  if (!manualService) throw new Error("Atendimento nao encontrado ou fora da sua permissao.");
  return manualService;
}

export function snapshotManualService(manualService: ManualServiceWithDetails): ManualServiceSnapshot {
  return {
    barberId: manualService.barberId,
    clientId: manualService.clientId,
    subscriptionId: manualService.subscriptionId,
    customerName: manualService.customerName,
    serviceDate: manualService.serviceDate.toISOString(),
    notes: manualService.notes,
    deletedAt: manualService.deletedAt?.toISOString() ?? null,
    items: manualService.items.map((item) => ({
      serviceId: item.serviceId,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toString(),
      chargedUnitPrice: item.chargedUnitPrice.toString(),
      duration: item.duration,
      coveredBySubscription: item.coveredBySubscription,
      subscriptionPlanName: item.subscriptionPlanName
    }))
  };
}

export async function buildManualServiceData(input: ManualServiceInput) {
  assertPastOrToday(input.serviceDate);

  const items = input.items.map((item) => ({
    serviceId: item.serviceId,
    quantity: normalizeQuantity(item.quantity)
  }));
  if (items.length === 0) throw new Error("Selecione pelo menos um servico.");

  const services = await prisma.service.findMany({
    where: { id: { in: items.map((item) => item.serviceId) }, active: true, deletedAt: null }
  });
  if (services.length !== new Set(items.map((item) => item.serviceId)).size) {
    throw new Error("Um ou mais servicos estao indisponiveis.");
  }

  const subscription = input.subscriptionId
    ? await prisma.subscription.findFirst({
        where: {
          id: input.subscriptionId,
          clientId: input.clientId ?? undefined,
          active: true,
          status: "ACTIVE",
          deletedAt: null,
          startDate: { lte: input.serviceDate },
          OR: [{ endDate: null }, { endDate: { gte: input.serviceDate } }]
        },
        include: { subscriptionPlan: { include: { services: true } }, client: { include: { user: true } } }
      })
    : null;

  if (input.subscriptionId && !subscription) {
    throw new Error("Assinatura ativa nao encontrada para a data informada.");
  }

  const coveredIds = new Set(subscription?.subscriptionPlan.services.map((item) => item.serviceId) ?? []);
  const serviceById = new Map(services.map((service) => [service.id, service]));

  return {
    manualService: {
      barberId: input.barberId,
      clientId: subscription?.clientId ?? input.clientId ?? null,
      subscriptionId: subscription?.id ?? null,
      customerName: subscription ? subscription.client.user.name : input.customerName?.trim() || null,
      serviceDate: input.serviceDate,
      notes: input.notes?.trim() || null
    },
    items: items.map((item) => {
      const service = serviceById.get(item.serviceId);
      if (!service) throw new Error("Servico indisponivel.");
      const covered = Boolean(subscription && coveredIds.has(service.id));
      const quantity = subscription ? 1 : item.quantity;
      return {
        serviceId: service.id,
        quantity,
        unitPrice: service.price,
        chargedUnitPrice: covered ? new Prisma.Decimal(0) : service.price,
        duration: service.duration,
        coveredBySubscription: covered,
        subscriptionPlanName: covered ? subscription?.subscriptionPlan.name ?? null : null
      };
    })
  };
}

export function manualServiceTotals(manualService: {
  items: { quantity: number; chargedUnitPrice: unknown; unitPrice: unknown; coveredBySubscription: boolean }[];
}) {
  const chargedGross = manualService.items.reduce((sum, item) => sum + Number(item.chargedUnitPrice) * item.quantity, 0);
  const listGross = manualService.items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);
  const serviceUnits = manualService.items.reduce((sum, item) => sum + item.quantity, 0);
  const coveredUnits = manualService.items.some((item) => item.coveredBySubscription) ? 1 : 0;
  const commission = chargedGross * (SERVICE_COMMISSION_PERCENT / 100);
  return { chargedGross, listGross, serviceUnits, coveredUnits, commission };
}

export async function createManualService(input: ManualServiceInput & { createdById?: string | null }) {
  const data = await buildManualServiceData(input);

  return prisma.manualService.create({
    data: {
      ...data.manualService,
      createdById: input.createdById ?? null,
      items: { create: data.items }
    },
    include: {
      barber: { include: { user: true } },
      client: { include: { user: true } },
      subscription: { include: { subscriptionPlan: { include: { services: true } } } },
      items: { include: { service: true } },
      changeRequests: true
    }
  });
}

export async function replaceManualServiceItems(
  tx: Prisma.TransactionClient,
  manualServiceId: string,
  input: ManualServiceInput,
  deletedAt: Date | null
) {
  const data = await buildManualServiceData(input);
  await tx.manualService.update({
    where: { id: manualServiceId },
    data: {
      ...data.manualService,
      deletedAt
    }
  });
  await tx.manualServiceItem.deleteMany({ where: { manualServiceId } });
  await tx.manualServiceItem.createMany({
    data: data.items.map((item) => ({ ...item, manualServiceId }))
  });
}

export async function restoreManualServiceFromSnapshot(
  tx: Prisma.TransactionClient,
  manualServiceId: string,
  snapshot: ManualServiceSnapshot
) {
  await tx.manualService.update({
    where: { id: manualServiceId },
    data: {
      barberId: snapshot.barberId,
      clientId: snapshot.clientId,
      subscriptionId: snapshot.subscriptionId,
      customerName: snapshot.customerName,
      serviceDate: new Date(snapshot.serviceDate),
      notes: snapshot.notes,
      deletedAt: snapshot.deletedAt ? new Date(snapshot.deletedAt) : null
    }
  });
  await tx.manualServiceItem.deleteMany({ where: { manualServiceId } });
  await tx.manualServiceItem.createMany({
    data: snapshot.items.map((item) => ({
      manualServiceId,
      serviceId: item.serviceId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      chargedUnitPrice: item.chargedUnitPrice,
      duration: item.duration,
      coveredBySubscription: item.coveredBySubscription,
      subscriptionPlanName: item.subscriptionPlanName
    }))
  });
}

export function manualServicePeriodWhere(startDate?: string, endDate?: string) {
  const start = startDate ? startOfSaoPauloDay(startDate) : startOfSaoPauloDay(todayDateInput());
  const end = endDate ? endOfSaoPauloDay(endDate) : endOfSaoPauloDay(todayDateInput());
  return { gte: start, lte: end };
}

export function pendingManualServiceRequest(
  manualService: Pick<ManualServiceWithDetails, "changeRequests">
) {
  return manualService.changeRequests.find((request) => request.status === "PENDING") ?? null;
}

export function requestStatusLabel(status: ManualServiceChangeStatus) {
  return status === "PENDING" ? "Pendente" : status === "APPROVED" ? "Aprovada" : "Recusada";
}

export function requestTypeLabel(type: ManualServiceChangeType) {
  return type === "DELETE" ? "Exclusao" : "Alteracao";
}

export async function activeSubscribersForManualService(query?: string) {
  const now = new Date();
  const subscriptions = await prisma.subscription.findMany({
    where: {
      active: true,
      status: "ACTIVE",
      deletedAt: null,
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
      ...(query
        ? {
            client: {
              user: {
                name: { contains: query, mode: "insensitive" }
              }
            }
          }
        : {})
    },
    include: {
      client: { include: { user: true } },
      subscriptionPlan: { include: { services: true } }
    },
    orderBy: { client: { user: { name: "asc" } } },
    take: 100
  });

  return subscriptions.map((subscription) => ({
    id: subscription.id,
    clientId: subscription.clientId,
    name: subscription.client.user.name,
    phone: subscription.client.user.phone ?? "Telefone nao informado",
    plan: subscription.subscriptionPlan.name,
    coveredServiceIds: subscription.subscriptionPlan.services.map((item) => item.serviceId)
  }));
}
