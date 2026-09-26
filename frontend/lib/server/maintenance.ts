import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SERVICE_COMMISSION_PERCENT, SUBSCRIPTION_BARBER_PERCENT, appointmentFinancials, productItemsCommission } from "@/lib/server/finance-rules";
import { assertExpenseNotLinkedToPayout } from "@/lib/server/expense-protection";
import { manualServiceTotals } from "@/lib/server/manual-services";

export type MaintenanceCategory = "accounts" | "appointments" | "manual-services" | "in-person-sales" | "store-orders" | "subscriptions" | "expenses";
export type MaintenanceMode = "hide" | "delete";

export type MaintenanceFilters = {
  category: MaintenanceCategory;
  view?: "active" | "hidden";
  q?: string;
  barberId?: string;
  clientId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
};

export type MaintenanceRow = {
  id: string;
  title: string;
  subtitle: string;
  meta: string[];
  amount: number;
  commission: number;
  protected?: boolean;
  protectedReason?: string;
};

export type MaintenancePreview = {
  category: MaintenanceCategory;
  mode: MaintenanceMode;
  ids: string[];
  count: number;
  revenueImpact: number;
  commissionImpact: number;
  stockRestoreCount: number;
  relatedRecords: number;
  warnings: string[];
  rows: MaintenanceRow[];
};

export const maintenanceCategories: { id: MaintenanceCategory; label: string; description: string }[] = [
  { id: "accounts", label: "Contas / usuarios", description: "Clientes de teste e seus vinculos operacionais." },
  { id: "appointments", label: "Agendamentos", description: "Agendamentos criados durante testes." },
  { id: "manual-services", label: "Atendimentos avulsos", description: "Atendimentos registrados fora do fluxo de agendamento." },
  { id: "in-person-sales", label: "Vendas presenciais", description: "Vendas registradas por barbeiros no balcao." },
  { id: "store-orders", label: "Pedidos da loja", description: "Pedidos feitos pela loja do cliente." },
  { id: "subscriptions", label: "Assinaturas", description: "Assinaturas e receita recorrente dos clientes." },
  { id: "expenses", label: "Despesas", description: "Despesas pontuais de teste." }
];

const structuralEmails = new Set([
  "renato3010andrade@gmail.com",
  "claso6806@gmail.com",
  "gustavosilvagustavo.mendes@gmail.com",
  "reservabarbearia605@gmail.com"
]);

/**
 * Converte Decimals/strings do Prisma para numero apenas para preview humano.
 * Os valores calculados aqui nao devem ser usados como fonte contabil definitiva.
 */
function toNumber(value: unknown) {
  return Number(value ?? 0);
}

/**
 * Formata impactos financeiros da pre-visualizacao em BRL.
 */
function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Constrói intervalo bruto de filtro para a central dev.
 * Diferente dos relatorios financeiros, usa o Date local simples informado pela
 * ferramenta de limpeza e nao aplica regra de competencia em Sao Paulo.
 */
function dateRange(filters: Pick<MaintenanceFilters, "startDate" | "endDate">) {
  const gte = filters.startDate ? new Date(`${filters.startDate}T00:00:00`) : undefined;
  const lte = filters.endDate ? new Date(`${filters.endDate}T23:59:59.999`) : undefined;
  return gte || lte ? { ...(gte && !Number.isNaN(gte.getTime()) ? { gte } : {}), ...(lte && !Number.isNaN(lte.getTime()) ? { lte } : {}) } : undefined;
}

/**
 * Aplica busca textual em memoria depois das consultas limitadas.
 * Isso permite procurar por campos combinados, mas nao substitui indices do
 * banco para listagens maiores.
 */
function matchQuery(values: Array<string | null | undefined>, query?: string) {
  if (!query?.trim()) return true;
  const needle = query.trim().toLowerCase();
  return values.some((value) => value?.toLowerCase().includes(needle));
}

/**
 * Exibe nomes de serviços de agendamentos novos e legados.
 * Quando `AppointmentService` existe, ele representa a composição real; o campo
 * `service` fica como fallback para registros antigos.
 */
function serviceNames(appointment: { service: { name: string }; services: { service: { name: string } }[] }) {
  return appointment.services.length ? appointment.services.map((item) => item.service.name).join(" + ") : appointment.service.name;
}

/**
 * Encontra transacoes financeiras antigas que foram vinculadas por descrição.
 * Alguns lançamentos nao possuem FK direta, entao a limpeza precisa preservar a
 * compatibilidade com esses prefixos historicos.
 */
function financialDescriptionWhere(ids: string[], prefixes: string[]) {
  return {
    OR: ids.flatMap((id) => prefixes.map((prefix) => ({ description: { contains: `${prefix}${id}` } })))
  };
}

/**
 * Protege contas estruturais contra limpeza acidental pela ferramenta dev.
 * A checagem combina id logado, role interna, e-mails fixos e nomes conhecidos
 * porque parte das contas passou por migrações manuais ao longo do projeto.
 */
function structuralReason(user: { id: string; email: string; name: string; role: string }, developerUserId: string) {
  if (user.id === developerUserId) return "Conta DEVELOPER autenticada";
  if (user.role !== "CLIENT") return "Conta interna do sistema";
  if (structuralEmails.has(user.email.toLowerCase())) return "E-mail estrutural protegido";
  const name = user.name.toLowerCase();
  if (["renato", "italo", "ítalo", "renan"].some((item) => name.includes(item))) return "Nome estrutural protegido";
  return null;
}

/**
 * Lê metadados flexiveis de audit log sem presumir schema fechado.
 */
function parseAuditMetadata(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, Prisma.JsonValue>;
}

/**
 * Detecta ocultacao de registros legados que nao possuem coluna `deletedAt`.
 * Para esses casos, a central marca `maintenanceHiddenAt` dentro do audit log.
 */
function isMaintenanceHidden(value: Prisma.JsonValue | null) {
  const metadata = parseAuditMetadata(value);
  return typeof metadata.maintenanceHiddenAt === "string";
}

