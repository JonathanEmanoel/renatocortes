import { Prisma } from "@prisma/client";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  PRODUCT_PROFIT_COMMISSION_PERCENT,
  SERVICE_COMMISSION_PERCENT,
  SUBSCRIPTION_BARBER_PERCENT,
  appointmentGross,
  getSubscriptionRevenueForPeriod,
  hasActiveSubscriptionAt,
  productItemsCommission
} from "@/lib/server/finance-rules";
import { addDaysInput, endOfSaoPauloDay, resolvePeriodRange, startOfSaoPauloDay, todayDateInput } from "@/lib/server/date-periods";

export const reportTypeOptions = ["site", "manual", "subscription", "sales"] as const;
export type ReportType = (typeof reportTypeOptions)[number];
export type CommissionFilter = "all" | "with" | "without";
export type ProductTypeFilter = "all" | "store" | "internal";
export type BarberReportPeriod = ReturnType<typeof resolveReportPeriod>;

export type BarberReportFilters = {
  barberId?: string;
  period?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  types: ReportType[];
  serviceId?: string;
  productId?: string;
  status?: string;
  productType: ProductTypeFilter;
  commission: CommissionFilter;
};

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
};

function parseAuditMetadata(value: Prisma.JsonValue | null): ManualAuditMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, Prisma.JsonValue>;
  return {
    barberId: typeof record.barberId === "string" ? record.barberId : undefined,
    serviceIds: Array.isArray(record.serviceIds) ? record.serviceIds.filter((item): item is string => typeof item === "string") : undefined,
    customerName: typeof record.customerName === "string" ? record.customerName : null
  };
}

