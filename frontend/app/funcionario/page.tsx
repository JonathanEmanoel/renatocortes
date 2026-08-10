export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import Link from "next/link";
import { BarChart3, CalendarClock, CalendarDays, Clock, Scissors, Users } from "lucide-react";
import { AppointmentActionButtons } from "@/components/internal/appointment-action-buttons";
import { InternalPageHeader } from "@/components/internal/internal-page-header";
import { ManualProductSaleForm } from "@/components/internal/manual-product-sale-form";
import { ManualServiceForm } from "@/components/internal/manual-service-form";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { SERVICE_COMMISSION_PERCENT, appointmentGross, hasActiveSubscriptionAt, productProfitCommission } from "@/lib/server/finance-rules";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay() || 7;
  next.setDate(next.getDate() - day + 1);
  next.setHours(0, 0, 0, 0);
  return next;
}

function appointmentRevenue(appointment: { service: { price: unknown }; services?: { price: unknown }[] }) {
  return appointmentGross(appointment);
}

function appointmentServicesLabel(appointment: { service: { name: string }; services?: { service: { name: string } }[] }) {
  const services = appointment.services ?? [];
  if (services.length > 0) return services.map((item) => item.service.name).join(" + ");
  return appointment.service.name;
}

function dailySeries(appointments: { dataHora: Date; service: { price: unknown }; services?: { price: unknown }[] }[]) {
  return Array.from({ length: 7 }).map((_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    const dayAppointments = appointments.filter((appointment) => appointment.dataHora.toISOString().slice(0, 10) === key);
    return {
      label: date.toLocaleDateString("pt-BR", { weekday: "short" }),
      count: dayAppointments.length,
      revenue: dayAppointments.reduce((sum, appointment) => sum + appointmentRevenue(appointment), 0)
    };
  });
}