/**
 * Monta a tela da central de manutencao para a conta DEVELOPER.
 * Une filtros, linhas selecionaveis, contadores, opcoes de filtro e historico
 * recente sem executar nenhuma limpeza.
 */
export async function getMaintenanceData(filters: MaintenanceFilters, developerUserId: string) {
  const [barbers, clients, counters, rows, history] = await Promise.all([
    prisma.barber.findMany({ where: { active: true, deletedAt: null }, include: { user: true }, orderBy: { user: { name: "asc" } } }),
    prisma.client.findMany({ where: { deletedAt: null }, include: { user: true }, orderBy: { user: { name: "asc" } }, take: 200 }),
    getCounters(),
    getMaintenanceRows(filters, developerUserId),
    prisma.auditLog.findMany({
      where: { action: { startsWith: "MAINTENANCE_" } },
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: 10
    })
  ]);

  return {
    filters,
    rows,
    counters,
    options: {
      barbers: barbers.map((barber) => ({ id: barber.id, label: barber.user.name })),
      clients: clients.map((client) => ({ id: client.id, label: client.user.name }))
    },
    history: history.map((log) => ({
      id: log.id,
      createdAt: log.createdAt.toLocaleString("pt-BR"),
      user: log.user?.name ?? "Developer",
      action: log.action,
      entity: log.entity,
      metadata: log.metadata
    }))
  };
}

/**
 * Conta registros ativos por categoria para o resumo da central dev.
 * Atendimentos avulsos misturam o modelo novo ManualService com audit logs
 * legados ainda visiveis.
 */
async function getCounters() {
  const [accounts, appointments, manualAudits, newManualServices, inPersonSales, storeOrders, subscriptions, expenses] = await Promise.all([
    prisma.user.count({ where: { role: "CLIENT", deletedAt: null } }),
    prisma.appointment.count({ where: { deletedAt: null } }),
    prisma.auditLog.findMany({ where: { action: "MANUAL_SERVICE_CREATE" }, select: { metadata: true } }),
    prisma.manualService.count({ where: { deletedAt: null } }),
    prisma.sale.count({ where: { barberId: { not: null }, deletedAt: null } }),
    prisma.sale.count({ where: { barberId: null, deletedAt: null } }),
    prisma.subscription.count({ where: { deletedAt: null } }),
    prisma.expense.count({ where: { deletedAt: null } })
  ]);
  const legacyManualServices = manualAudits.filter((audit) => {
    const metadata = parseAuditMetadata(audit.metadata);
    return !isMaintenanceHidden(audit.metadata) && typeof metadata.manualServiceId !== "string";
  }).length;
  const manualServices = newManualServices + legacyManualServices;
  return { accounts, appointments, "manual-services": manualServices, "in-person-sales": inPersonSales, "store-orders": storeOrders, subscriptions, expenses };
}

/**
 * Encaminha a categoria selecionada para a consulta especifica.
 * Cada categoria calcula impacto financeiro de modo proprio porque receitas,
 * comissoes e proteções usam tabelas diferentes.
 */
export async function getMaintenanceRows(filters: MaintenanceFilters, developerUserId: string): Promise<MaintenanceRow[]> {
  const range = dateRange(filters);
  if (filters.category === "accounts") return accountRows(filters, developerUserId, range);
  if (filters.category === "appointments") return appointmentRows(filters, range);
  if (filters.category === "manual-services") return manualRows(filters, range);
  if (filters.category === "in-person-sales") return saleRows(filters, true, range);
  if (filters.category === "store-orders") return saleRows(filters, false, range);
  if (filters.category === "subscriptions") return subscriptionRows(filters, range);
  return expenseRows(filters, range);
}

/**
 * Lista contas CLIENT elegiveis para limpeza ou restauracao.
 * Contas internas/estruturais sao marcadas como protegidas para impedir exclusao
 * de acessos administrativos e operacionais.
 */
async function accountRows(filters: MaintenanceFilters, developerUserId: string, range?: { gte?: Date; lte?: Date }) {
  const users = await prisma.user.findMany({
    where: { role: "CLIENT", deletedAt: filters.view === "hidden" ? { not: null } : null, ...(range ? { createdAt: range } : {}) },
    include: { client: { include: { appointments: true, sales: true, subscriptions: true } } },
    orderBy: { createdAt: "desc" },
    take: 120
  });

  return users
    .filter((user) => matchQuery([user.name, user.email, user.phone], filters.q))
    .map((user) => {
      const reason = structuralReason(user, developerUserId);
      return {
        id: user.id,
        title: user.name,
        subtitle: user.email,
        meta: [
          `Telefone: ${user.phone ?? "Nao informado"}`,
          `Role: ${user.role}`,
          `Criado em: ${user.createdAt.toLocaleDateString("pt-BR")}`,
          `Agendamentos: ${user.client?.appointments.length ?? 0}`,
          `Pedidos: ${user.client?.sales.length ?? 0}`,
          `Assinaturas: ${user.client?.subscriptions.length ?? 0}`
        ],
        amount: 0,
        commission: 0,
        protected: Boolean(reason),
        protectedReason: reason ?? undefined
      };
    });
}

/**
 * Lista agendamentos com impacto financeiro apenas quando finalizados.
 * Pendentes, confirmados e cancelados aparecem para manutenção, mas nao entram
 * como receita valida no preview.
 */
