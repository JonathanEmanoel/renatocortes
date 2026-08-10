export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { BarChart3, Scissors, Users } from "lucide-react";
import { InternalPageHeader } from "@/components/internal/internal-page-header";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  SERVICE_COMMISSION_PERCENT,
  SUBSCRIPTION_BARBER_PERCENT,
  appointmentGross,
  getSubscriptionRevenueForPeriod,
  hasActiveSubscriptionAt,
  productProfitCommission
} from "@/lib/server/finance-rules";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay() || 7;
  next.setDate(next.getDate() - day + 1);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfRange(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

export default async function AdminTeamPage() {
  const session = await getAuthenticatedUser();
  if (!session) redirect("/login?redirectTo=/admin/equipe");
  if (session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER") redirect("/cliente");

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const fortnightStart = startOfRange(14);
  const weekStart = startOfWeek(new Date());

  const barbers = await prisma.barber.findMany({
    where: { active: true, deletedAt: null },
    include: {
      user: true,
      appointments: {
        where: { status: "COMPLETED", deletedAt: null, dataHora: { gte: monthStart } },
        include: {
          service: true,
          services: true,
          client: { include: { subscriptions: true } }
        }
      },
      sales: {
        where: { status: "COMPLETED", completedAt: { gte: monthStart }, deletedAt: null },
        include: { items: true }
      },
      commissions: {
        where: { createdAt: { gte: monthStart }, appointmentId: null, saleId: null }
      }
    },
    orderBy: { user: { name: "asc" } }
  });

  const ranges = [
    { label: "Semana", start: weekStart },
    { label: "Quinzena", start: fortnightStart },
    { label: "Mes", start: monthStart }
  ];
  const subscriptionRevenueByRange = new Map(
    await Promise.all(ranges.map(async (range) => [range.label, await getSubscriptionRevenueForPeriod(range.start, new Date())] as const))
  );

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-8 text-white">
      <section className="mx-auto max-w-7xl">
        <InternalPageHeader
          eyebrow="Equipe"
          title="Desempenho dos profissionais"
          backHref="/admin"
          backLabel="Painel administrativo"
          role={session.user.role}
          hasBarber={Boolean(session.user.barber?.id)}
        />

        <div className="mt-8 grid gap-5">
          {barbers.length === 0 ? <p className="rounded-[12px] border border-primary/20 bg-card p-6 text-white/65">Nenhum barbeiro ativo.</p> : null}
          {barbers.map((barber) => (
            <article key={barber.id} className="rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <div>
                  <h2 className="text-2xl font-black uppercase">{barber.user.name}</h2>
                  <p className="mt-1 text-sm text-white/55">{barber.specialty ?? "Profissional Renato Cortes"}</p>
                </div>
                <Scissors className="h-8 w-8 text-primary" />
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {ranges.map((range) => {
                  const appointments = barber.appointments.filter((appointment) => appointment.dataHora >= range.start);
                  const commonAppointments = appointments.filter((appointment) => !hasActiveSubscriptionAt(appointment.client.subscriptions, appointment.dataHora));
                  const subscriberAppointments = appointments.filter((appointment) => hasActiveSubscriptionAt(appointment.client.subscriptions, appointment.dataHora)).length;
                  const totalSubscriberAppointments = barbers.reduce((sum, currentBarber) => {
                    return (
                      sum +
                      currentBarber.appointments.filter(
                        (appointment) => appointment.dataHora >= range.start && hasActiveSubscriptionAt(appointment.client.subscriptions, appointment.dataHora)
                      ).length
                    );
                  }, 0);
                  const serviceGross = commonAppointments.reduce((sum, appointment) => sum + appointmentGross(appointment), 0);
                  const sales = barber.sales.filter((sale) => sale.completedAt && sale.completedAt >= range.start);
                  const productGross = sales.reduce((sum, sale) => sum + Number(sale.totalValue), 0);
                  const productCost = sales.reduce(
                    (sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + Number(item.costPrice) * item.quantity, 0),
                    0
                  );
                  const commissions = barber.commissions.filter((commission) => commission.createdAt >= range.start);
                  const manualServiceCommission = commissions.reduce((sum, commission) => sum + Number(commission.amount), 0);
                  const manualServiceGross = manualServiceCommission / (SERVICE_COMMISSION_PERCENT / 100);
                  const subscriptionBarberPool = (subscriptionRevenueByRange.get(range.label) ?? 0) * (SUBSCRIPTION_BARBER_PERCENT / 100);
                  const subscriptionCommission =
                    totalSubscriberAppointments > 0 ? subscriptionBarberPool * (subscriberAppointments / totalSubscriberAppointments) : 0;
                  const gross = serviceGross + productGross + manualServiceGross;
                  const net =
                    serviceGross * (SERVICE_COMMISSION_PERCENT / 100) +
                    productProfitCommission(productGross, productCost) +
                    manualServiceCommission +
                    subscriptionCommission;
                  return (
                    <div key={range.label} className="rounded-[10px] border border-white/10 bg-black/30 p-4">
                      <p className="text-sm font-black uppercase text-primary">{range.label}</p>
                      <p className="mt-3 flex items-center gap-2 text-sm text-white/55"><BarChart3 className="h-4 w-4" /> Bruto</p>
                      <strong className="block text-xl text-white">{formatCurrency(gross)}</strong>
                      <p className="mt-3 flex items-center gap-2 text-sm text-white/55"><Users className="h-4 w-4" /> Liquido barbeiro</p>
                      <strong className="block text-xl text-primary">{formatCurrency(net)}</strong>
                      <p className="mt-3 text-sm text-white/55">Atendimentos assinantes: <strong className="text-white">{subscriberAppointments}</strong></p>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
