import { Prisma, type ManualServiceChangeStatus, type ManualServiceChangeType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SERVICE_COMMISSION_PERCENT } from "@/lib/server/finance-rules";
import { endOfSaoPauloDay, isValidDateInput, startOfSaoPauloDay, todayDateInput } from "@/lib/server/date-periods";

/**
 * Domínio dos atendimentos avulsos/manuais.
 *
 * `serviceDate` é a data em que o atendimento aconteceu de verdade.
 * `createdAt` é apenas auditoria de quando o registro entrou no sistema.
 * Relatórios, comissão operacional e filtros devem usar `serviceDate`.
 */
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

/**
 * Identifica perfis que podem acessar rotas internas do painel operacional.
 * CLIENT fica fora mesmo quando possui sessao valida, porque os atendimentos
 * avulsos manipulam comissao e dados de outros clientes.
 */
export function isInternalRole(role: string) {
  return role === "BARBER" || role === "ADMIN" || role === "DEVELOPER";
}

/**
 * Define quem pode aprovar ou alterar atendimentos de qualquer barbeiro.
 * BARBER registra e solicita mudanças apenas nos proprios lançamentos; ADMIN e
 * DEVELOPER preservam a capacidade de auditoria central.
 */
export function canAdminManualServices(role: string) {
  return role === "ADMIN" || role === "DEVELOPER";
}

/**
 * Bloqueia registro retroativo invalido e lançamento futuro.
 * Atendimentos avulsos entram na competencia do dia executado, entao permitir
 * datas futuras contaminaria relatorios e repasses antes do serviço existir.
 */
export function assertPastOrToday(date: Date) {
  const todayEnd = endOfSaoPauloDay(todayDateInput());
  if (Number.isNaN(date.getTime()) || date > todayEnd) {
    throw new Error("Informe uma data de atendimento valida, sem datas futuras.");
  }
}

/**
 * Converte o campo `YYYY-MM-DD` da UI para o inicio do dia em Sao Paulo.
 * A validacao acontece antes da conversao para impedir normalizacoes silenciosas
 * do JavaScript em datas inexistentes.
 */
export function parseManualServiceDateInput(value?: string) {
  // Valida data civil antes de converter para Date, evitando que o JS normalize
  // datas inexistentes como 31/02 para outro dia real.
  const dateInput = value ?? todayDateInput();
  if (!isValidDateInput(dateInput)) {
    throw new Error("Informe uma data de atendimento valida.");
  }
  if (dateInput > todayDateInput()) {
    throw new Error("A data do atendimento nao pode ser futura.");
  }
  return startOfSaoPauloDay(dateInput);
}

/**
 * Normaliza quantidade de servico manual para a unidade financeira esperada.
 * Quantidade fracionada ou zero nao possui significado na comissao e no estoque
 * de serviços avulsos.
 */
export function normalizeQuantity(quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("A quantidade deve ser um numero inteiro maior que zero.");
  return quantity;
}

/**
 * Carrega um atendimento manual respeitando o limite do perfil logado.
 * A mesma consulta alimenta edicao, exclusao e aprovacao; por isso o filtro de
 * `barberId` fica aqui para nao depender de cada rota repetir a regra.
 */