const maintenanceAppointmentSelect = {
  id: true,
  barberId: true,
  status: true,
  dataHora: true,
  service: { select: { id: true, name: true, price: true } },
  services: { select: { serviceId: true, price: true, service: { select: { name: true } } } },
  client: {
    select: {
      user: { select: { name: true } },
      subscriptions: {
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
  },
  barber: { select: { user: { select: { name: true } } } },
  commissions: { select: { amount: true } }
};

async function appointmentRows(filters: MaintenanceFilters, range?: { gte?: Date; lte?: Date }) {
  const appointments = await prisma.appointment.findMany({
    where: {
      deletedAt: filters.view === "hidden" ? { not: null } : null,
      ...(range ? { dataHora: range } : {}),
      ...(filters.barberId ? { barberId: filters.barberId } : {}),
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
      ...(filters.status ? { status: filters.status as never } : {})
    },
    select: maintenanceAppointmentSelect,
    orderBy: { dataHora: "desc" },
    take: 150
  });

  return appointments
    .filter((appointment) => matchQuery([appointment.id, appointment.client.user.name, appointment.barber.user.name, serviceNames(appointment)], filters.q))
    .map((appointment) => {
      const amount = appointment.status === "COMPLETED" ? appointmentFinancials(appointment).chargedGross : 0;
      return {
        id: appointment.id,
        title: appointment.client.user.name,
        subtitle: `${serviceNames(appointment)} com ${appointment.barber.user.name}`,
        meta: [
          `Data: ${appointment.dataHora.toLocaleString("pt-BR")}`,
          `Status: ${appointment.status}`,
          `Valor: ${money(amount)}`,
          `Comissoes vinculadas: ${appointment.commissions.length}`
        ],
        amount,
        commission: appointment.commissions.reduce((sum, item) => sum + toNumber(item.amount), 0)
      };
    });
}

/**
 * Lista atendimentos avulsos atuais e legados na mesma categoria.
 * O modelo novo usa `ManualService.serviceDate`; o legado depende de audit log e
 * metadata, entao valores e itens podem ser aproximados quando os dados antigos
 * nao guardaram quantidade/preco completo.
 */
async function manualRows(filters: MaintenanceFilters, range?: { gte?: Date; lte?: Date }) {
  const [manualServices, audits, barbers, services] = await Promise.all([
    prisma.manualService.findMany({
      where: {
        deletedAt: filters.view === "hidden" ? { not: null } : null,
        ...(range ? { serviceDate: range } : {}),
        ...(filters.barberId ? { barberId: filters.barberId } : {}),
        ...(filters.clientId ? { clientId: filters.clientId } : {})
      },
      include: { barber: { include: { user: true } }, client: { include: { user: true } }, items: { include: { service: true } } },
      orderBy: { serviceDate: "desc" },
      take: 150
    }),
    prisma.auditLog.findMany({ where: { action: "MANUAL_SERVICE_CREATE", ...(range ? { createdAt: range } : {}) }, orderBy: { createdAt: "desc" }, take: 150 }),
    prisma.barber.findMany({ include: { user: true } }),
    prisma.service.findMany()
  ]);
  const barberById = new Map(barbers.map((barber) => [barber.id, barber.user.name]));
  const serviceById = new Map(services.map((service) => [service.id, service]));

  const currentRows = manualServices
    .filter((manualService) => matchQuery([
      manualService.id,
      manualService.customerName,
      manualService.client?.user.name,
      manualService.barber.user.name,
      manualService.items.map((item) => item.service.name).join(" + ")
    ], filters.q))
    .map((manualService) => {
      const totals = manualServiceTotals(manualService);
      return {
        id: manualService.id,
        title: manualService.customerName ?? manualService.client?.user.name ?? "Nao informado",
        subtitle: `${manualService.items.map((item) => `${item.service.name}${item.quantity > 1 ? ` x${item.quantity}` : ""}${item.coveredBySubscription ? " (plano)" : ""}`).join(" + ")} com ${manualService.barber.user.name}`,
        meta: [
          `Data do atendimento: ${manualService.serviceDate.toLocaleString("pt-BR")}`,
          `Tipo: ${manualService.subscriptionId ? "Assinante/manual" : "Avulso"}`,
          `ID: ${manualService.id}`
        ],
        amount: totals.chargedGross,
        commission: totals.commission
      };
    });

  const legacyRows = audits
    .map((audit) => {
      const metadata = parseAuditMetadata(audit.metadata);
      if (typeof metadata.manualServiceId === "string") return null;
      const hidden = isMaintenanceHidden(audit.metadata);
      if (filters.view === "hidden" ? !hidden : hidden) return null;
      const barberId = typeof metadata.barberId === "string" ? metadata.barberId : "";
      const customer = typeof metadata.customerName === "string" ? metadata.customerName : "Nao informado";
      const serviceIds = Array.isArray(metadata.serviceIds) ? metadata.serviceIds.filter((id): id is string => typeof id === "string") : [];
      const rowServices = serviceIds.map((id) => serviceById.get(id)).filter((service): service is NonNullable<typeof service> => Boolean(service));
      const names = rowServices.map((service) => service.name).join(" + ") || "Atendimento avulso";
      const amount = rowServices.reduce((sum, service) => sum + toNumber(service.price), 0);
      const barber = barberById.get(barberId) ?? "Nao informado";
      return { audit, barberId, customer, names, barber, amount };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .filter((row) => !filters.barberId || row.barberId === filters.barberId)
    .filter((row) => matchQuery([row.audit.id, row.customer, row.names, row.barber], filters.q))
    .map((row) => ({
      id: row.audit.id,
      title: row.customer,
      subtitle: `${row.names} com ${row.barber}`,
      meta: [`Data: ${row.audit.createdAt.toLocaleString("pt-BR")}`, `ID financeiro: ${row.audit.entityId ?? "Nao informado"}`],
      amount: row.amount,
      commission: row.amount * 0.5
    }));

  return [...currentRows, ...legacyRows];
}

/**
 * Lista vendas presenciais ou pedidos da loja conforme a presenca de `barberId`.
 * A comissao exibida usa a comissao gravada quando existe; se nao houver, aplica
 * a regra atual de produtos para estimar o impacto.
 */
async function saleRows(filters: MaintenanceFilters, inPerson: boolean, range?: { gte?: Date; lte?: Date }) {
  const sales = await prisma.sale.findMany({
    where: {
      deletedAt: filters.view === "hidden" ? { not: null } : null,
      ...(range ? { createdAt: range } : {}),
      ...(inPerson ? { barberId: { not: null } } : { barberId: null }),
      ...(filters.barberId ? { barberId: filters.barberId } : {}),
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
      ...(filters.status ? { status: filters.status as never } : {})
    },
    include: { barber: { include: { user: true } }, client: { include: { user: true } }, items: { include: { product: true } }, commissions: true },
    orderBy: { createdAt: "desc" },
    take: 150
  });

  return sales
    .filter((sale) => matchQuery([sale.id, sale.customerName, sale.customerPhone, sale.client?.user.name, sale.barber?.user.name], filters.q))
    .map((sale) => {
      const items = sale.items.map((item) => `${item.quantity}x ${item.product.name}`).join(", ");
      const commission = sale.commissions.reduce((sum, item) => sum + toNumber(item.amount), 0) || (sale.barberId ? productItemsCommission(sale.items) : 0);
      const restore = sale.status === "COMPLETED" ? sale.items.reduce((sum, item) => sum + item.quantity, 0) : 0;
      return {
        id: sale.id,
        title: sale.customerName || sale.client?.user.name || "Cliente nao informado",
        subtitle: items || "Venda sem itens",
        meta: [
          `Data: ${(sale.completedAt ?? sale.createdAt).toLocaleString("pt-BR")}`,
          `Status: ${sale.status}`,
          `Vendedor: ${sale.barber?.user.name ?? "Loja online"}`,
          `Estoque a restaurar: ${restore}`
        ],
        amount: toNumber(sale.totalValue),
        commission
      };
    });
}

/**
 * Lista despesas removiveis pela manutencao.
 * Despesas com vencimento ficam protegidas porque podem representar recorrencia
 * ou compromisso financeiro que nao deve sumir em uma limpeza comum de teste.
 */
async function expenseRows(filters: MaintenanceFilters, range?: { gte?: Date; lte?: Date }) {
  const expenses = await prisma.expense.findMany({
    where: { deletedAt: filters.view === "hidden" ? { not: null } : null, ...(range ? { createdAt: range } : {}), ...(filters.status ? { status: filters.status as never } : {}) },
    include: { category: true, transactions: true, createdBy: true, subscriptionPayout: true },
    orderBy: { createdAt: "desc" },
    take: 150
  });

  return expenses
    .filter((expense) => matchQuery([expense.id, expense.name, expense.category?.name, expense.createdBy?.name], filters.q))
    .map((expense) => ({
      id: expense.id,
      title: expense.name,
      subtitle: expense.category?.name ?? "Sem categoria",
      meta: [
        `Tipo: ${expense.dueDate ? "Com vencimento" : "Pontual"}`,
        `Status: ${expense.status}`,
        `Criada em: ${expense.createdAt.toLocaleString("pt-BR")}`,
        `Transacoes: ${expense.transactions.length}`
      ],
      amount: toNumber(expense.amount),
      commission: 0,
      protected: Boolean(expense.dueDate || expense.subscriptionPayout),
      protectedReason: expense.subscriptionPayout ? "Despesa vinculada a repasse de assinatura" : expense.dueDate ? "Despesa com vencimento protegida contra limpeza comum" : undefined
    }));
}

/**
 * Lista assinaturas e estima impacto pelo valor do plano atual.
 * Esse preview nao reconstitui caixa recebido pagamento a pagamento; ele mostra
 * a receita recorrente que o dashboard considera quando a assinatura esta ativa.
 */
async function subscriptionRows(filters: MaintenanceFilters, range?: { gte?: Date; lte?: Date }) {
  const subscriptions = await prisma.subscription.findMany({
    where: {
      deletedAt: filters.view === "hidden" ? { not: null } : null,
      ...(range ? { createdAt: range } : {}),
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
      ...(filters.status ? { status: filters.status as never } : {})
    },
    include: {
      client: { include: { user: true } },
      subscriptionPlan: true,
      payments: true
    },
    orderBy: { createdAt: "desc" },
    take: 150
  });

  return subscriptions
    .filter((subscription) => matchQuery([
      subscription.id,
      subscription.client.user.name,
      subscription.client.user.email,
      subscription.client.user.phone,
      subscription.subscriptionPlan.name
    ], filters.q))
    .map((subscription) => {
      const amount = toNumber(subscription.subscriptionPlan.value);
      return {
        id: subscription.id,
        title: subscription.client.user.name,
        subtitle: subscription.subscriptionPlan.name,
        meta: [
          `Status: ${subscription.status}`,
          `Ativa: ${subscription.active ? "Sim" : "Nao"}`,
          `Criada em: ${subscription.createdAt.toLocaleString("pt-BR")}`,
          `Inicio: ${subscription.startDate.toLocaleDateString("pt-BR")}`,
          `Fim: ${subscription.endDate ? subscription.endDate.toLocaleDateString("pt-BR") : "Sem fim"}`,
          `Pagamentos: ${subscription.payments.length}`
        ],
        amount,
        commission: amount * (SUBSCRIPTION_BARBER_PERCENT / 100)
      };
    });
}

/**
 * Calcula o impacto antes de ocultar/excluir/restaurar registros.
 * A pre-visualizacao remove itens protegidos da execucao e devolve avisos para
 * que a UI obrigue uma decisao consciente antes de tocar dados reais.
 */
export async function previewMaintenance(category: MaintenanceCategory, ids: string[], mode: MaintenanceMode, developerUserId: string, restoreStock: boolean, includeHidden = false): Promise<MaintenancePreview> {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  const rows = await getMaintenanceRows({ category, view: includeHidden ? "hidden" : "active" }, developerUserId);
  const selected = rows.filter((row) => uniqueIds.includes(row.id));
  const allowed = selected.filter((row) => !row.protected);
  const blocked = selected.filter((row) => row.protected);
  const stockRestoreCount = restoreStock && (category === "in-person-sales" || category === "store-orders") ? await getStockRestoreCount(allowed.map((row) => row.id)) : 0;
  const relatedRecords = await countRelatedRecords(category, allowed.map((row) => row.id));

  return {
    category,
    mode,
    ids: allowed.map((row) => row.id),
    count: allowed.length,
    revenueImpact: allowed.reduce((sum, row) => sum + row.amount, 0),
    commissionImpact: allowed.reduce((sum, row) => sum + row.commission, 0),
    stockRestoreCount,
    relatedRecords,
    warnings: [
      ...blocked.map((row) => `${row.title}: ${row.protectedReason ?? "registro protegido"}`),
      ...(allowed.length > 20 ? ["Operacao de grande impacto: mais de 20 registros selecionados."] : []),
      ...(mode === "delete" ? ["Exclusao remove registros selecionados de forma permanente."] : ["Ocultar preserva os registros com deletedAt quando o modelo permite."]),
      ...(category === "expenses" ? ["Despesas com vencimento nao entram na limpeza comum."] : []),
      ...(category === "subscriptions" ? ["Assinaturas ativas entram no faturamento recorrente do dashboard e na divisao 60/40."] : []),
      ...(category === "accounts" && mode === "delete" ? ["Exclusao de conta tenta remover Supabase Auth se a Service Role estiver configurada no servidor."] : [])
    ],
    rows: allowed
  };
}

/**
 * Conta itens de estoque que seriam devolvidos ao remover vendas concluidas.
 */
async function getStockRestoreCount(saleIds: string[]) {
  if (!saleIds.length) return 0;
  const items = await prisma.saleItem.findMany({ where: { saleId: { in: saleIds }, sale: { status: "COMPLETED" } }, select: { quantity: true } });
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Mede o volume de registros dependentes afetados pela limpeza.
 * O numero e informativo para preview; a execucao ainda aplica delecoes ou soft
 * deletes especificos por categoria.
 */
async function countRelatedRecords(category: MaintenanceCategory, ids: string[]) {
  if (!ids.length) return 0;
  if (category === "appointments") {
    const [services, commissions, payments] = await Promise.all([
      prisma.appointmentService.count({ where: { appointmentId: { in: ids } } }),
      prisma.employeeCommission.count({ where: { appointmentId: { in: ids } } }),
      prisma.payment.count({ where: { appointmentId: { in: ids } } })
    ]);
    return services + commissions + payments;
  }
  if (category === "manual-services") return ids.length;
  if (category === "in-person-sales" || category === "store-orders") {
    const [items, commissions, payments] = await Promise.all([
      prisma.saleItem.count({ where: { saleId: { in: ids } } }),
      prisma.employeeCommission.count({ where: { saleId: { in: ids } } }),
      prisma.payment.count({ where: { saleId: { in: ids } } })
    ]);
    return items + commissions + payments;
  }
  if (category === "expenses") return prisma.financialTransaction.count({ where: { expenseId: { in: ids } } });
  if (category === "subscriptions") return prisma.payment.count({ where: { subscriptionId: { in: ids } } });
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, include: { client: true } });
  const clientIds = users.map((user) => user.client?.id).filter((id): id is string => Boolean(id));
  const [appointments, sales, subscriptions] = await Promise.all([
    prisma.appointment.count({ where: { clientId: { in: clientIds } } }),
    prisma.sale.count({ where: { clientId: { in: clientIds } } }),
    prisma.subscription.count({ where: { clientId: { in: clientIds } } })
  ]);
  return appointments + sales + subscriptions;
}

/**
 * Executa ocultacao ou exclusao apos a pre-visualizacao obrigatoria.
 * A transacao cobre o banco local; a exclusao no Supabase Auth, quando existe,
 * acontece depois e falhas nesse passo sao absorvidas para nao reverter a limpeza
 * local ja registrada.
 */
export async function executeMaintenance(input: {
  category: MaintenanceCategory;
  ids: string[];
  mode: MaintenanceMode;
  developerUserId: string;
  restoreStock: boolean;
  includeHidden?: boolean;
  deleteAuthUser?: (authId: string) => Promise<void>;
}) {
  const preview = await previewMaintenance(input.category, input.ids, input.mode, input.developerUserId, input.restoreStock, input.includeHidden);
  if (input.category === "expenses") await assertExpenseNotLinkedToPayout(prisma, input.ids);
  if (!preview.count) return preview;

  const authIds = input.category === "accounts" && input.mode === "delete"
    ? (await prisma.user.findMany({ where: { id: { in: preview.ids }, role: "CLIENT" }, select: { authId: true } })).map((user) => user.authId)
    : [];

  await prisma.$transaction(async (tx) => {
    if (input.category === "appointments") await cleanAppointments(tx, preview.ids, input.mode);
    if (input.category === "manual-services") await cleanManualServices(tx, preview.ids, input.mode);
    if (input.category === "in-person-sales" || input.category === "store-orders") await cleanSales(tx, preview.ids, input.mode, input.restoreStock);
    if (input.category === "subscriptions") await cleanSubscriptions(tx, preview.ids, input.mode);
    if (input.category === "expenses") await cleanExpenses(tx, preview.ids, input.mode, input.developerUserId);
    if (input.category === "accounts") await cleanAccounts(tx, preview.ids, input.mode);

    await tx.auditLog.create({
      data: {
        userId: input.developerUserId,
        action: input.mode === "hide" ? "MAINTENANCE_HIDE" : "MAINTENANCE_DELETE",
        entity: input.category,
        metadata: {
          ids: preview.ids,
          count: preview.count,
          revenueImpact: preview.revenueImpact,
          commissionImpact: preview.commissionImpact,
          stockRestoreCount: preview.stockRestoreCount,
          relatedRecords: preview.relatedRecords
        }
      }
    });
  });

  if (input.mode === "delete" && input.deleteAuthUser) {
    for (const authId of authIds) await input.deleteAuthUser(authId).catch(() => null);
  }

  return preview;
}

/**
 * Restaura registros previamente ocultados pela central dev.
 * Somente linhas visiveis na aba de ocultos e sem protecao sao restauradas, e a
 * acao fica registrada no audit log de manutencao.
 */
export async function restoreMaintenance(input: {
  category: MaintenanceCategory;
  ids: string[];
  developerUserId: string;
}) {
  const rows = await getMaintenanceRows({ category: input.category, view: "hidden" }, input.developerUserId);
  const ids = rows.filter((row) => input.ids.includes(row.id) && !row.protected).map((row) => row.id);
  if (!ids.length) return { count: 0, rows: [] };

  await prisma.$transaction(async (tx) => {
    if (input.category === "accounts") await restoreAccounts(tx, ids);
    if (input.category === "appointments") await restoreAppointments(tx, ids);
    if (input.category === "manual-services") await restoreManualServices(tx, ids);
    if (input.category === "in-person-sales" || input.category === "store-orders") await restoreSales(tx, ids);
    if (input.category === "subscriptions") await restoreSubscriptions(tx, ids);
    if (input.category === "expenses") await restoreExpenses(tx, ids, input.developerUserId);

    await tx.auditLog.create({
      data: {
        userId: input.developerUserId,
        action: "MAINTENANCE_RESTORE",
        entity: input.category,
        metadata: { ids, count: ids.length }
      }
    });
  });

  return { count: ids.length, rows: rows.filter((row) => ids.includes(row.id)) };
}

/**
 * Oculta ou exclui agendamentos e seus reflexos financeiros.
 * A comissao e removida em ambos os modos para que dados ocultos nao sigam
 * inflando relatorios; pagamentos/reviews so somem na exclusao permanente.
 */
async function cleanAppointments(tx: Prisma.TransactionClient, ids: string[], mode: MaintenanceMode) {
  await tx.employeeCommission.deleteMany({ where: { appointmentId: { in: ids } } });
  await tx.financialTransaction.updateMany({ where: financialDescriptionWhere(ids, ["Atendimento finalizado: "]), data: { deletedAt: new Date() } });
  if (mode === "hide") {
    await tx.appointment.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date() } });
    return;
  }
  await tx.payment.deleteMany({ where: { appointmentId: { in: ids } } });
  await tx.review.deleteMany({ where: { appointmentId: { in: ids } } });
  await tx.appointment.deleteMany({ where: { id: { in: ids } } });
}

