import { NextResponse } from "next/server";
import { getFinanceMetrics } from "@/lib/server/finance-rules";
import { calculateSubscriptionPayouts, currentCompetenceMonth } from "@/lib/server/subscription-payouts";
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

  const competenceMonth = currentCompetenceMonth();
  const [metrics, subscriptionCalculation] = await Promise.all([
    getFinanceMetrics(startDate, endDate),
    calculateSubscriptionPayouts(competenceMonth)
  ]);

  return NextResponse.json({
    period,
    startDate,
    endDate,
    grossRevenue: metrics.grossRevenue,
    expensesTotal: metrics.paidExpenses,
    netProfit: metrics.netProfit,
    businessShare: metrics.grossRevenue - metrics.productCost - metrics.totalCommissions,
    subscriptionCompetenceMonth: competenceMonth,
    subscriptionDistributionIsEstimate: true,
    subscriptionBusinessShare: subscriptionCalculation.businessShare,
    barberShare: subscriptionCalculation.poolAmount,
    subscriptionDistribution: subscriptionCalculation.currentDistribution.map((item) => ({
      barberId: item.barberId,
      barberName: subscriptionCalculation.rows.find((row) => row.barberId === item.barberId)?.barberName ?? "",
      appointments: item.count,
      amount: item.amount
    }))
  });
}
