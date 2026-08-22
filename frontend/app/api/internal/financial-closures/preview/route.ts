import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  SUBSCRIPTION_BARBER_PERCENT,
  SUBSCRIPTION_BUSINESS_PERCENT,
  getFinanceMetrics,
  hasActiveSubscriptionAt
} from "@/lib/server/finance-rules";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";
import {
  addDaysInput,
  endOfSaoPauloDay,
  resolveWeeklyCashClosingRange,
  startOfSaoPauloDay,
  todayDateInput
} from "@/lib/server/date-periods";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getRange(period: string) {
  const today = todayDateInput();

  if (period === "WEEKLY") {
    const range = resolveWeeklyCashClosingRange(today);
    return { startDate: range.start, endDate: range.end };
  }

  const daysBack = period === "BIWEEKLY" ? 13 : 29;
  const startDateInput = addDaysInput(today, -daysBack);
  return {
    startDate: startOfSaoPauloDay(startDateInput),
    endDate: endOfSaoPauloDay(today)
  };
}

export async function GET(request: Request) {
  const session = await getAuthenticatedUser();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER")) {
    return NextResponse.json({ message: "Acesso não autorizado." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") ?? "WEEKLY";
  const { startDate, endDate } = getRange(period);

  const [metrics, subscriptionAppointments] = await Promise.all([
    getFinanceMetrics(startDate, endDate),
    prisma.appointment.findMany({
      where: {
        dataHora: { gte: startDate, lte: endDate },
        status: "COMPLETED",
        deletedAt: null,
        client: { subscriptions: { some: { active: true, deletedAt: null } } }
      },
      include: {
        barber: { include: { user: true } },
        client: { include: { subscriptions: { include: { subscriptionPlan: true } } } }
      }
    })
  ]);

  const subscriptionRevenueByClient = new Map<string, number>();
  const countsByBarber = new Map<string, { name: string; count: number }>();

  for (const appointment of subscriptionAppointments) {
    const activeSubscription = appointment.client.subscriptions.find((subscription) => hasActiveSubscriptionAt([subscription], appointment.dataHora));
    const subscriptionValue = activeSubscription?.subscriptionPlan.value;
    if (!subscriptionValue) continue;
    subscriptionRevenueByClient.set(appointment.clientId, Number(subscriptionValue));
    const current = countsByBarber.get(appointment.barberId) ?? { name: appointment.barber.user.name, count: 0 };
    countsByBarber.set(appointment.barberId, { ...current, count: current.count + 1 });
  }

  const subscriptionRevenue = Array.from(subscriptionRevenueByClient.values()).reduce((sum, value) => sum + value, 0);
  const barberPool = subscriptionRevenue * (SUBSCRIPTION_BARBER_PERCENT / 100);
  const totalSubscriptionAppointments = Array.from(countsByBarber.values()).reduce((sum, item) => sum + item.count, 0);

  return NextResponse.json({
    period,
    startDate,
    endDate,
    grossRevenue: metrics.grossRevenue,
    expensesTotal: metrics.paidExpenses,
    netProfit: metrics.netProfit,
    businessShare: metrics.grossRevenue - metrics.subscriptionBarberShare - metrics.productCost - metrics.productCommissions - metrics.manualServiceCommissions,
    subscriptionBusinessShare: subscriptionRevenue * (SUBSCRIPTION_BUSINESS_PERCENT / 100),
    barberShare: barberPool,
    subscriptionDistribution: Array.from(countsByBarber.entries()).map(([barberId, item]) => ({
      barberId,
      barberName: item.name,
      appointments: item.count,
      amount: totalSubscriptionAppointments > 0 ? barberPool * (item.count / totalSubscriptionAppointments) : 0
    }))
  });
}