/**
 * Limpa atendimentos manuais no modelo novo e no formato legado por audit log.
 * Para legados, a funcao procura a comissao aproximada por barbeiro, valor e
 * horario porque o modelo antigo nao tinha FK direta para o lançamento avulso.
 */
async function cleanManualServices(tx: Prisma.TransactionClient, auditIds: string[], mode: MaintenanceMode) {
  const directManualIds = (await tx.manualService.findMany({ where: { id: { in: auditIds } }, select: { id: true } })).map((item) => item.id);
  if (directManualIds.length > 0) {
    if (mode === "hide") {
      await tx.manualService.updateMany({ where: { id: { in: directManualIds } }, data: { deletedAt: new Date() } });
    } else {
      await tx.manualServiceChangeRequest.deleteMany({ where: { manualServiceId: { in: directManualIds } } });
      await tx.manualService.deleteMany({ where: { id: { in: directManualIds } } });
      await tx.auditLog.deleteMany({ where: { action: "MANUAL_SERVICE_CREATE", entity: "ManualService", entityId: { in: directManualIds } } });
    }
  }

  const legacyAuditIds = auditIds.filter((id) => !directManualIds.includes(id));
  const audits = await tx.auditLog.findMany({ where: { id: { in: legacyAuditIds }, action: "MANUAL_SERVICE_CREATE" }, select: { id: true, entityId: true, metadata: true, createdAt: true } });
  const financialIds = audits.map((audit) => audit.entityId).filter((id): id is string => Boolean(id));
  const services = await tx.service.findMany();
  const serviceById = new Map(services.map((service) => [service.id, service]));
  for (const audit of audits) {
    const metadata = parseAuditMetadata(audit.metadata);
    const barberId = typeof metadata.barberId === "string" ? metadata.barberId : "";
    const serviceIds = Array.isArray(metadata.serviceIds) ? metadata.serviceIds.filter((id): id is string => typeof id === "string") : [];
    const total = serviceIds.reduce((sum, id) => sum + toNumber(serviceById.get(id)?.price), 0);
    const commissionAmount = total * 0.5;
    const lower = new Date(audit.createdAt);
    lower.setMinutes(lower.getMinutes() - 5);
    const upper = new Date(audit.createdAt);
    upper.setMinutes(upper.getMinutes() + 2);
    const commission = await tx.employeeCommission.findFirst({
      where: {
        barberId,
        appointmentId: null,
        saleId: null,
        amount: commissionAmount,
        createdAt: { gte: lower, lte: upper }
      },
      orderBy: { createdAt: "desc" }
    });
    if (commission) await tx.employeeCommission.delete({ where: { id: commission.id } });
  }
  if (mode === "hide") {
    await tx.financialTransaction.updateMany({ where: { id: { in: financialIds } }, data: { deletedAt: new Date() } });
    const hiddenAt = new Date().toISOString();
    for (const audit of audits) {
      await tx.auditLog.update({
        where: { id: audit.id },
        data: {
          metadata: {
            ...parseAuditMetadata(audit.metadata),
            maintenanceHiddenAt: hiddenAt
          }
        }
      });
    }
    return;
  }
  await tx.financialTransaction.deleteMany({ where: { id: { in: financialIds } } });
  await tx.auditLog.deleteMany({ where: { id: { in: auditIds } } });
}

