import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getRange(period: string) {
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);
  const startDate = new Date(endDate);

  if (period === "MONTHLY") startDate.setMonth(startDate.getMonth() - 1);
  else if (period === "BIWEEKLY") startDate.setDate(startDate.getDate() - 14);
  else startDate.setDate(startDate.getDate() - 7);

  startDate.setHours(0, 0, 0, 0);
  return { startDate, endDate };
}

export async function GET(request: Request) {
  const session = await getAuthenticatedUser();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER")) {
    return NextResponse.json({ message: "Acesso não autorizado." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") ?? "WEEKLY";
  const { startDate, endDate } = getRange(period);

  const [sales, paidExpenses, subscriptionAppointments] = await Promise.all([
    prisma.sale.findMany({ where: { createdAt: { gte: startDate, lte: endDate }, deletedAt: null }, select: { totalValue: true } }),
    prisma.expense.findMany({ where: { paidAt: { gte: startDate, lte: endDate }, deletedAt: null, status: "PAID" }, select: { amount: true } }),
    prisma.appointment.findMany({
      where: {
        dataHora: { gte: startDate, lte: endDate },
        status: "COMPLETED",
        deletedAt: null,
        client: { subscriptions: { some: { active: true, deletedAt: null } } }
      },
      include: {
        barber: { include: { user: true } },
        client: { include: { subscriptions: { where: { active: true, deletedAt: null }, include: { subscriptionPlan: true } } } }
      }
    })
  ]);

  const grossRevenue = sales.reduce((sum, sale) => sum + Number(sale.totalValue), 0);
  const expensesTotal = paidExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const subscriptionRevenueByClient = new Map<string, number>();
  const countsByBarber = new Map<string, { name: string; count: number }>();

  for (const appointment of subscriptionAppointments) {
    const subscriptionValue = appointment.client.subscriptions[0]?.subscriptionPlan.value;
    if (subscriptionValue) subscriptionRevenueByClient.set(appointment.clientId, Number(subscriptionValue));
    const current = countsByBarber.get(appointment.barberId) ?? { name: appointment.barber.user.name, count: 0 };
    countsByBarber.set(appointment.barberId, { ...current, count: current.count + 1 });
  }

  const subscriptionRevenue = Array.from(subscriptionRevenueByClient.values()).reduce((sum, value) => sum + value, 0);
  const barberPool = subscriptionRevenue * 0.4;
  const totalSubscriptionAppointments = Array.from(countsByBarber.values()).reduce((sum, item) => sum + item.count, 0);

  return NextResponse.json({
    period,
    startDate,
    endDate,
    grossRevenue: grossRevenue + subscriptionRevenue,
    expensesTotal,
    netProfit: grossRevenue + subscriptionRevenue - expensesTotal,
    businessShare: grossRevenue + subscriptionRevenue * 0.6,
    barberShare: barberPool,
    subscriptionDistribution: Array.from(countsByBarber.entries()).map(([barberId, item]) => ({
      barberId,
      barberName: item.name,
      appointments: item.count,
      amount: totalSubscriptionAppointments > 0 ? barberPool * (item.count / totalSubscriptionAppointments) : 0
    }))
  });
}