function dayStart(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function dayEnd(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function currentFortnight(date: Date) {
  const start = date.getDate() <= 15 ? new Date(date.getFullYear(), date.getMonth(), 1) : new Date(date.getFullYear(), date.getMonth(), 16);
  const end = date.getDate() <= 15 ? new Date(date.getFullYear(), date.getMonth(), 15) : new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: dayStart(start), end: dayEnd(end), label: date.getDate() <= 15 ? "1a quinzena atual" : "2a quinzena atual" };
}

function previousFortnight(date: Date) {
  if (date.getDate() <= 15) {
    const previousMonth = new Date(date.getFullYear(), date.getMonth() - 1, 1);
    const end = new Date(previousMonth.getFullYear(), previousMonth.getMonth() + 1, 0);
    return { start: dayStart(new Date(previousMonth.getFullYear(), previousMonth.getMonth(), 16)), end: dayEnd(end), label: "2a quinzena anterior" };
  }
  return { start: dayStart(new Date(date.getFullYear(), date.getMonth(), 1)), end: dayEnd(new Date(date.getFullYear(), date.getMonth(), 15)), label: "1a quinzena anterior" };
}

export function resolveReportPeriod(filters: Pick<BarberReportFilters, "period" | "date" | "startDate" | "endDate">) {
  const now = new Date();
  const period = filters.period || "month-current";

  if (period === "day") {
    const date = filters.date || todayDateInput();
    return { start: startOfSaoPauloDay(date), end: endOfSaoPauloDay(date), label: `Dia ${startOfSaoPauloDay(date).toLocaleDateString("pt-BR")}` };
  }
  if (period === "custom" && filters.startDate && filters.endDate) {
    return { start: startOfSaoPauloDay(filters.startDate), end: endOfSaoPauloDay(filters.endDate), label: "Personalizado" };
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
  if (period === "fortnight-current") return currentFortnight(now);
  if (period === "fortnight-previous") return previousFortnight(now);
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
  return date.toLocaleDateString("pt-BR");
}

function timeText(date: Date) {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
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

type CoveredPlan = {
  subscriptionPlan: { name: string; services: { serviceId: string }[] };
};

function splitAppointmentServices(
  appointment: {
    service: { id: string; name: string; price: unknown };
    services: { serviceId: string; price: unknown; service: { name: string } }[];
    client: { subscriptions: CoveredPlan[] };
  },
  isSubscriber: boolean
) {
  const services = appointment.services.length > 0
    ? appointment.services.map((item) => ({ id: item.serviceId, name: item.service.name, price: Number(item.price) }))
    : [{ id: appointment.service.id, name: appointment.service.name, price: Number(appointment.service.price) }];

  if (!isSubscriber) return { covered: [], extra: services, names: services.map((service) => service.name).join(" + "), plan: "" };

  const activePlan = appointment.client.subscriptions[0];
  const coveredIds = new Set(activePlan?.subscriptionPlan.services.map((item) => item.serviceId) ?? []);
  return {
    covered: services.filter((service) => coveredIds.has(service.id)),
    extra: services.filter((service) => !coveredIds.has(service.id)),
    names: services.map((service) => service.name).join(" + "),
    plan: activePlan?.subscriptionPlan.name ?? "Assinatura"
  };
}

export async function getBarberReport(filters: BarberReportFilters) {
  const period = resolveReportPeriod(filters);
  const enabledTypes = filters.types.length > 0 ? filters.types : [...reportTypeOptions];

  const barber = filters.barberId
    ? await prisma.barber.findFirst({ where: { id: filters.barberId, active: true, deletedAt: null }, include: { user: true } })
    : await prisma.barber.findFirst({ where: { active: true, deletedAt: null }, include: { user: true }, orderBy: { user: { name: "asc" } } });
  if (!barber) throw new Error("Profissional nao encontrado.");

  const [appointments, manualCommissions, manualAudits, sales, subscriptionRevenue, allSubscriberAppointments, services, products, barbers] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        barberId: barber.id,
        dataHora: { gte: period.start, lte: period.end },
        deletedAt: null,
        ...(filters.status ? { status: filters.status as never } : {})
      },
      include: {
        service: true,
        services: { include: { service: true } },
        client: {
          include: {
            user: true,
            subscriptions: {
              where: { active: true, status: "ACTIVE", deletedAt: null, startDate: { lte: period.end }, OR: [{ endDate: null }, { endDate: { gte: period.start } }] },
              include: { subscriptionPlan: { include: { services: true } } }
            }
          }
        }
      },
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
    prisma.sale.findMany({
      where: { barberId: barber.id, status: "COMPLETED", completedAt: { gte: period.start, lte: period.end }, deletedAt: null },
      include: { items: { include: { product: { include: { category: true } } } } },
      orderBy: { completedAt: "asc" }
    }),
    getSubscriptionRevenueForPeriod(period.start, period.end),
    prisma.appointment.findMany({
      where: { status: "COMPLETED", dataHora: { gte: period.start, lte: period.end }, deletedAt: null },
      include: {
        client: { include: { subscriptions: { where: { active: true, status: "ACTIVE", deletedAt: null }, include: { subscriptionPlan: { include: { services: true } } } } } }
      }
    }),
    prisma.service.findMany({ where: { active: true, deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.product.findMany({ where: { active: true, deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.barber.findMany({ where: { active: true, deletedAt: null }, include: { user: true }, orderBy: { user: { name: "asc" } } })
  ]);

  const siteRows = appointments
    .map((appointment) => {
      const isSubscriber = hasActiveSubscriptionAt(appointment.client.subscriptions, appointment.dataHora);
      const split = splitAppointmentServices(appointment, isSubscriber);
      const extraGross = split.extra.reduce((sum, service) => sum + service.price, 0);
      const serviceIds = isSubscriber ? split.extra.map((service) => service.id) : split.extra.map((service) => service.id);
      const gross = isSubscriber ? extraGross : appointmentGross(appointment);
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

  const subscriptionRows = appointments
    .map((appointment) => {
      const isSubscriber = hasActiveSubscriptionAt(appointment.client.subscriptions, appointment.dataHora);
      const split = splitAppointmentServices(appointment, isSubscriber);
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
    .filter((row) => appointments.some((appointment) => appointment.id === row.id && hasActiveSubscriptionAt(appointment.client.subscriptions, appointment.dataHora)))
    .filter((row) => !filters.serviceId || row.serviceIds.includes(filters.serviceId));

  const manualAuditByBarber = manualAudits
    .map((audit) => ({ audit, metadata: parseAuditMetadata(audit.metadata) }))
    .filter((item) => item.metadata.barberId === barber.id);
  const manualRows = manualCommissions
    .map((commission, index) => {
      const audit = manualAuditByBarber[index];
      const serviceIds = audit?.metadata.serviceIds ?? [];
      const rowServices = services.filter((service) => serviceIds.includes(service.id));
      const gross = Number(commission.amount) / (SERVICE_COMMISSION_PERCENT / 100);
      return {
        id: commission.id,
        code: shortId("AVL", commission.id),
        date: commission.createdAt,
        dateText: dateText(commission.createdAt),
        timeText: timeText(commission.createdAt),
        client: audit?.metadata.customerName || "Nao informado",
        services: rowServices.length > 0 ? rowServices.map((service) => service.name).join(" + ") : "Atendimento avulso",
        serviceIds,
        gross,
        commission: Number(commission.amount),
        businessShare: gross - Number(commission.amount),
        origin: "Atendimento avulso"
      };
    })
    .filter((row) => !filters.serviceId || row.serviceIds.includes(filters.serviceId));

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

  const completedSubscriberAppointments = allSubscriberAppointments.filter((appointment) =>
    hasActiveSubscriptionAt(appointment.client.subscriptions, appointment.dataHora)
  );
  const barberSubscriberCompleted = subscriptionRows.filter((row) => row.status === "COMPLETED").length;
  const subscriptionPool = subscriptionRevenue * (SUBSCRIPTION_BARBER_PERCENT / 100);
  const subscriptionCommission =
    completedSubscriberAppointments.length > 0 ? subscriptionPool * (barberSubscriberCompleted / completedSubscriberAppointments.length) : 0;

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
  const filteredSubscriptionCommission = enabledTypes.includes("subscription") && !filters.serviceId && !filters.status ? subscriptionCommission : 0;
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
      manualCount: sections.manual.length,
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
      subscriptionTotalAppointments: completedSubscriberAppointments.length,
      subscriptionBarberAppointments: barberSubscriberCompleted,
      subscriptionCommission: filteredSubscriptionCommission,
      salesCommission,
      salesWithCommissionGross: salesWithCommission.reduce((sum, row) => sum + row.gross, 0),
      salesWithCommissionCost: salesWithCommission.reduce((sum, row) => sum + row.totalCost, 0),
      salesWithoutCommissionGross: salesWithoutCommission.reduce((sum, row) => sum + row.gross, 0),
      salesWithoutCommissionCost: salesWithoutCommission.reduce((sum, row) => sum + row.totalCost, 0),
      totalCommission
    }
  };
}

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
    `Assinaturas: receita ${formatCurrency(report.summary.subscriptionRevenue)}, pool 40% ${formatCurrency(report.summary.subscriptionPool)}, atendimentos ${report.summary.subscriptionBarberAppointments}/${report.summary.subscriptionTotalAppointments}, comissao ${formatCurrency(report.summary.subscriptionCommission)}`,
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