/**
 * Remove vendas/pedidos e opcionalmente devolve estoque de vendas concluidas.
 * A receita e marcada como ocultada em soft delete; itens e pagamentos so sao
 * removidos quando o modo e exclusao permanente.
 */
async function cleanSales(tx: Prisma.TransactionClient, ids: string[], mode: MaintenanceMode, restoreStock: boolean) {
  const sales = await tx.sale.findMany({ where: { id: { in: ids } }, include: { items: true } });
  if (restoreStock) {
    for (const sale of sales) {
      if (sale.status !== "COMPLETED") continue;
      for (const item of sale.items) {
        await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
        await tx.stockMovement.create({ data: { productId: item.productId, type: "RETURN", quantity: item.quantity, reason: `Manutencao removeu venda ${sale.id}` } });
      }
    }
  }
  await tx.employeeCommission.deleteMany({ where: { saleId: { in: ids } } });
  await tx.financialTransaction.updateMany({ where: financialDescriptionWhere(ids, ["Venda presencial de produtos ", "Venda de produtos "]), data: { deletedAt: new Date() } });
  if (mode === "hide") {
    await tx.sale.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date() } });
    return;
  }
  await tx.payment.deleteMany({ where: { saleId: { in: ids } } });
  await tx.sale.deleteMany({ where: { id: { in: ids } } });
}

