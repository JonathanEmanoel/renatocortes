import { Prisma } from "@prisma/client";
import { formatCurrency, formatDatePtBr, formatTimePtBr } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  PRODUCT_PROFIT_COMMISSION_PERCENT,
  SERVICE_COMMISSION_PERCENT,
  SUBSCRIPTION_BARBER_PERCENT,
  appointmentFinancials,
  getSubscriptionRevenueForPeriod,
  productItemsCommission
} from "@/lib/server/finance-rules";
import { manualServiceTotals, pendingManualServiceRequest } from "@/lib/server/manual-services";
import { paidSubscriptionPayoutTotalForBarber } from "@/lib/server/subscription-payouts";
import { addDaysInput, dateInputFromDate, endOfSaoPauloDay, isValidDateOrder, resolvePeriodRange, startOfSaoPauloDay, todayDateInput } from "@/lib/server/date-periods";

/**
 * Consolida o relatório operacional e financeiro dos barbeiros.
 *
 * Regras importantes:
 * - atendimentos comuns e avulsos usam a data real do serviço;
 * - assinantes contam para participação mensal no pool, mas não viram ganho
 *   realizado até o repasse mensal ser marcado como pago;
 * - vendas presenciais só geram comissão quando o produto é visível na loja.
 */
export const reportTypeOptions = ["site", "manual", "subscription", "sales"] as const;
export type ReportType = (typeof reportTypeOptions)[number];
export type CommissionFilter = "all" | "with" | "without";
export type ProductTypeFilter = "all" | "store" | "internal";
export type BarberReportPeriod = ReturnType<typeof resolveReportPeriod>;

export type BarberReportFilters = {
  barberId?: string;
  period?: string;
  date?: string;
  month?: string;
  startDate?: string;
  endDate?: string;
  types: ReportType[];
  serviceId?: string;
  productId?: string;
  status?: string;
  productType: ProductTypeFilter;
  commission: CommissionFilter;
};

/**
 * Normaliza filtros da URL para telas e exportacoes que chamam getBarberReport.
 * Tipos ausentes ou todos invalidos habilitam todas as origens; o periodo padrao
 * e o mes atual. Produto e comissao usam "all" quando nao informados.
 * Nao autoriza barberId nem valida enums de status: o chamador deve restringir
 * o profissional ao usuario autenticado quando a consulta partir de BARBER.
 * @param params Query string ou searchParams fornecidos pela pagina.
 * @returns Filtros compartilhados pelo demonstrativo e suas exportacoes.
 */
export function parseBarberReportFilters(params: URLSearchParams | Record<string, string | string[] | undefined>): BarberReportFilters {
  const getAll = (key: string) => params instanceof URLSearchParams
    ? params.getAll(key)
    : (() => {
        const value = params[key];
        if (!value) return [];
        return Array.isArray(value) ? value : [value];
      })();
  const getOne = (key: string) => params instanceof URLSearchParams
    ? params.get(key) ?? undefined
    : (() => {
        const value = params[key];
        return Array.isArray(value) ? value[0] : value;
      })();
  const selectedTypes = getAll("type").filter((item): item is ReportType => reportTypeOptions.includes(item as ReportType));

  return {
    barberId: getOne("barberId"),
    period: getOne("period") ?? "month-current",
    date: getOne("date"),
    month: getOne("month"),
    startDate: getOne("startDate"),
    endDate: getOne("endDate"),
    types: selectedTypes.length > 0 ? selectedTypes : [...reportTypeOptions],
    serviceId: getOne("serviceId") || undefined,
    productId: getOne("productId") || undefined,
    status: getOne("status") || undefined,
    productType: (getOne("productType") || "all") as ProductTypeFilter,
    commission: (getOne("commission") || "all") as CommissionFilter
  };
}

type ManualAuditMetadata = {
  barberId?: string;
  serviceIds?: string[];
  customerName?: string | null;
  manualServiceId?: string;
};

const financialAppointmentSelect = {
  id: true,
  status: true,
  dataHora: true,
  service: { select: { id: true, name: true, price: true } },
  services: { select: { serviceId: true, price: true, service: { select: { name: true } } } },
  client: {
    select: {
      user: { select: { name: true } },
      subscriptions: {
        where: { active: true, status: "ACTIVE", deletedAt: null },
        select: {
          active: true,
          status: true,
          deletedAt: true,
          startDate: true,
          endDate: true,
          subscriptionPlan: { select: { name: true, services: { select: { serviceId: true } } } }
        }
      }
    }
  }
} as const;

/**
 * Extrai somente os campos reconhecidos da auditoria de criacao de avulsos.
 * JSON ausente, arrays e valores escalares viram objeto vazio para permitir
 * leitura de historicos heterogeneos. Campos extras, inclusive items e
 * maintenanceHiddenAt, nao sao preservados por esta projecao.
 */