export async function assertManualServiceOwner({
  role,
  sessionBarberId,
  manualServiceId
}: {
  role: string;
  sessionBarberId?: string;
  manualServiceId: string;
}) {
  // Barbeiro só manipula seus próprios lançamentos; admin/dev podem auditar e
  // corrigir registros de qualquer profissional.
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

/**
 * Serializa o atendimento atual para armazenar em uma solicitacao de mudanca.
 * Os Decimals viram string para atravessar JSON sem perda de precisao e para
 * permitir restauracao fiel caso Renato recuse a alteracao.
 */
export function snapshotManualService(manualService: ManualServiceWithDetails): ManualServiceSnapshot {
  // Snapshot preserva o estado anterior para que uma recusa de alteração volte
  // exatamente para a data, serviços e valores originais.
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

/**
 * Monta os dados persistiveis de um atendimento avulso ou de assinante.
 * A regra valida serviços ativos, assinatura vigente na data do atendimento e
 * decide quais itens entram como cobertos pelo plano; ainda nao grava nada no
 * banco, permitindo reutilizacao por criaçao, edicao e rollback.
 */
export async function buildManualServiceData(input: ManualServiceInput) {
  // Monta a representação financeira do atendimento sem persistir nada ainda.
  // Isso permite reaproveitar a mesma regra em criação, edição e rollback.
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
      // Em atendimento de assinante, cada lançamento representa uma visita;
      // serviços cobertos entram como R$0 e contam para o rateio mensal.
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

/**
 * Calcula totais financeiros e unidades de um atendimento manual ja carregado.
 * `chargedGross` e a base de comissao efetiva; itens cobertos por assinatura
 * geram lista/visita para rateio, mas nao geram cobranca avulsa imediata.
 */
export function manualServiceTotals(manualService: {
  items: { quantity: number; chargedUnitPrice: unknown; unitPrice: unknown; coveredBySubscription: boolean }[];
}) {
  // `serviceUnits` conta serviços/quantidades; `coveredUnits` identifica a
  // visita coberta por assinatura. Essa diferença evita contar Corte+Barba como
  // dois atendimentos quando foi uma única visita.
  const chargedGross = manualService.items.reduce((sum, item) => sum + Number(item.chargedUnitPrice) * item.quantity, 0);
  const listGross = manualService.items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);
  const serviceUnits = manualService.items.reduce((sum, item) => sum + item.quantity, 0);
  const coveredUnits = manualService.items.some((item) => item.coveredBySubscription) ? 1 : 0;
  const commission = chargedGross * (SERVICE_COMMISSION_PERCENT / 100);
  return { chargedGross, listGross, serviceUnits, coveredUnits, commission };
}

/**
 * Persiste um novo atendimento manual com seus itens precificados.
 * O criador fica separado do barbeiro porque admin/dev podem registrar em nome
 * de outro profissional, enquanto o credito financeiro continua no `barberId`.
 */
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

/**
 * Substitui integralmente os itens de um atendimento dentro de transacao.
 * A recriacao evita misturar precos antigos com uma nova data, novo assinante ou
 * nova cobertura de plano em uma edicao aprovada.
 */
export async function replaceManualServiceItems(
  tx: Prisma.TransactionClient,
  manualServiceId: string,
  input: ManualServiceInput,
  deletedAt: Date | null
) {
  // Edições recriam os itens para manter preços, cobertura de plano e data
  // operacional consistentes com a versão proposta do atendimento.
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

/**
 * Restaura um atendimento a partir do snapshot salvo na solicitacao pendente.
 * Esse caminho e usado quando Renato recusa uma alteracao/exclusao e precisa
 * devolver a contribuicao para a competencia e valores anteriores.
 */
export async function restoreManualServiceFromSnapshot(
  tx: Prisma.TransactionClient,
  manualServiceId: string,
  snapshot: ManualServiceSnapshot
) {
  // Usado quando uma alteração/exclusão pendente é recusada: a contribuição
  // volta para a competência e valores do snapshot anterior.
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

/**
 * Gera o filtro padrao por `serviceDate` para consultas de atendimentos manuais.
 * Sem intervalo explicito, retorna somente o dia atual em Sao Paulo para evitar
 * que telas operacionais mostrem todo o historico por engano.
 */
export function manualServicePeriodWhere(startDate?: string, endDate?: string) {
  const start = startDate ? startOfSaoPauloDay(startDate) : startOfSaoPauloDay(todayDateInput());
  const end = endDate ? endOfSaoPauloDay(endDate) : endOfSaoPauloDay(todayDateInput());
  return { gte: start, lte: end };
}

/**
 * Localiza a solicitacao pendente associada a um atendimento manual.
 * A UI usa essa informaçao para impedir que varias mudancas simultaneas sejam
 * abertas sobre o mesmo registro antes da decisao administrativa.
 */
export function pendingManualServiceRequest(
  manualService: Pick<ManualServiceWithDetails, "changeRequests">
) {
  return manualService.changeRequests.find((request) => request.status === "PENDING") ?? null;
}

/**
 * Converte status tecnico de solicitacao em texto da interface administrativa.
 */
export function requestStatusLabel(status: ManualServiceChangeStatus) {
  return status === "PENDING" ? "Pendente" : status === "APPROVED" ? "Aprovada" : "Recusada";
}

/**
 * Converte o tipo da solicitacao em rotulo legivel sem alterar a enum do banco.
 */
export function requestTypeLabel(type: ManualServiceChangeType) {
  return type === "DELETE" ? "Exclusao" : "Alteracao";
}

/**
 * Lista assinantes vigentes para a tela de registro manual de atendimento.
 * A busca usa a data atual, nao a data escolhida no formulario, entao a validade
 * final ainda precisa ser confirmada por `buildManualServiceData` ao salvar.
 */
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