/**
 * Limpa despesas pontuais e suas transacoes.
 * Despesas com vencimento sao preservadas pela condicao `dueDate: null` mesmo
 * que algum id protegido chegue ate esta camada.
 */
async function cleanExpenses(tx: Prisma.TransactionClient, ids: string[], mode: MaintenanceMode, developerUserId: string) {
  await assertExpenseNotLinkedToPayout(tx, ids);
  if (mode === "hide") {
    await tx.financialTransaction.updateMany({ where: { expenseId: { in: ids } }, data: { deletedAt: new Date() } });
    await tx.expense.updateMany({ where: { id: { in: ids }, dueDate: null }, data: { deletedAt: new Date(), updatedById: developerUserId } });
    return;
  }
  await tx.financialTransaction.deleteMany({ where: { expenseId: { in: ids } } });
  await tx.expense.deleteMany({ where: { id: { in: ids }, dueDate: null } });
}

/**
 * Oculta ou exclui assinaturas junto com pagamentos e entradas financeiras.
 * O soft delete precisa tocar as tres tabelas para que o dashboard financeiro
 * pare de considerar receita recorrente e movimentacoes vinculadas.
 */
async function cleanSubscriptions(tx: Prisma.TransactionClient, ids: string[], mode: MaintenanceMode) {
  const payments = await tx.payment.findMany({ where: { subscriptionId: { in: ids } }, select: { id: true } });
  const paymentIds = payments.map((payment) => payment.id);

  if (mode === "hide") {
    await tx.financialTransaction.updateMany({ where: { paymentId: { in: paymentIds } }, data: { deletedAt: new Date() } });
    await tx.payment.updateMany({ where: { id: { in: paymentIds } }, data: { deletedAt: new Date() } });
    await tx.subscription.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date() } });
    return;
  }

  await tx.financialTransaction.deleteMany({ where: { paymentId: { in: paymentIds } } });
  await tx.payment.deleteMany({ where: { id: { in: paymentIds } } });
  await tx.subscription.deleteMany({ where: { id: { in: ids } } });
}

