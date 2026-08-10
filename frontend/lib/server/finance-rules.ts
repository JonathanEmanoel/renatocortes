import { prisma } from "@/lib/prisma";

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

export function appointmentGross(appointment: AppointmentLike) {
  const services = appointment.services ?? [];
  if (services.length > 0) return services.reduce((sum, item) => sum + Number(item.price), 0);
  return Number(appointment.service.price);
}

export function productProfitCommission(gross: number, cost: number) {
  return Math.max(0, gross - cost) * (PRODUCT_PROFIT_COMMISSION_PERCENT / 100);
}

export function hasActiveSubscriptionAt(subscriptions: SubscriptionLike[], date: Date) {
  return subscriptions.some((subscription) => {
    if (!subscription.active || subscription.status !== "ACTIVE" || subscription.deletedAt) return false;
    return subscription.startDate <= date && (!subscription.endDate || subscription.endDate >= date);
  });
}

export async function getSubscriptionRevenueForPeriod(startDate: Date, endDate: Date) {
  const subscriptions = await prisma.subscription.findMany({
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

export async function getFinanceMetrics(startDate: Date, endDate: Date) {
  const [incomeTransactions, paidExpenses, completedSales, manualCommissions, subscriptionRevenue] = await Promise.all([
    prisma.financialTransaction.findMany({
      where: { type: "INCOME", createdAt: { gte: startDate, lte: endDate }, deletedAt: null },
      select: { amount: true }
    }),
    prisma.expense.findMany({
      where: { status: "PAID", paidAt: { gte: startDate, lte: endDate }, deletedAt: null },
      select: { amount: true }
    }),
    prisma.sale.findMany({
      where: { status: "COMPLETED", completedAt: { gte: startDate, lte: endDate }, deletedAt: null },
      include: { items: true }
    }),
    prisma.employeeCommission.findMany({
      where: { createdAt: { gte: startDate, lte: endDate }, appointmentId: null, saleId: null },
      select: { amount: true }
    }),
    getSubscriptionRevenueForPeriod(startDate, endDate)
  ]);

  const transactionRevenue = incomeTransactions.reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const paidExpenseTotal = paidExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const productCost = completedSales.reduce(
    (sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + Number(item.costPrice) * item.quantity, 0),
    0
  );
  const productCommissions = completedSales.reduce((sum, sale) => {
    if (!sale.barberId) return sum;
    const gross = Number(sale.totalValue);
    const cost = sale.items.reduce((itemSum, item) => itemSum + Number(item.costPrice) * item.quantity, 0);
    return sum + productProfitCommission(gross, cost);
  }, 0);
  const manualServiceCommissions = manualCommissions.reduce((sum, commission) => sum + Number(commission.amount), 0);
  const subscriptionBarberShare = subscriptionRevenue * (SUBSCRIPTION_BARBER_PERCENT / 100);
  const grossRevenue = transactionRevenue + subscriptionRevenue;
  const totalCommissions = productCommissions + manualServiceCommissions + subscriptionBarberShare;

  return {
    grossRevenue,
    paidExpenses: paidExpenseTotal,
    productCost,
    productCommissions,
    manualServiceCommissions,
    subscriptionRevenue,
    subscriptionBarberShare,
    totalCommissions,
    netProfit: grossRevenue - paidExpenseTotal - productCost - totalCommissions
  };
}