function parseAuditMetadata(value: Prisma.JsonValue | null): ManualAuditMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, Prisma.JsonValue>;
  return {
    barberId: typeof record.barberId === "string" ? record.barberId : undefined,
    serviceIds: Array.isArray(record.serviceIds) ? record.serviceIds.filter((item): item is string => typeof item === "string") : undefined,
    customerName: typeof record.customerName === "string" ? record.customerName : null,
    manualServiceId: typeof record.manualServiceId === "string" ? record.manualServiceId : undefined
  };
}

/**
 * Produz a ultima data civil do mes YYYY-MM, incluindo fevereiro bissexto.
 * O dia zero do mes seguinte e calculado no calendario local; os chamadores
 * convertem a string resultante para limites de dia de Sao Paulo.
 */
function lastDayOfMonthInput(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Seleciona dias 1 a 15 ou 16 ao fim do mes da data ancora.
 * Os limites incluem o dia inteiro em Sao Paulo; nao sao quinze dias moveis.
 * Sem ancora explicita, usa a data atual da barbearia.
 */
function currentFortnight(anchor = todayDateInput()) {
  const day = Number(anchor.slice(8, 10));
  const month = anchor.slice(0, 7);
  const startDate = day <= 15 ? `${month}-01` : `${month}-16`;
  const endDate = day <= 15 ? `${month}-15` : lastDayOfMonthInput(month);
  return {
    start: startOfSaoPauloDay(startDate),
    end: endOfSaoPauloDay(endDate),
    label: day <= 15 ? "1a quinzena atual" : "2a quinzena atual"
  };
}

/**
 * Retorna a quinzena civil imediatamente anterior a da ancora, em Sao Paulo.
 * Ate o dia 15 recua para 16 ao fim do mes anterior, inclusive na virada do
 * ano; a partir do dia 16 seleciona 1 a 15 do mesmo mes.
 */
function previousFortnight(anchor = todayDateInput()) {
  const day = Number(anchor.slice(8, 10));
  const month = anchor.slice(0, 7);

  if (day <= 15) {
    const [year, monthNumber] = month.split("-").map(Number);
    const previousMonth = `${monthNumber === 1 ? year - 1 : year}-${String(monthNumber === 1 ? 12 : monthNumber - 1).padStart(2, "0")}`;
    const startDate = `${previousMonth}-16`;
    const endDate = lastDayOfMonthInput(previousMonth);
    return { start: startOfSaoPauloDay(startDate), end: endOfSaoPauloDay(endDate), label: "2a quinzena anterior" };
  }

  const startDate = `${month}-01`;
  const endDate = `${month}-15`;
  return { start: startOfSaoPauloDay(startDate), end: endOfSaoPauloDay(endDate), label: "1a quinzena anterior" };
}

/**
 * Traduz o seletor do relatorio em limites inclusivos de consulta em Sao Paulo.
 * Dia e intervalo personalizado sem datas usam hoje; semanas e meses delegam
 * ao calendario comum. Periodo desconhecido recai no mes atual.
 * Intervalo invertido retorna invalid e um dia de referencia para a tela;
 * getBarberReport reconhece esse sinal e nao consulta movimentos financeiros.
 */
export function resolveReportPeriod(filters: Pick<BarberReportFilters, "period" | "date" | "month" | "startDate" | "endDate">) {
  const period = filters.period || "month-current";

  if (period === "today") {
    const date = todayDateInput();
    return { start: startOfSaoPauloDay(date), end: endOfSaoPauloDay(date), label: "Hoje" };
  }
  if (period === "day") {
    const date = filters.date || todayDateInput();
    return { start: startOfSaoPauloDay(date), end: endOfSaoPauloDay(date), label: `Dia ${startOfSaoPauloDay(date).toLocaleDateString("pt-BR")}` };
  }
  if (period === "custom") {
    const startDate = filters.startDate || todayDateInput();
    const endDate = filters.endDate || startDate;
    if (!isValidDateOrder(startDate, endDate)) {
      return {
        start: startOfSaoPauloDay(startDate),
        end: endOfSaoPauloDay(startDate),
        label: "Personalizado",
        invalid: true,
        error: "A data final nao pode ser anterior a data inicial."
      };
    }
    return { start: startOfSaoPauloDay(startDate), end: endOfSaoPauloDay(endDate), label: "Personalizado" };
  }
  if (period === "week") {
    const range = resolvePeriodRange({ period: "week", date: filters.date });
    return { start: range.start, end: range.end, label: range.label };
  }
  if (period === "week-current") {
    const range = resolvePeriodRange({ period: "week" });
    return { start: range.start, end: range.end, label: "Semana atual" };
  }
  if (period === "week-previous") {
    const currentWeek = resolvePeriodRange({ period: "week" });
    const startDate = addDaysInput(currentWeek.startDate, -7);
    const endDate = addDaysInput(startDate, 6);
    return { start: startOfSaoPauloDay(startDate), end: endOfSaoPauloDay(endDate), label: "Semana anterior" };
  }
  if (period === "fortnight") return currentFortnight(filters.date || todayDateInput());
  if (period === "fortnight-current") return currentFortnight();
  if (period === "fortnight-previous") return previousFortnight();
  if (period === "month") {
    const range = resolvePeriodRange({ period: "month", month: filters.month });
    return { start: range.start, end: range.end, label: range.label };
  }
  if (period === "month-previous") {
    const currentMonth = todayDateInput().slice(0, 7);
    const [year, month] = currentMonth.split("-").map(Number);
    const previous = `${month === 1 ? year - 1 : year}-${String(month === 1 ? 12 : month - 1).padStart(2, "0")}`;
    const range = resolvePeriodRange({ period: "month", month: previous });
    return { start: range.start, end: range.end, label: "Mes anterior" };
  }
  const range = resolvePeriodRange({ period: "month" });
  return { start: range.start, end: range.end, label: "Mes atual" };
}

function shortId(prefix: string, id: string) {
  return `${prefix}-${id.slice(0, 8).toUpperCase()}`;
}

function dateText(date: Date) {
  return formatDatePtBr(date);
}

function timeText(date: Date) {
  return formatTimePtBr(date);
}

function statusText(status: string) {
  const labels: Record<string, string> = {
    PENDING: "Pendente",
    CONFIRMED: "Confirmado",
    COMPLETED: "Concluido",
    CANCELED: "Cancelado",
    REJECTED: "Rejeitado",
    NO_SHOW: "Nao compareceu",
    OPEN: "Aberto"
  };
  return labels[status] ?? status;
}

/**
 * Reconstroi a associacao de avulsos anteriores ao vinculo com ManualService.
 * Sem chave estrangeira historica, escolhe a auditoria do mesmo barbeiro mais
 * proxima de createdAt, aceitando ate dez minutos de diferenca. Essa tolerancia
 * e heuristica, nao uma garantia de identidade entre os registros.
 * usedAuditIds impede reutilizar uma auditoria em duas comissoes desta leitura;
 * manualServiceId exclui registros modernos para evitar dupla contabilizacao.
 * maintenanceHiddenAt representa ocultacao pela manutencao, mas o parser atual
 * nao conserva esse campo; portanto a verificacao abaixo nao o recebe.
 */
function findLegacyManualAuditForCommission(
  commission: { barberId: string; createdAt: Date },
  audits: { id: string; createdAt: Date; metadata: Prisma.JsonValue | null }[],
  usedAuditIds?: Set<string>
) {
  const candidates = audits
    .filter((audit) => {
      if (usedAuditIds?.has(audit.id)) return false;
      const metadata = parseAuditMetadata(audit.metadata);
      if (metadata.barberId !== commission.barberId || metadata.manualServiceId) return false;
      const hidden = Boolean((metadata as Record<string, unknown>).maintenanceHiddenAt);
      if (hidden) return false;
      return Math.abs(audit.createdAt.getTime() - commission.createdAt.getTime()) <= 10 * 60 * 1000;
    })
    .sort((a, b) =>
      Math.abs(a.createdAt.getTime() - commission.createdAt.getTime()) -
      Math.abs(b.createdAt.getTime() - commission.createdAt.getTime())
    );
  const audit = candidates[0];
  if (audit) usedAuditIds?.add(audit.id);
  return audit;
}

/**
 * Aceita itens historicos com quantidade ou recorre a serviceIds com unidade 1.
 * Quantidades invalidas viram 1 e itens sem identificador sao descartados.
 * Neste modulo parseAuditMetadata descarta items, fazendo o fluxo que passa
 * por esse parser utilizar o fallback, mesmo quando o JSON original tem itens.
 */
function legacyManualItems(metadata: ManualAuditMetadata): { serviceId: string; quantity: number }[] {
  const maybeItems = (metadata as Record<string, unknown>).items;
  const rawItems: unknown[] | null = Array.isArray(maybeItems) ? maybeItems : null;
  if (rawItems) {
    return rawItems
      .map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return null;
        const record = item as Record<string, unknown>;
        return {
          serviceId: typeof record.serviceId === "string" ? record.serviceId : "",
          quantity: typeof record.quantity === "number" && Number.isInteger(record.quantity) && record.quantity > 0 ? record.quantity : 1
        };
      })
      .filter((item): item is { serviceId: string; quantity: number } => Boolean(item?.serviceId));
  }
  return (metadata.serviceIds ?? []).map((serviceId) => ({ serviceId, quantity: 1 }));
}