/**
 * Limpa contas CLIENT e dados dependentes.
 * A rotina reaproveita os limpadores de agendamento e venda para manter as
 * mesmas regras de comissao, estoque e financeiro antes de ocultar o usuario.
 */
async function cleanAccounts(tx: Prisma.TransactionClient, ids: string[], mode: MaintenanceMode) {
  const users = await tx.user.findMany({ where: { id: { in: ids }, role: "CLIENT" }, include: { client: true } });
  const userIds = users.map((user) => user.id);
  const clientIds = users.map((user) => user.client?.id).filter((id): id is string => Boolean(id));
  const appointments = await tx.appointment.findMany({ where: { clientId: { in: clientIds } }, select: { id: true } });
  const sales = await tx.sale.findMany({ where: { clientId: { in: clientIds } }, select: { id: true } });
  await cleanAppointments(tx, appointments.map((appointment) => appointment.id), mode);
  await cleanSales(tx, sales.map((sale) => sale.id), mode, true);
  await tx.subscription.updateMany({ where: { clientId: { in: clientIds } }, data: { deletedAt: new Date(), active: false, status: "CANCELED" } });
  await tx.payment.deleteMany({ where: { clientId: { in: clientIds } } });
  await tx.notification.deleteMany({ where: { userId: { in: userIds } } });
  await tx.address.updateMany({ where: { userId: { in: userIds } }, data: { deletedAt: new Date() } });
  await tx.client.updateMany({ where: { id: { in: clientIds } }, data: { deletedAt: new Date() } });
  await tx.user.updateMany({ where: { id: { in: userIds } }, data: { deletedAt: new Date(), active: false } });
  if (mode === "delete") {
    await tx.address.deleteMany({ where: { userId: { in: userIds } } });
    await tx.client.deleteMany({ where: { id: { in: clientIds } } });
    await tx.auditLog.updateMany({ where: { userId: { in: userIds } }, data: { userId: null } });
    await tx.user.deleteMany({ where: { id: { in: userIds }, role: "CLIENT" } });
  }
}

/**
 * Restaura agendamentos ocultos e recria comissao faltante de finalizados.
 */
async function restoreAppointments(tx: Prisma.TransactionClient, ids: string[]) {
  const appointments = await tx.appointment.findMany({
    where: { id: { in: ids } },
    select: maintenanceAppointmentSelect
  });
  await tx.appointment.updateMany({ where: { id: { in: ids } }, data: { deletedAt: null } });
  await tx.financialTransaction.updateMany({ where: financialDescriptionWhere(ids, ["Atendimento finalizado: "]), data: { deletedAt: null } });

  for (const appointment of appointments) {
    if (appointment.status !== "COMPLETED" || appointment.commissions.length > 0) continue;
    const amount = appointmentFinancials(appointment).commission;
    if (amount <= 0) continue;
    await tx.employeeCommission.create({
      data: {
        barberId: appointment.barberId,
        appointmentId: appointment.id,
        amount,
        percentage: SERVICE_COMMISSION_PERCENT
      }
    });
  }
}

