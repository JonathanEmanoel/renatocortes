import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

/**
 * Regras financeiras centrais usadas por dashboards, relatórios e APIs.
 *
 * Este arquivo concentra percentuais e cálculos compartilhados para evitar
 * que cada tela invente uma leitura diferente de comissão, receita ou pool.
 */
export const SERVICE_COMMISSION_PERCENT = 50;
export const PRODUCT_PROFIT_COMMISSION_PERCENT = 20;
export const SUBSCRIPTION_BUSINESS_PERCENT = 60;
export const SUBSCRIPTION_BARBER_PERCENT = 40;

type AppointmentLike = {
  service: { price: unknown };
  services?: { price: unknown }[];
};

type SubscriptionLike = {
  active: boolean;
  status: string;
  startDate: Date;
  endDate: Date | null;
  deletedAt?: Date | null;
};

/**
 * Soma precos registrados nos itens, sem cobrar novamente o servico principal.
 * Agendamentos antigos sem itens usam o preco da relacao service como fallback.
 * Nao decide status nem cobertura de plano; essas decisoes cabem ao consumidor.
 */
export function appointmentGross(appointment: AppointmentLike) {
  const services = appointment.services ?? [];
  if (services.length > 0) return services.reduce((sum, item) => sum + Number(item.price), 0);
  return Number(appointment.service.price);
}

/**
 * Calcula 20% do lucro positivo, e nao do faturamento bruto.
 * Prejuizo resulta em zero, evitando criar comissao negativa para o barbeiro.
 */
export function productProfitCommission(gross: number, cost: number) {
  return Math.max(0, gross - cost) * (PRODUCT_PROFIT_COMMISSION_PERCENT / 100);
}

/**
 * Soma receita e custo dos itens elegiveis antes de aplicar a comissao.
 * visibleInStore=false exclui consumo interno. Produto ausente continua elegivel
 * neste helper; chamadores com relacao carregada usam a visibilidade atual.
 * O piso zero e aplicado ao lucro agregado, nao separadamente a cada item.
 */
export function productItemsCommission(
  items: { quantity: number; price: unknown; costPrice: unknown; product?: { visibleInStore: boolean } | null }[]
) {
  // Produtos ocultos da loja do cliente são vendidos presencialmente, mas não
  // geram comissão para o barbeiro; o lucro fica integralmente para a barbearia.
  const commissionableItems = items.filter((item) => item.product?.visibleInStore !== false);
  const gross = commissionableItems.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  const cost = commissionableItems.reduce((sum, item) => sum + Number(item.costPrice) * item.quantity, 0);
  return productProfitCommission(gross, cost);
}

/**
 * Verifica vigencia inclusiva e estado atual ACTIVE, active e nao oculto.
 * endDate nulo nao limita o fim. Nao reconstroi mudancas historicas de status:
 * uma assinatura hoje inativa nao e aceita, mesmo para uma data passada.
 */
export function hasActiveSubscriptionAt(subscriptions: SubscriptionLike[], date: Date) {
  // A validade da assinatura é sempre avaliada na data real do atendimento,
  // permitindo lançamentos retroativos sem mover produção para o dia do cadastro.
  return subscriptions.some((subscription) => {
    if (!subscription.active || subscription.status !== "ACTIVE" || subscription.deletedAt) return false;
    return subscription.startDate <= date && (!subscription.endDate || subscription.endDate >= date);
  });
}

const appointmentSnapshotSchema = z.object({
  version: z.literal(1),
  plan: z.string(),
  services: z.array(z.object({ id: z.string(), name: z.string(), price: z.number().nonnegative(), covered: z.boolean() })).min(1)
});

type FinancialAppointment = {
  dataHora: Date;
  financialSnapshot?: unknown;
  service: { id: string; name: string; price: unknown };
  services: { serviceId: string; price: unknown; service: { name: string } }[];
  client: { subscriptions: (SubscriptionLike & { subscriptionPlan: { name: string; services: { serviceId: string }[] } })[] };
};