/**
 * Conta visitas pelo maior multiplicador, sem somar servicos da mesma visita.
 * Corte + Barba com quantidade 1 resulta em um atendimento; quantidade 5
 * representa cinco. Um historico sem itens conserva uma visita no relatorio.
 */
function manualAttendanceUnits(items: { quantity: number }[]) {
  // Uma visita com vários serviços continua sendo 1 atendimento; já um item
  // único com multiplicador representa vários clientes lançados juntos.
  if (items.length === 0) return 1;
  return Math.max(...items.map((item) => item.quantity));
}

/**
 * Consolida operacao, receita de servicos/vendas e ganhos de um profissional.
 * Nao faz autorizacao: rotas e paginas devem restringir os filtros antes da chamada.
 * Sem barberId escolhe o primeiro profissional ativo por nome. Ganhos de
 * assinaturas usam repasses PAID por paidAt; visitas produzem apenas estimativa.
 * @returns Secoes detalhadas, opcoes de filtro e totais usados pelas telas e PDF.
 */
export async function getBarberReport(filters: BarberReportFilters) {
  /**
   * Retorna o demonstrativo completo de um barbeiro no período solicitado.
   *
   * A saída alimenta painel do barbeiro, tela admin, série diária e PDF, por
   * isso a regra de datas e valores precisa ficar centralizada aqui.
   */
  const period = resolveReportPeriod(filters);
  const enabledTypes = filters.types.length > 0 ? filters.types : [...reportTypeOptions];

  const barber = filters.barberId
    ? await prisma.barber.findFirst({ where: { id: filters.barberId, active: true, deletedAt: null }, include: { user: true } })
    : await prisma.barber.findFirst({ where: { active: true, deletedAt: null }, include: { user: true }, orderBy: { user: { name: "asc" } } });
  if (!barber) throw new Error("Profissional nao encontrado.");

  const [services, products, barbers] = await Promise.all([
    prisma.service.findMany({ where: { active: true, deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.product.findMany({ where: { active: true, deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.barber.findMany({ where: { active: true, deletedAt: null }, include: { user: true }, orderBy: { user: { name: "asc" } } })
  ]);

  if (period.invalid) {
    return {
      filters,
      period,
      barber: { id: barber.id, name: barber.user.name },
      options: {
        barbers: barbers.map((item) => ({ id: item.id, name: item.user.name })),
        services: services.map((item) => ({ id: item.id, name: item.name })),
        products: products.map((item) => ({ id: item.id, name: item.name, visibleInStore: item.visibleInStore }))
      },
      sections: { site: [], manual: [], subscription: [], sales: [] },
      summary: {
        siteCount: 0,
        manualCount: 0,
        subscriptionCount: 0,
        salesCount: 0,
        grossProduced: 0,
        siteGross: 0,
        manualGross: 0,
        salesGross: 0,
        siteCommission: 0,
        manualCommission: 0,
        subscriptionRevenue: 0,
        subscriptionPool: 0,
        subscriptionTotalAppointments: 0,
        subscriptionBarberAppointments: 0,
        subscriptionCommission: 0,
        subscriptionEstimatedCommission: 0,
        salesCommission: 0,
        salesWithCommissionGross: 0,
        salesWithCommissionCost: 0,
        salesWithoutCommissionGross: 0,
        salesWithoutCommissionCost: 0,
        totalCommission: 0
      }
    };
  }

  // Cada origem preserva sua data: dataHora, serviceDate, completedAt e paidAt.
  // O legado usa createdAt por nao possuir data propria. Consultas globais de
  // assinantes formam o denominador do rateio, nao a lista pessoal do barbeiro.
  // deletedAt remove registros ocultos dos modelos que possuem esse campo.
  const [appointments, manualCommissions, manualAudits, manualServices, sales, subscriptionRevenue, allSubscriberAppointments, allSubscriberManualServices, paidSubscriptionPayouts] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        barberId: barber.id,
        dataHora: { gte: period.start, lte: period.end },
        deletedAt: null,
        ...(filters.status ? { status: filters.status as never } : {})
      },
      select: financialAppointmentSelect,
      orderBy: { dataHora: "asc" }
    }),
    prisma.employeeCommission.findMany({
      where: { barberId: barber.id, createdAt: { gte: period.start, lte: period.end }, appointmentId: null, saleId: null },
      orderBy: { createdAt: "asc" }
    }),
    prisma.auditLog.findMany({
      where: { action: "MANUAL_SERVICE_CREATE", createdAt: { gte: period.start, lte: period.end } },
      orderBy: { createdAt: "asc" }
    }),
    prisma.manualService.findMany({
      where: {
        barberId: barber.id,
        serviceDate: { gte: period.start, lte: period.end },
        deletedAt: null
      },
      include: {
        client: { include: { user: true } },
        subscription: { include: { subscriptionPlan: { include: { services: true } } } },
        items: { include: { service: true } },
        changeRequests: true
      },
      orderBy: { serviceDate: "asc" }
    }),
    prisma.sale.findMany({
      where: { barberId: barber.id, status: "COMPLETED", completedAt: { gte: period.start, lte: period.end }, deletedAt: null },
      include: { items: { include: { product: { include: { category: true } } } } },
      orderBy: { completedAt: "asc" }
    }),
    getSubscriptionRevenueForPeriod(period.start, period.end),
    prisma.appointment.findMany({
      where: { status: "COMPLETED", dataHora: { gte: period.start, lte: period.end }, deletedAt: null },
      select: financialAppointmentSelect
    }),
    prisma.manualService.findMany({
      where: {
        serviceDate: { gte: period.start, lte: period.end },
        deletedAt: null,
        subscriptionId: { not: null },
        items: { some: { coveredBySubscription: true } }
      },
      include: { items: true }
    }),
    paidSubscriptionPayoutTotalForBarber(barber.id, period.start, period.end)
  ]);

  // Pendentes e cancelados podem permanecer no demonstrativo operacional, mas
  // somente COMPLETED recebe financialGross e comissao; gross e valor nominal.
  const siteRows = appointments
    .map((appointment) => {
      const split = appointmentFinancials(appointment);
      const isSubscriber = split.hasCoveredVisit;
      const serviceIds = split.extra.map((service) => service.id);
      const gross = split.chargedGross;
      const financialGross = appointment.status === "COMPLETED" ? gross : 0;
      return {
        id: appointment.id,
        code: shortId("AGD", appointment.id),
        date: appointment.dataHora,
        dateText: dateText(appointment.dataHora),
        timeText: timeText(appointment.dataHora),
        client: appointment.client.user.name,
        services: isSubscriber ? split.extra.map((service) => service.name).join(" + ") : split.names,
        serviceIds,
        status: appointment.status,
        statusText: statusText(appointment.status),
        gross,
        financialGross,
        commission: financialGross * (SERVICE_COMMISSION_PERCENT / 100),
        businessShare: financialGross * (SERVICE_COMMISSION_PERCENT / 100),
        origin: isSubscriber ? "Extra de assinante" : "Servico pelo site"
      };
    })
    .filter((row) => row.gross > 0)
    .filter((row) => !filters.serviceId || row.serviceIds.includes(filters.serviceId))

  const appointmentSubscriptionRows = appointments
    .map((appointment) => {
      const split = appointmentFinancials(appointment);
      return {
        id: appointment.id,
        code: shortId("ASS", appointment.id),
        date: appointment.dataHora,
        dateText: dateText(appointment.dataHora),
        timeText: timeText(appointment.dataHora),
        client: appointment.client.user.name,
        plan: split.plan,
        services: split.names,
        serviceIds: [...split.covered, ...split.extra].map((service) => service.id),
        status: appointment.status,
        statusText: statusText(appointment.status)
      };
    })
    .filter((row) => appointments.some((appointment) => appointment.id === row.id && appointmentFinancials(appointment).hasCoveredVisit))
    .filter((row) => !filters.serviceId || row.serviceIds.includes(filters.serviceId));

  const manualSubscriptionRows = manualServices
    .filter((manualService) => manualService.subscriptionId && manualService.items.some((item) => item.coveredBySubscription))
    .map((manualService) => ({
      id: manualService.id,
      code: shortId("ASS-MAN", manualService.id),
      date: manualService.serviceDate,
      dateText: dateText(manualService.serviceDate),
      timeText: timeText(manualService.serviceDate),
      client: manualService.client?.user.name ?? manualService.customerName ?? "Nao informado",
      plan: manualService.subscription?.subscriptionPlan.name ?? "Assinatura",
      services: manualService.items.map((item) => `${item.service.name}${item.quantity > 1 ? ` x${item.quantity}` : ""}${item.coveredBySubscription ? " (plano)" : " (extra)"}`).join(" + "),
      serviceIds: manualService.items.map((item) => item.serviceId),
      status: "COMPLETED",
      statusText: "Concluido"
    }))
    .filter((row) => !filters.serviceId || row.serviceIds.includes(filters.serviceId));

  const subscriptionRows = [...appointmentSubscriptionRows, ...manualSubscriptionRows];

  const usedLegacyAuditIds = new Set<string>();
  const legacyManualRows = manualCommissions
    .map((commission) => {
      const audit = findLegacyManualAuditForCommission(commission, manualAudits, usedLegacyAuditIds);
      if (!audit) return null;
      const metadata = parseAuditMetadata(audit.metadata);
      const items = legacyManualItems(metadata);
      const serviceIds = items.map((item) => item.serviceId);
      const rowServices = items
        .map((item) => {
          const service = services.find((service) => service.id === item.serviceId);
          return service ? { service, quantity: item.quantity } : null;
        })
        .filter((item): item is { service: (typeof services)[number]; quantity: number } => Boolean(item));
      const gross = Number(commission.amount) / (SERVICE_COMMISSION_PERCENT / 100);
      return {
        id: commission.id,
        code: shortId("AVL", commission.id),
        date: commission.createdAt,
        dateText: dateText(commission.createdAt),
        timeText: timeText(commission.createdAt),
        client: metadata.customerName || "Nao informado",
        services: rowServices.length > 0 ? rowServices.map((item) => `${item.service.name}${item.quantity > 1 ? ` x${item.quantity}` : ""}`).join(" + ") : "Atendimento avulso",
        serviceIds,
        gross,
        commission: Number(commission.amount),
        businessShare: gross - Number(commission.amount),
        origin: "Atendimento avulso legado",
        serviceUnits: Math.max(1, items.reduce((sum, item) => sum + item.quantity, 0)),
        attendanceUnits: manualAttendanceUnits(items),
        coveredUnits: 0,
        pendingChange: null
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .filter((row) => !filters.serviceId || row.serviceIds.includes(filters.serviceId));

  const newManualRows = manualServices
    .map((manualService) => {
      const totals = manualServiceTotals(manualService);
      const pendingRequest = pendingManualServiceRequest(manualService);
      // Visitas cobertas ja entram na secao de assinantes. Os extras conservam
      // receita aqui, mas nao devem gerar outra visita no contador de avulsos.
      const attendanceUnits = manualService.subscriptionId && totals.coveredUnits > 0 ? 0 : manualAttendanceUnits(manualService.items);
      return {
        id: manualService.id,
        code: shortId("AVL", manualService.id),
        date: manualService.serviceDate,
        dateText: dateText(manualService.serviceDate),
        timeText: timeText(manualService.serviceDate),
        client: manualService.client?.user.name ?? manualService.customerName ?? "Nao informado",
        services: manualService.items.map((item) => `${item.service.name}${item.quantity > 1 ? ` x${item.quantity}` : ""}${item.coveredBySubscription ? " (plano)" : ""}`).join(" + "),
        serviceIds: manualService.items.map((item) => item.serviceId),
        gross: totals.chargedGross,
        commission: totals.commission,
        businessShare: totals.chargedGross - totals.commission,
        origin: manualService.subscriptionId ? "Atendimento manual de assinante" : "Atendimento avulso",
        serviceUnits: totals.serviceUnits,
        attendanceUnits,
        coveredUnits: totals.coveredUnits,
        pendingChange: pendingRequest?.id ?? null
      };
    })
    .filter((row) => !filters.serviceId || row.serviceIds.includes(filters.serviceId));

  const manualRows = [...newManualRows, ...legacyManualRows].sort((a, b) => a.date.getTime() - b.date.getTime());

  const saleRows = sales.flatMap((sale) =>
    sale.items.map((item) => {
      const gross = Number(item.price) * item.quantity;
      const cost = Number(item.costPrice) * item.quantity;
      const profit = Math.max(0, gross - cost);
      const eligible = item.product.visibleInStore;
      const commission = eligible ? productItemsCommission([{ ...item, product: item.product }]) : 0;
      return {
        id: item.id,
        saleId: sale.id,
        code: shortId("VEN", sale.id),
        date: sale.completedAt ?? sale.createdAt,
        dateText: dateText(sale.completedAt ?? sale.createdAt),
        timeText: timeText(sale.completedAt ?? sale.createdAt),
        client: sale.customerName ?? "Nao informado",
        productId: item.productId,
        product: item.product.name,
        categoryId: item.product.categoryId,
        quantity: item.quantity,
        price: Number(item.price),
        cost: Number(item.costPrice),
        gross,
        totalCost: cost,
        profit,
        productType: eligible ? "store" as const : "internal" as const,
        productTypeLabel: eligible ? "Produto da loja" : "Somente presencial",
        commission,
        businessResult: profit - commission,
        commissionRule: eligible ? `${PRODUCT_PROFIT_COMMISSION_PERCENT}% do lucro` : "Sem comissao"
      };
    })
  )
    .filter((row) => !filters.productId || row.productId === filters.productId)
    .filter((row) => filters.productType === "all" || row.productType === filters.productType)
    .filter((row) => filters.commission === "all" || (filters.commission === "with" ? row.commission > 0 : row.commission === 0));

  // Total global de visitas de assinantes na competência do relatório; é o
  // denominador usado para estimar a participação no pool mensal.
  const completedSubscriberAppointments = allSubscriberAppointments.filter((appointment) =>
    appointmentFinancials(appointment).hasCoveredVisit
  );
  const completedSubscriberVisitsCount = completedSubscriberAppointments.length + allSubscriberManualServices.length;
  const barberSubscriberCompleted = subscriptionRows.filter((row) => row.status === "COMPLETED").length;
  const subscriptionPool = subscriptionRevenue * (SUBSCRIPTION_BARBER_PERCENT / 100);
  const subscriptionEstimatedCommission =
    completedSubscriberVisitsCount > 0 ? subscriptionPool * (barberSubscriberCompleted / completedSubscriberVisitsCount) : 0;

  const sections = {
    site: enabledTypes.includes("site") ? siteRows : [],
    manual: enabledTypes.includes("manual") ? manualRows : [],
    subscription: enabledTypes.includes("subscription") ? subscriptionRows : [],
    sales: enabledTypes.includes("sales") ? saleRows : []
  };

  const siteCommission = sections.site.reduce((sum, row) => sum + row.commission, 0);
  const manualCommission = sections.manual.reduce((sum, row) => sum + row.commission, 0);
  const salesCommission = sections.sales.reduce((sum, row) => sum + row.commission, 0);
  const siteGross = sections.site.reduce((sum, row) => sum + row.financialGross, 0);
  const manualGross = sections.manual.reduce((sum, row) => sum + row.gross, 0);
  const salesGross = sections.sales.reduce((sum, row) => sum + row.gross, 0);
  // O valor realizado de assinatura vem de repasses pagos por paidAt. A
  // estimativa do pool fica separada para não parecer dinheiro já recebido.
  const filteredSubscriptionCommission = enabledTypes.includes("subscription") && !filters.serviceId && !filters.status ? paidSubscriptionPayouts : 0;
  const totalCommission = siteCommission + manualCommission + filteredSubscriptionCommission + salesCommission;
  const salesWithCommission = sections.sales.filter((row) => row.commission > 0);
  const salesWithoutCommission = sections.sales.filter((row) => row.commission === 0);

  return {
    filters,
    period,
    barber: { id: barber.id, name: barber.user.name },
    options: {
      barbers: barbers.map((item) => ({ id: item.id, name: item.user.name })),
      services: services.map((item) => ({ id: item.id, name: item.name })),
      products: products.map((item) => ({ id: item.id, name: item.name, visibleInStore: item.visibleInStore }))
    },
    sections,
    summary: {
      siteCount: sections.site.length,
      manualCount: sections.manual.reduce((sum, row) => sum + row.attendanceUnits, 0),
      subscriptionCount: sections.subscription.length,
      salesCount: sections.sales.length,
      grossProduced: siteGross + manualGross + salesGross,
      siteGross,
      manualGross,
      salesGross,
      siteCommission,
      manualCommission,
      subscriptionRevenue,
      subscriptionPool,
        subscriptionTotalAppointments: completedSubscriberVisitsCount,
      subscriptionBarberAppointments: barberSubscriberCompleted,
      subscriptionCommission: filteredSubscriptionCommission,
      subscriptionEstimatedCommission,
      salesCommission,
      salesWithCommissionGross: salesWithCommission.reduce((sum, row) => sum + row.gross, 0),
      salesWithCommissionCost: salesWithCommission.reduce((sum, row) => sum + row.totalCost, 0),
      salesWithoutCommissionGross: salesWithoutCommission.reduce((sum, row) => sum + row.gross, 0),
      salesWithoutCommissionCost: salesWithoutCommission.reduce((sum, row) => sum + row.totalCost, 0),
      totalCommission
    }
  };
}

/**
 * Fornece o recorte padrao dos paineis sem duplicar formulas financeiras.
 * Repassa o profissional e periodo ao relatorio, sem filtros de produto/comissao.
 */
export async function getBarberFinancialSummary({
  barberId,
  period,
  types = [...reportTypeOptions]
}: {
  barberId: string;
  period: string;
  types?: ReportType[];
}) {
  const report = await getBarberReport({
    barberId,
    period,
    types,
    productType: "all",
    commission: "all"
  });

  return {
    period: report.period,
    summary: report.summary,
    sections: report.sections
  };
}

/**
 * Preenche todos os dias do periodo, inclusive sem movimento, usando as secoes
 * ja filtradas do relatorio. Receita soma site realizado e avulsos; nao inclui
 * vendas, mensalidades ou repasses. Contagem soma linhas do site, visitas
 * manuais e linhas de assinantes, sem novo filtro de status nesta etapa.
 */
export function getBarberDailySeries(report: Awaited<ReturnType<typeof getBarberReport>>) {
  // row.date vem de dataHora nos agendamentos, serviceDate nos avulsos novos
  // e createdAt nos legados; agrupamento usa a data civil de Sao Paulo.
  const startDate = dateInputFromDate(report.period.start);
  const endDate = dateInputFromDate(report.period.end);
  const days: string[] = [];

  for (let current = startDate; current <= endDate; current = addDaysInput(current, 1)) {
    days.push(current);
  }

  return days.map((date) => {
    const siteRows = report.sections.site.filter((row) => dateInputFromDate(row.date) === date);
    const manualRows = report.sections.manual.filter((row) => dateInputFromDate(row.date) === date);
    const subscriptionRows = report.sections.subscription.filter((row) => dateInputFromDate(row.date) === date);
    const day = startOfSaoPauloDay(date);
    const revenue =
      siteRows.reduce((sum, row) => sum + row.financialGross, 0) +
      manualRows.reduce((sum, row) => sum + row.gross, 0);

    return {
      label: day.toLocaleDateString("pt-BR", { weekday: "short" }),
      dateLabel: day.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      count: new Set([...siteRows, ...subscriptionRows].map((row) => row.id)).size + manualRows.reduce((sum, row) => sum + row.attendanceUnits, 0),
      siteCount: siteRows.length,
      manualCount: manualRows.reduce((sum, row) => sum + row.attendanceUnits, 0),
      subscriptionCount: subscriptionRows.length,
      revenue
    };
  });
}

/**
 * Serializa o relatorio ja calculado em linhas para exportacao, sem novas queries.
 * Exibe estimativa do pool e repasse pago separadamente para distinguir
 * participacao operacional de dinheiro realizado no periodo.
 */
export function reportLines(report: Awaited<ReturnType<typeof getBarberReport>>) {
  const lines = [
    "RENATO CORTES BARBEARIA",
    "RELATORIO DO PROFISSIONAL",
    `Profissional: ${report.barber.name}`,
    `Periodo: ${report.period.label} (${dateText(report.period.start)} a ${dateText(report.period.end)})`,
    `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
    "",
    "RESUMO",
    `Servicos pelo site: ${report.summary.siteCount}`,
    `Atendimentos avulsos: ${report.summary.manualCount}`,
    `Atendimentos de assinantes: ${report.summary.subscriptionCount}`,
    `Vendas presenciais: ${report.summary.salesCount}`,
    `Faturamento produzido: ${formatCurrency(report.summary.grossProduced)}`,
    `Comissao total: ${formatCurrency(report.summary.totalCommission)}`,
    "",
    "DEMONSTRATIVO",
    `Servicos pelo site 50%: ${formatCurrency(report.summary.siteCommission)}`,
    `Atendimentos avulsos 50%: ${formatCurrency(report.summary.manualCommission)}`,
    `Assinaturas: receita ${formatCurrency(report.summary.subscriptionRevenue)}, pool 40% ${formatCurrency(report.summary.subscriptionPool)}, atendimentos ${report.summary.subscriptionBarberAppointments}/${report.summary.subscriptionTotalAppointments}, estimativa a receber ${formatCurrency(report.summary.subscriptionEstimatedCommission)}, pago no periodo ${formatCurrency(report.summary.subscriptionCommission)}`,
    `Vendas com comissao: faturamento ${formatCurrency(report.summary.salesWithCommissionGross)}, custo ${formatCurrency(report.summary.salesWithCommissionCost)}, 20% do lucro ${formatCurrency(report.summary.salesCommission)}`,
    `Vendas sem comissao: faturamento ${formatCurrency(report.summary.salesWithoutCommissionGross)}, custo ${formatCurrency(report.summary.salesWithoutCommissionCost)}, comissao R$ 0,00`,
    ""
  ];

  if (report.sections.sales.length > 0) {
    lines.push("VENDAS PRESENCIAIS");
    report.sections.sales.forEach((row) => {
      lines.push(`${row.code} ${row.dateText} ${row.timeText} - ${row.product} - ${row.productTypeLabel} - qtd ${row.quantity} - venda ${formatCurrency(row.gross)} - custo ${formatCurrency(row.totalCost)} - lucro ${formatCurrency(row.profit)} - comissao ${formatCurrency(row.commission)} - regra ${row.commissionRule}`);
    });
    lines.push("");
  }
  if (report.sections.site.length > 0) {
    lines.push("SERVICOS PELO SITE");
    report.sections.site.forEach((row) => lines.push(`${row.code} ${row.dateText} ${row.timeText} - ${row.client} - ${row.services} - ${row.statusText} - faturamento realizado ${formatCurrency(row.financialGross)} - comissao ${formatCurrency(row.commission)}`));
    lines.push("");
  }
  if (report.sections.manual.length > 0) {
    lines.push("ATENDIMENTOS AVULSOS");
    report.sections.manual.forEach((row) => lines.push(`${row.code} ${row.dateText} ${row.timeText} - ${row.client} - ${row.services} - ${formatCurrency(row.gross)} - comissao ${formatCurrency(row.commission)}`));
    lines.push("");
  }
  if (report.sections.subscription.length > 0) {
    lines.push("ASSINANTES");
    report.sections.subscription.forEach((row) => lines.push(`${row.code} ${row.dateText} ${row.timeText} - ${row.client} - ${row.plan} - ${row.services} - ${row.statusText}`));
  }
  return lines;
}