/**
 * Restaura atendimentos manuais novos e legados.
 * No legado, remove a marca `maintenanceHiddenAt` e recria a comissao caso nao
 * encontre uma correspondente na janela de horario.
 */
async function restoreManualServices(tx: Prisma.TransactionClient, auditIds: string[]) {
  const directManualIds = (await tx.manualService.findMany({ where: { id: { in: auditIds } }, select: { id: true } })).map((item) => item.id);
  if (directManualIds.length > 0) {
    await tx.manualService.updateMany({ where: { id: { in: directManualIds } }, data: { deletedAt: null } });
  }

  const legacyAuditIds = auditIds.filter((id) => !directManualIds.includes(id));
  const audits = await tx.auditLog.findMany({ where: { id: { in: legacyAuditIds }, action: "MANUAL_SERVICE_CREATE" }, select: { id: true, entityId: true, metadata: true, createdAt: true } });
  const financialIds = audits.map((audit) => audit.entityId).filter((id): id is string => Boolean(id));
  await tx.financialTransaction.updateMany({ where: { id: { in: financialIds } }, data: { deletedAt: null } });

  const services = await tx.service.findMany();
  const serviceById = new Map(services.map((service) => [service.id, service]));
  for (const audit of audits) {
    const metadata = parseAuditMetadata(audit.metadata);
    const barberId = typeof metadata.barberId === "string" ? metadata.barberId : "";
    const serviceIds = Array.isArray(metadata.serviceIds) ? metadata.serviceIds.filter((id): id is string => typeof id === "string") : [];
    const total = serviceIds.reduce((sum, id) => sum + toNumber(serviceById.get(id)?.price), 0);
    const commissionAmount = total * (SERVICE_COMMISSION_PERCENT / 100);
    if (barberId && commissionAmount > 0) {
      const lower = new Date(audit.createdAt);
      lower.setMinutes(lower.getMinutes() - 5);
      const upper = new Date(audit.createdAt);
      upper.setMinutes(upper.getMinutes() + 5);
      const existing = await tx.employeeCommission.findFirst({
        where: { barberId, appointmentId: null, saleId: null, amount: commissionAmount, createdAt: { gte: lower, lte: upper } }
      });
      if (!existing) {
        await tx.employeeCommission.create({
          data: { barberId, amount: commissionAmount, percentage: SERVICE_COMMISSION_PERCENT }
        });
      }
    }

    const restoredMetadata = { ...metadata };
    delete restoredMetadata.maintenanceHiddenAt;
    await tx.auditLog.update({ where: { id: audit.id }, data: { metadata: restoredMetadata } });
  }
}

/**
 * Restaura vendas e recria comissao de produto quando ela nao existir.
 * A recomposicao usa a regra atual de visibilidade/lucro, portanto pode nao
 * reproduzir exatamente uma regra antiga se o cadastro do produto mudou.
 */
async function restoreSales(tx: Prisma.TransactionClient, ids: string[]) {
  const sales = await tx.sale.findMany({ where: { id: { in: ids } }, include: { items: { include: { product: true } }, commissions: true } });
  await tx.sale.updateMany({ where: { id: { in: ids } }, data: { deletedAt: null } });
  await tx.financialTransaction.updateMany({ where: financialDescriptionWhere(ids, ["Venda presencial de produtos ", "Venda de produtos "]), data: { deletedAt: null } });

  for (const sale of sales) {
    if (!sale.barberId || sale.commissions.length > 0) continue;
    const commissionAmount = productItemsCommission(sale.items);
    if (commissionAmount <= 0) continue;
    await tx.employeeCommission.create({
      data: {
        barberId: sale.barberId,
        saleId: sale.id,
        amount: commissionAmount,
        percentage: 20
      }
    });
  }
}

/**
 * Restaura despesas ocultas e suas transacoes financeiras vinculadas.
 */
async function restoreExpenses(tx: Prisma.TransactionClient, ids: string[], developerUserId: string) {
  await assertExpenseNotLinkedToPayout(tx, ids);
  await tx.expense.updateMany({ where: { id: { in: ids } }, data: { deletedAt: null, updatedById: developerUserId } });
  await tx.financialTransaction.updateMany({ where: { expenseId: { in: ids } }, data: { deletedAt: null } });
}

/**
 * Restaura assinaturas ocultas com pagamentos e transacoes associadas.
 */
async function restoreSubscriptions(tx: Prisma.TransactionClient, ids: string[]) {
  const payments = await tx.payment.findMany({ where: { subscriptionId: { in: ids } }, select: { id: true } });
  const paymentIds = payments.map((payment) => payment.id);
  await tx.subscription.updateMany({ where: { id: { in: ids } }, data: { deletedAt: null } });
  await tx.payment.updateMany({ where: { id: { in: paymentIds } }, data: { deletedAt: null } });
  await tx.financialTransaction.updateMany({ where: { paymentId: { in: paymentIds } }, data: { deletedAt: null } });
}

/**
 * Reativa contas CLIENT ocultas e seus vinculos principais.
 * Nao recria dados excluidos permanentemente; apenas remove soft delete.
 */
async function restoreAccounts(tx: Prisma.TransactionClient, ids: string[]) {
  const users = await tx.user.findMany({ where: { id: { in: ids }, role: "CLIENT" }, include: { client: true } });
  const userIds = users.map((user) => user.id);
  const clientIds = users.map((user) => user.client?.id).filter((id): id is string => Boolean(id));
  await tx.user.updateMany({ where: { id: { in: userIds }, role: "CLIENT" }, data: { deletedAt: null, active: true } });
  await tx.client.updateMany({ where: { id: { in: clientIds } }, data: { deletedAt: null } });
  await tx.address.updateMany({ where: { userId: { in: userIds } }, data: { deletedAt: null } });
}