export default async function BarberPanelPage() {
  const session = await getAuthenticatedUser();

  if (!session) redirect("/login?redirectTo=/funcionario");
  if (session.user.role !== "BARBER" && session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER") redirect("/cliente");

  const barberId = session.user.barber?.id;
  if (!barberId) redirect("/admin");

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const weekStart = startOfWeek(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const last30Days = new Date(now);
  last30Days.setDate(last30Days.getDate() - 30);

  const [
    todayAppointments,
    weekAppointmentsCount,
    monthAppointmentsCount,
    todayClients,
    monthClients,
    commissions,
    monthProductSales,
    weekAppointments,
    monthAppointments,
    upcomingAppointments,
    availabilityDays,
    serviceOptions,
    productOptions
  ] = await Promise.all([
    prisma.appointment.findMany({
      where: { barberId, dataHora: { gte: todayStart, lt: todayEnd }, deletedAt: null },
      include: { client: { include: { user: true, subscriptions: { where: { active: true, deletedAt: null } } } }, service: true, services: { include: { service: true } } },
      orderBy: { dataHora: "asc" },
      take: 10
    }),
    prisma.appointment.count({ where: { barberId, dataHora: { gte: weekStart }, deletedAt: null } }),
    prisma.appointment.count({ where: { barberId, dataHora: { gte: monthStart, lt: monthEnd }, deletedAt: null } }),
    prisma.appointment.findMany({
      where: { barberId, dataHora: { gte: todayStart, lt: todayEnd }, status: "COMPLETED", deletedAt: null },
      distinct: ["clientId"],
      select: { clientId: true }
    }),
    prisma.appointment.findMany({
      where: { barberId, dataHora: { gte: monthStart, lt: monthEnd }, status: "COMPLETED", deletedAt: null },
      distinct: ["clientId"],
      select: { clientId: true }
    }),
    prisma.employeeCommission.findMany({
      where: { barberId, createdAt: { gte: monthStart }, appointmentId: null, saleId: null },
      select: { amount: true, createdAt: true }
    }),
    prisma.sale.findMany({
      where: { barberId, status: "COMPLETED", completedAt: { gte: monthStart, lt: monthEnd }, deletedAt: null },
      include: { items: true }
    }),
    prisma.appointment.findMany({
      where: { barberId, dataHora: { gte: weekStart }, status: "COMPLETED", deletedAt: null },
      include: { service: true, services: true, client: { include: { subscriptions: true } } }
    }),
    prisma.appointment.findMany({
      where: { barberId, dataHora: { gte: last30Days }, status: "COMPLETED", deletedAt: null },
      include: { service: true, services: true, client: { include: { subscriptions: true } } }
    }),
    prisma.appointment.findMany({
      where: { barberId, dataHora: { gte: now }, status: { in: ["PENDING", "CONFIRMED"] }, deletedAt: null },
      include: { client: { include: { user: true, subscriptions: { where: { active: true, deletedAt: null } } } }, service: true, services: { include: { service: true } } },
      orderBy: { dataHora: "asc" },
      take: 8
    }),
    prisma.barberAvailability.findMany({
      where: { barberId, active: true, deletedAt: null },
      orderBy: { weekDay: "asc" }
    }),
    prisma.service.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { name: "asc" }
    }),
    prisma.product.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { name: "asc" }
    })
  ]);

  const manualServiceCommission = commissions.reduce((sum, commission) => sum + Number(commission.amount), 0);
  const weekManualServiceCommission = commissions
    .filter((commission) => commission.createdAt >= weekStart)
    .reduce((sum, commission) => sum + Number(commission.amount), 0);
  const manualServiceGross = manualServiceCommission / (SERVICE_COMMISSION_PERCENT / 100);
  const weekManualServiceGross = weekManualServiceCommission / (SERVICE_COMMISSION_PERCENT / 100);
  const monthCommonAppointments = monthAppointments.filter((appointment) => !hasActiveSubscriptionAt(appointment.client.subscriptions, appointment.dataHora));
  const monthServiceRevenue = monthCommonAppointments.reduce((sum, appointment) => sum + appointmentRevenue(appointment), 0);
  const monthProductGross = monthProductSales.reduce((sum, sale) => sum + Number(sale.totalValue), 0);
  const monthProductCost = monthProductSales.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + Number(item.costPrice) * item.quantity, 0), 0);
  const weekProductGross = monthProductSales
    .filter((sale) => sale.completedAt && sale.completedAt >= weekStart)
    .reduce((sum, sale) => sum + Number(sale.totalValue), 0);
  const commissionTotal =
    monthServiceRevenue * (SERVICE_COMMISSION_PERCENT / 100) +
    productProfitCommission(monthProductGross, monthProductCost) +
    manualServiceCommission;
  const weekRevenue = weekAppointments
    .filter((appointment) => !hasActiveSubscriptionAt(appointment.client.subscriptions, appointment.dataHora))
    .reduce((sum, appointment) => sum + appointmentRevenue(appointment), 0) + weekManualServiceGross + weekProductGross;
  const monthRevenue = monthServiceRevenue + monthProductGross + manualServiceGross;
  const series = dailySeries(monthAppointments);
  const maxSeriesValue = Math.max(...series.map((item) => item.count), 1);
  const nextAppointment = upcomingAppointments[0];

  const stats = [
    { label: "Agendamentos hoje", value: todayAppointments.length, icon: CalendarDays },
    { label: "Agendamentos semana", value: weekAppointmentsCount, icon: CalendarDays },
    { label: "Agendamentos mês", value: monthAppointmentsCount, icon: CalendarDays },
    { label: "Clientes hoje", value: todayClients.length, icon: Users },
    { label: "Clientes mês", value: monthClients.length, icon: Users },
    { label: "Comissão acumulada", value: formatCurrency(commissionTotal), icon: BarChart3 },
    { label: "Faturamento semana", value: formatCurrency(weekRevenue), icon: BarChart3 },
    { label: "Faturamento mês", value: formatCurrency(monthRevenue), icon: BarChart3 }
  ];

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-8 text-white">
      <section className="mx-auto max-w-6xl">
        <InternalPageHeader
          eyebrow="Painel do barbeiro"
          title={`Ola, ${session.user.name}`}
          backHref="/funcionario"
          backLabel="Painel do barbeiro"
          role={session.user.role}
          hasBarber={Boolean(session.user.barber?.id)}
        />

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <article key={stat.label} className="rounded-[12px] border border-primary/20 bg-card p-5 shadow-panel">
              <stat.icon className="h-7 w-7 text-primary" />
              <p className="mt-4 text-sm uppercase text-white/55">{stat.label}</p>
              <strong className="mt-2 block text-2xl text-primary">{stat.value}</strong>
            </article>
          ))}
        </div>

        <section className="mt-8 rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
            <div className="flex min-w-0 gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] border border-primary/30 bg-primary/10 text-primary">
                <CalendarClock className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">Minha agenda</p>
                <h2 className="mt-1 text-2xl font-black uppercase">Gerenciar disponibilidade</h2>
                <p className="mt-2 text-sm text-white/60">
                  Defina os dias e horarios em que voce atende. Essas configuracoes aparecem para os clientes no agendamento.
                </p>
                <p className="mt-3 text-sm font-bold text-white/70">
                  {availabilityDays.length} dia(s) ativo(s) nesta agenda
                </p>
              </div>
            </div>
            <Link
              href="/funcionario/disponibilidade"
              className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-[10px] bg-primary px-5 text-sm font-black uppercase text-black transition hover:bg-primary/90"
            >
              Alterar disponibilidade
            </Link>
          </div>
        </section>

        <section className="mt-8 rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
          <div className="flex items-center gap-3">
            <Scissors className="h-6 w-6 text-primary" />
            <h2 className="text-xl font-black uppercase">Próximo cliente</h2>
          </div>
          {nextAppointment ? (
            <article className="mt-5 rounded-[10px] border border-white/10 bg-black/30 p-4">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                <div>
                  <p className="font-black uppercase">{nextAppointment.client.user.name}</p>
                  <p className="mt-1 text-sm text-white/60">{appointmentServicesLabel(nextAppointment)}</p>
                  {nextAppointment.client.subscriptions.length > 0 ? (
                    <span className="mt-2 inline-flex rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-black uppercase text-primary">
                      Cliente assinante
                    </span>
                  ) : null}
                </div>
                <div className="text-sm text-white/65 md:text-right">
                  <p>{nextAppointment.dataHora.toLocaleDateString("pt-BR")}</p>
                  <p className="flex items-center gap-2 font-black text-primary md:justify-end">
                    <Clock className="h-4 w-4" />
                    {nextAppointment.dataHora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="mt-1 uppercase">{nextAppointment.status}</p>
                </div>
              </div>
            </article>
          ) : (
            <p className="mt-5 text-white/65">Nenhum próximo agendamento.</p>
          )}
        </section>

        <section className="mt-8 rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
          <h2 className="text-xl font-black uppercase">Cortes por dia</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-7">
            {series.map((item) => (
              <div key={item.label} className="rounded-[10px] border border-white/10 bg-black/30 p-3 text-center">
                <div className="mx-auto flex h-28 w-8 items-end rounded-full bg-white/10">
                  <div className="w-full rounded-full bg-primary" style={{ height: `${Math.max(8, (item.count / maxSeriesValue) * 100)}%` }} />
                </div>
                <p className="mt-3 text-xs uppercase text-white/55">{item.label}</p>
                <strong className="text-primary">{item.count}</strong>
                <p className="text-[11px] text-white/45">{formatCurrency(item.revenue)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
          <h2 className="text-xl font-black uppercase">Agenda</h2>
          <div className="mt-5 grid gap-4">
            {upcomingAppointments.length === 0 ? <p className="text-white/65">Nenhum próximo agendamento.</p> : null}
            {upcomingAppointments.map((appointment) => (
              <article key={appointment.id} className="rounded-[10px] border border-white/10 bg-black/30 p-4">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                  <div>
                    <p className="font-black uppercase">{appointment.client.user.name}</p>
                    <p className="mt-1 text-sm text-white/60">{appointmentServicesLabel(appointment)}</p>
                    {appointment.client.subscriptions.length > 0 ? (
                      <span className="mt-2 inline-flex rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-black uppercase text-primary">
                        Cliente assinante
                      </span>
                    ) : null}
                  </div>
                  <div className="text-sm text-white/65 md:text-right">
                    <p>{appointment.dataHora.toLocaleDateString("pt-BR")}</p>
                    <p className="font-black text-primary">{appointment.dataHora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
                    <p className="mt-1 uppercase">{appointment.status}</p>
                  </div>
                </div>
                <AppointmentActionButtons appointmentId={appointment.id} status={appointment.status} />
              </article>
            ))}
          </div>
        </section>

        <div className="mt-8">
          <ManualServiceForm
            services={serviceOptions.map((service) => ({ id: service.id, name: service.name, price: Number(service.price) }))}
            barbers={[{ id: barberId, name: session.user.name }]}
            defaultBarberId={barberId}
          />
        </div>
        <div className="mt-8">
          <ManualProductSaleForm
            products={productOptions.map((product) => ({
              id: product.id,
              name: product.name,
              price: Number(product.price),
              stock: product.stock,
              active: product.active,
              visibleInStore: product.visibleInStore
            }))}
          />
        </div>
      </section>
    </main>
  );
}