const financialAppointmentSelect = {
  dataHora: true,
  service: { select: { id: true, name: true, price: true } },
  services: { select: { serviceId: true, price: true, service: { select: { name: true } } } },
  client: {
    select: {
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
  }
} as const;

/** Fonte comum de cobertura, extras e comissao. Finalizados novos usam o snapshot salvo. */
export function appointmentFinancials(appointment: FinancialAppointment) {
  const subscription = appointment.client.subscriptions.find((item) => hasActiveSubscriptionAt([item], appointment.dataHora));
  const coveredIds = new Set(subscription?.subscriptionPlan.services.map((item) => item.serviceId) ?? []);
  const services = appointment.services.length
    ? appointment.services.map((item) => ({ id: item.serviceId, name: item.service.name, price: Number(item.price), covered: coveredIds.has(item.serviceId) }))
    : [{ id: appointment.service.id, name: appointment.service.name, price: Number(appointment.service.price), covered: coveredIds.has(appointment.service.id) }];
  const snapshot = appointmentSnapshotSchema.parse(appointment.financialSnapshot ?? {
    version: 1, plan: subscription?.subscriptionPlan.name ?? "", services
  });
  const covered = snapshot.services.filter((item) => item.covered);
  const extra = snapshot.services.filter((item) => !item.covered);
  const chargedGross = extra.reduce((sum, item) => sum + Math.round(item.price * 100), 0) / 100;
  return {
    snapshot, covered, extra, plan: snapshot.plan,
    names: snapshot.services.map((item) => item.name).join(" + "),
    hasCoveredVisit: covered.length > 0,
    chargedGross,
    commission: chargedGross * (SERVICE_COMMISSION_PERCENT / 100)
  };
}

/**
 * Base de receita usada pelo financeiro e rateio: um valor atual de plano por
 * assinatura ACTIVE, ativa e visivel cuja vigencia intersecta o intervalo.
 * Pendentes/recusadas nao entram. Nao soma pagamentos, nao faz pro-rata e nao
 * multiplica pelo numero de meses; intervalos distintos podem incluir o mesmo
 * plano. Essa semantica deve ser distinguida de recebimentos por paidAt.
 */
export async function getSubscriptionRevenueForPeriod(startDate: Date, endDate: Date, db: Prisma.TransactionClient = prisma) {
  // Mantém a base histórica atual do projeto: assinaturas ativas no período
  // contribuem pelo valor do plano vinculado à assinatura.
  const subscriptions = await db.subscription.findMany({
    where: {
      status: "ACTIVE",
      active: true,
      deletedAt: null,
      startDate: { lte: endDate },
      OR: [{ endDate: null }, { endDate: { gte: startDate } }]
    },
    include: { subscriptionPlan: true }
  });

  return subscriptions.reduce((sum, subscription) => sum + Number(subscription.subscriptionPlan.value), 0);
}

/**
 * Compoe totais dos paineis combinando transacoes, producao e base de assinaturas.
 * Avulsos usam serviceDate; agendamentos dataHora; vendas completedAt; despesas
 * paidAt. Legados e demais transacoes usam createdAt. Portanto nao e uma soma
 * indiscriminada do livro de transacoes nem exclusivamente recebimentos pagos.
 * O pool estimado de 40% nao e deduzido: repasses entram como despesas PAID,
 * preservando a separacao entre atendimento e pagamento ao profissional.
 */
export async function getFinanceMetrics(startDate: Date, endDate: Date) {
  /**
   * Despesas realizadas usam PAID. Receitas combinam as origens abaixo, incluindo
   * a base de vigencia das assinaturas, que nao consulta pagamentos individuais.
   */
  const [incomeTransactions, completedAppointments, paidExpenses, completedSales, manualCommissions, manualServices, subscriptionRevenue] = await Promise.all([
    // Assinaturas sao calculadas pela vigencia, e agendamentos pelo modelo proprio.
    // Excluir seus lancamentos evita soma dupla dessas duas fontes. Outras
    // receitas dependem de o fluxo de origem manter as transacoes consistentes.
    prisma.financialTransaction.findMany({
      where: {
        type: "INCOME",
        createdAt: { gte: startDate, lte: endDate },
        deletedAt: null,
        OR: [{ paymentId: null }, { payment: { subscriptionId: null } }],
        NOT: { description: { startsWith: "Atendimento finalizado:" } }
      },
      select: { amount: true }
    }),
    prisma.appointment.findMany({
      where: { status: "COMPLETED", dataHora: { gte: startDate, lte: endDate }, deletedAt: null },
      select: financialAppointmentSelect
    }),
    prisma.expense.findMany({
      where: { status: "PAID", paidAt: { gte: startDate, lte: endDate }, deletedAt: null },
      select: { amount: true }
    }),
    prisma.sale.findMany({
      where: { status: "COMPLETED", completedAt: { gte: startDate, lte: endDate }, deletedAt: null },
      include: { items: { include: { product: true } } }
    }),
    prisma.employeeCommission.findMany({
      where: { createdAt: { gte: startDate, lte: endDate }, appointmentId: null, saleId: null },
      select: { amount: true }
    }),
    prisma.manualService.findMany({
      where: { serviceDate: { gte: startDate, lte: endDate }, deletedAt: null },
      include: { items: true }
    }),
    getSubscriptionRevenueForPeriod(startDate, endDate)
  ]);

  const transactionRevenue = incomeTransactions.reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const appointmentRevenue = completedAppointments.reduce((sum, appointment) => sum + appointmentFinancials(appointment).chargedGross, 0);
  const appointmentCommissions = completedAppointments.reduce((sum, appointment) => sum + appointmentFinancials(appointment).commission, 0);
  const paidExpenseTotal = paidExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const productCost = completedSales.reduce(
    (sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + Number(item.costPrice) * item.quantity, 0),
    0
  );
  const productCommissions = completedSales.reduce((sum, sale) => {
    if (!sale.barberId) return sum;
    return sum + productItemsCommission(sale.items);
  }, 0);
  // chargedUnitPrice e zero nos itens cobertos; apenas extras/avulsos pagos
  // entram na base de 50%. Itens do plano aumentam participacao, nao comissao aqui.
  const newManualServiceRevenue = manualServices.reduce(
    (sum, manualService) =>
      sum + manualService.items.reduce((itemSum, item) => itemSum + Number(item.chargedUnitPrice) * item.quantity, 0),
    0
  );
  const newManualServiceCommissions = newManualServiceRevenue * (SERVICE_COMMISSION_PERCENT / 100);
  const manualServiceCommissions = manualCommissions.reduce((sum, commission) => sum + Number(commission.amount), 0) + newManualServiceCommissions;
  const subscriptionBarberShare = subscriptionRevenue * (SUBSCRIPTION_BARBER_PERCENT / 100);
  const grossRevenue = transactionRevenue + appointmentRevenue + newManualServiceRevenue + subscriptionRevenue;
  const totalCommissions = productCommissions + manualServiceCommissions + appointmentCommissions;

  return {
    grossRevenue,
    paidExpenses: paidExpenseTotal,
    productCost,
    productCommissions,
    appointmentCommissions,
    manualServiceCommissions,
    subscriptionRevenue,
    subscriptionBarberShare,
    totalCommissions,
    netProfit: grossRevenue - paidExpenseTotal - productCost - totalCommissions
  };
}
