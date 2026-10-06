import { getAuthenticatedUser } from "@/lib/server/internal-auth";
import { calculateSubscriptionPayouts, currentCompetenceMonth } from "@/lib/server/subscription-payouts";

/** Monthly read-only projection bound to the authenticated professional. */
export async function getOwnSubscriptionEstimate(competenceMonth = currentCompetenceMonth()) {
  const user = (await getAuthenticatedUser())?.user;
  if (!user || !["BARBER", "ADMIN", "DEVELOPER"].includes(user.role) || !user.barber?.id) throw new Error("Acesso restrito ao proprio barbeiro.");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competenceMonth) || competenceMonth > currentCompetenceMonth()) throw new Error("Competencia invalida ou futura.");
  const calculation = await calculateSubscriptionPayouts(competenceMonth);
  return projectBarberSubscriptionEstimate(calculation, user.barber.id);
}

/** Projects one professional from the shared calculation; authentication stays at the entry point. */
export function projectBarberSubscriptionEstimate(calculation: Awaited<ReturnType<typeof calculateSubscriptionPayouts>>, barberId: string) {
  const distribution = calculation.currentDistribution.find((row) => row.barberId === barberId);
  const rows = calculation.rows.filter((row) => row.barberId === barberId);
  const main = rows.find((row) => row.type === "MAIN");
  const paid = rows.filter((row) => row.status === "PAID");
  return {
    competenceMonth: calculation.competenceMonth,
    label: calculation.label,
    attendances: main?.status === "PAID" ? main.subscriberAttendances : distribution?.count ?? 0,
    sharePercent: main?.status === "PAID" ? main.sharePercent : calculation.totalAttendances > 0 ? ((distribution?.count ?? 0) / calculation.totalAttendances) * 100 : 0,
    estimatedAmount: main?.status === "PAID" ? 0 : main?.calculatedAmount ?? 0,
    paidAmount: paid.reduce((sum, row) => sum + row.paidAmount, 0),
    paidAt: paid.reduce<Date | null>((latest, row) => row.paidAt && (!latest || row.paidAt > latest) ? row.paidAt : latest, null),
    isPaid: main?.status === "PAID",
    pendingAdjustment: rows.filter((row) => row.type === "ADJUSTMENT" && row.status === "PENDING").reduce((sum, row) => sum + row.calculatedAmount, 0),
    needsReview: rows.some((row) => row.status === "REVIEW")
  };
}
export type BarberSubscriptionEstimate = Awaited<ReturnType<typeof getOwnSubscriptionEstimate>>;
