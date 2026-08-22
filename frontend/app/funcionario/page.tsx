export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import Link from "next/link";
import {
  BarChart3,
  CalendarClock,
  CalendarDays,
  Clock,
  Package,
  ReceiptText,
  Scissors,
  TrendingUp,
  Users
} from "lucide-react";
import { AppointmentActionButtons } from "@/components/internal/appointment-action-buttons";
import { BarberPanelActionTabs } from "@/components/internal/barber-panel-action-tabs";
import { InternalPageHeader } from "@/components/internal/internal-page-header";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getBarberDailySeries, getBarberReport, reportTypeOptions } from "@/lib/server/barber-report";
import { endOfSaoPauloDay, startOfSaoPauloDay, todayDateInput } from "@/lib/server/date-periods";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";
import { cn } from "@/utils/cn";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type PeriodKey = "today" | "week" | "fortnight" | "month" | "custom";

const periodOptions: { key: PeriodKey; label: string; reportPeriod: string }[] = [
  { key: "today", label: "Hoje", reportPeriod: "today" },
  { key: "week", label: "Semana", reportPeriod: "week-current" },
  { key: "fortnight", label: "Quinzena", reportPeriod: "fortnight-current" },
  { key: "month", label: "Mes", reportPeriod: "month-current" },
  { key: "custom", label: "Personalizado", reportPeriod: "custom" }
];

function appointmentServicesLabel(appointment: { service: { name: string }; services?: { service: { name: string } }[] }) {
  const services = appointment.services ?? [];
  if (services.length > 0) return services.map((item) => item.service.name).join(" + ");
  return appointment.service.name;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING: "Pendente",
    CONFIRMED: "Confirmado",
    COMPLETED: "Concluido",
    CANCELED: "Cancelado",
    REJECTED: "Recusado",
    NO_SHOW: "Nao compareceu"
  };
  return labels[status] ?? status;
}

function hrefForPeriod(period: PeriodKey, startDate?: string, endDate?: string) {
  const params = new URLSearchParams({ period });
  if (period === "custom") {
    params.set("startDate", startDate ?? todayDateInput());
    params.set("endDate", endDate ?? startDate ?? todayDateInput());
  }
  return `/funcionario?${params.toString()}`;
}

function distinctAttendedClients(report: Awaited<ReturnType<typeof getBarberReport>>) {
  const clients = new Set<string>();
  let unnamedManual = 0;

  report.sections.site
    .filter((row) => row.status === "COMPLETED" && row.financialGross > 0)
    .forEach((row) => clients.add(row.client.toLowerCase()));
  report.sections.subscription
    .filter((row) => row.status === "COMPLETED")
    .forEach((row) => clients.add(row.client.toLowerCase()));
  report.sections.manual.forEach((row) => {
    if (row.client && row.client !== "Nao informado") clients.add(row.client.toLowerCase());
    else unnamedManual += 1;
  });

  return clients.size + unnamedManual;
}

export default async function BarberPanelPage({ searchParams }: PageProps) {
  const session = await getAuthenticatedUser();

  if (!session) redirect("/login?redirectTo=/funcionario");
  if (session.user.role !== "BARBER" && session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER") redirect("/cliente");

  const barberId = session.user.barber?.id;
  if (!barberId) redirect("/admin");

  const params = (await searchParams) ?? {};
  const requestedPeriod = Array.isArray(params.period) ? params.period[0] : params.period;
  const selectedPeriod: PeriodKey = requestedPeriod === "today" || requestedPeriod === "week" || requestedPeriod === "fortnight" || requestedPeriod === "month" || requestedPeriod === "custom"
    ? requestedPeriod
    : "today";
  const periodConfig = periodOptions.find((period) => period.key === selectedPeriod) ?? periodOptions[0];

  const now = new Date();
  const today = todayDateInput();
  const todayStart = startOfSaoPauloDay(today);
  const todayEnd = endOfSaoPauloDay(today);
  const requestedStartDate = Array.isArray(params.startDate) ? params.startDate[0] : params.startDate;
  const requestedEndDate = Array.isArray(params.endDate) ? params.endDate[0] : params.endDate;
  const customStartDate = requestedStartDate || today;
  const customEndDate = requestedEndDate || customStartDate;

  const reportFilters = {
    barberId,
    period: periodConfig.reportPeriod,
    startDate: selectedPeriod === "custom" ? customStartDate : undefined,
    endDate: selectedPeriod === "custom" ? customEndDate : undefined,
    types: [...reportTypeOptions],
    productType: "all" as const,
    commission: "all" as const
  };

  const report = await getBarberReport(reportFilters);
  const [
    todayAppointments,
    availabilityDays,
    serviceOptions,
    productOptions
  ] = await Promise.all([
    prisma.appointment.findMany({
      where: { barberId, dataHora: { gte: todayStart, lte: todayEnd }, deletedAt: null },
      include: { client: { include: { user: true, subscriptions: { where: { active: true, deletedAt: null } } } }, service: true, services: { include: { service: true } } },
      orderBy: { dataHora: "asc" },
      take: 20
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

  const completedSiteRows = report.sections.site.filter((row) => row.status === "COMPLETED" && row.financialGross > 0);
  const salesWithCommission = report.sections.sales.filter((row) => row.commission > 0);
  const salesWithoutCommission = report.sections.sales.filter((row) => row.commission === 0);
  const producedAppointments = completedSiteRows.length + report.summary.manualCount + report.summary.subscriptionBarberAppointments;
  const attendedClients = distinctAttendedClients(report);
  const nextAppointment = todayAppointments.find((appointment) => ["PENDING", "CONFIRMED"].includes(appointment.status) && appointment.dataHora >= now);
  const remainingTodayAppointments = todayAppointments.filter((appointment) => appointment.id !== nextAppointment?.id);
  const series = getBarberDailySeries(report);
  const maxSeriesValue = Math.max(...series.map((item) => item.count), 1);

  const mainStats = [
    { label: "Atendimentos", value: producedAppointments, icon: CalendarDays, hint: "Concluidos pelo site, assinantes atendidos e avulsos." },
    { label: "Faturamento produzido", value: formatCurrency(report.summary.grossProduced), icon: TrendingUp, hint: "Producao atribuida ao profissional no periodo." },
    { label: "Comissao estimada", value: formatCurrency(report.summary.totalCommission), icon: BarChart3, hint: "Estimativa conforme regras da barbearia." },
    { label: "Clientes atendidos", value: attendedClients, icon: Users, hint: "Clientes reais identificados no periodo." }
  ];

  const shortcuts = [
    { href: "/funcionario/agendamentos", label: "Minha agenda", description: "Historico, filtros e acoes dos seus agendamentos.", icon: CalendarDays },
    { href: "/funcionario/disponibilidade", label: "Disponibilidade", description: `${availabilityDays.length} dia(s) ativo(s) na sua agenda.`, icon: CalendarClock },
    { href: "/funcionario/produtos", label: "Produtos / estoque", description: "Cadastrar, ajustar imagens, precos e estoque.", icon: Package },
    { href: "/funcionario/despesas", label: "Registrar despesa", description: "Gasto pontual para aprovacao do administrador.", icon: ReceiptText }
  ];

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-8 text-white">
      <section className="mx-auto max-w-7xl">
        <InternalPageHeader
          eyebrow="Painel do barbeiro"
          title={`Ola, ${session.user.name}`}
          backHref="/funcionario"
          backLabel="Painel do barbeiro"
          role={session.user.role}
          hasBarber={Boolean(session.user.barber?.id)}
        />

        <section className="mt-8 rounded-[12px] border border-primary/20 bg-card p-4 shadow-panel md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">Periodo de analise</p>
              <h2 className="mt-1 text-2xl font-black uppercase">{report.period.label}</h2>
              <p className="mt-1 text-sm text-white/55">
                {report.period.start.toLocaleDateString("pt-BR")} a {report.period.end.toLocaleDateString("pt-BR")}
              </p>
            </div>
            <nav className="grid gap-2 sm:grid-cols-3 xl:grid-cols-5">
              {periodOptions.map((period) => (
                <Link
                  key={period.key}
                  href={hrefForPeriod(period.key, customStartDate, customEndDate)}
                  className={cn(
                    "inline-flex min-h-11 items-center justify-center rounded-[10px] border px-4 text-sm font-black uppercase transition",
                    selectedPeriod === period.key
                      ? "border-primary bg-primary text-black"
                      : "border-primary/30 bg-black/30 text-primary hover:bg-primary hover:text-black"
                  )}
                >
                  {period.label}
                </Link>
              ))}
            </nav>
          </div>
          {selectedPeriod === "custom" ? (
            <form action="/funcionario" className="mt-5 rounded-[12px] border border-primary/20 bg-black/30 p-4">
              <input type="hidden" name="period" value="custom" />
              <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
                <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
                  Data inicial
                  <input
                    name="startDate"
                    type="date"
                    defaultValue={customStartDate}
                    className="min-h-12 rounded-[10px] border border-primary/20 bg-black/45 px-4 font-semibold text-white outline-none transition focus:border-primary"
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
                  Data final
                  <input
                    name="endDate"
                    type="date"
                    defaultValue={customEndDate}
                    className="min-h-12 rounded-[10px] border border-primary/20 bg-black/45 px-4 font-semibold text-white outline-none transition focus:border-primary"
                  />
                </label>
                <button
                  type="submit"
                  className="inline-flex min-h-12 items-center justify-center rounded-[10px] bg-primary px-5 text-sm font-black uppercase text-black transition hover:brightness-110"
                >
                  Aplicar periodo
                </button>
                <Link
                  href="/funcionario?period=today"
                  className="inline-flex min-h-12 items-center justify-center rounded-[10px] border border-primary/40 px-5 text-sm font-black uppercase text-primary transition hover:bg-primary hover:text-black"
                >
                  Limpar
                </Link>
              </div>
              {report.period.invalid && report.period.error ? (
                <p className="mt-4 rounded-[10px] border border-red-500/40 bg-red-500/10 p-3 text-sm font-bold text-red-200">
                  {report.period.error}
                </p>
              ) : null}
            </form>
          ) : null}
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {mainStats.map((stat) => (
            <article key={stat.label} className="rounded-[12px] border border-primary/20 bg-card p-5 shadow-panel">
              <stat.icon className="h-7 w-7 text-primary" />
              <p className="mt-4 text-sm uppercase text-white/55">{stat.label}</p>
              <strong className="mt-2 block text-2xl text-primary">{stat.value}</strong>
              <p className="mt-2 text-xs leading-relaxed text-white/45">{stat.hint}</p>
            </article>
          ))}
        </section>

        <section className="mt-8 rounded-[12px] border border-primary/20 bg-card p-4 shadow-panel md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">Transparencia</p>
              <h2 className="mt-1 text-2xl font-black uppercase">Resumo da minha comissao</h2>
              <p className="mt-2 max-w-3xl text-sm text-white/55">
                Os valores abaixo usam a mesma fonte do relatorio do profissional para evitar divergencias de criterio.
              </p>
            </div>
            {session.user.role === "ADMIN" || session.user.role === "DEVELOPER" ? (
              <Link
                href={`/admin/equipe/relatorio?${new URLSearchParams({
                  barberId,
                  period: periodConfig.reportPeriod,
                  ...(selectedPeriod === "custom" ? { startDate: customStartDate, endDate: customEndDate } : {})
                }).toString()}`}
                className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-primary/40 px-4 text-sm font-black uppercase text-primary transition hover:bg-primary hover:text-black"
              >
                Ver meu relatorio completo
              </Link>
            ) : null}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-5">
            {[
              {
                label: "Servicos pelo site",
                count: completedSiteRows.length,
                produced: report.summary.siteGross,
                commission: report.summary.siteCommission,
                detail: "50% dos servicos concluidos de nao assinantes e extras cobrados."
              },
              {
                label: "Atendimentos avulsos",
                count: report.summary.manualCount,
                produced: report.summary.manualGross,
                commission: report.summary.manualCommission,
                detail: "50% dos atendimentos registrados manualmente por voce."
              },
              {
                label: "Assinantes",
                count: report.summary.subscriptionBarberAppointments,
                produced: report.summary.subscriptionRevenue,
                commission: report.summary.subscriptionCommission,
                detail: `${report.summary.subscriptionBarberAppointments}/${report.summary.subscriptionTotalAppointments} atendimentos no pool de 40%.`
              },
              {
                label: "Produtos com comissao",
                count: salesWithCommission.length,
                produced: report.summary.salesWithCommissionGross,
                commission: salesWithCommission.reduce((sum, row) => sum + row.commission, 0),
                detail: "20% do lucro dos produtos visiveis na loja."
              },
              {
                label: "Produtos sem comissao",
                count: salesWithoutCommission.length,
                produced: report.summary.salesWithoutCommissionGross,
                commission: 0,
                detail: "Produtos somente presenciais: venda registrada, comissao R$0,00."
              }
            ].map((item) => (
              <article key={item.label} className="rounded-[12px] border border-white/10 bg-black/30 p-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-white/50">{item.label}</p>
                <strong className="mt-3 block text-lg text-white">{item.count} registro(s)</strong>
                <p className="mt-3 text-sm text-white/60">Produzido: <span className="font-black text-white">{formatCurrency(item.produced)}</span></p>
                <p className="text-sm text-white/60">Comissao: <span className="font-black text-primary">{formatCurrency(item.commission)}</span></p>
                <p className="mt-3 text-xs leading-relaxed text-white/45">{item.detail}</p>
              </article>
            ))}
          </div>

          <div className="mt-5 rounded-[12px] border border-primary/25 bg-primary/10 p-4">
            <p className="text-sm font-black uppercase tracking-[0.14em] text-primary">Comissao estimada do periodo</p>
            <strong className="mt-1 block text-3xl text-primary">{formatCurrency(report.summary.totalCommission)}</strong>
          </div>
        </section>

        <section className="mt-8 rounded-[12px] border border-primary/20 bg-card p-4 shadow-panel md:p-6">
          <div className="flex items-center gap-3">
            <Scissors className="h-6 w-6 text-primary" />
            <h2 className="text-xl font-black uppercase">Minha agenda - hoje</h2>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <article className="rounded-[12px] border border-primary/25 bg-primary/10 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">Proximo cliente</p>
              {nextAppointment ? (
                <div className="mt-4">
                  <p className="text-xl font-black uppercase">{nextAppointment.client.user.name}</p>
                  <p className="mt-1 text-sm text-white/65">{appointmentServicesLabel(nextAppointment)}</p>
                  <p className="mt-3 inline-flex items-center gap-2 font-black text-primary">
                    <Clock className="h-4 w-4" />
                    {nextAppointment.dataHora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="mt-1 text-sm uppercase text-white/55">{statusLabel(nextAppointment.status)}</p>
                  {nextAppointment.client.subscriptions.length > 0 ? (
                    <span className="mt-3 inline-flex rounded-full border border-primary/40 bg-black/30 px-3 py-1 text-xs font-black uppercase text-primary">
                      Cliente assinante
                    </span>
                  ) : null}
                  <AppointmentActionButtons appointmentId={nextAppointment.id} status={nextAppointment.status} />
                </div>
              ) : (
                <p className="mt-4 text-white/65">Nenhum proximo atendimento hoje.</p>
              )}
            </article>

            <div className="grid gap-3">
              {remainingTodayAppointments.length === 0 ? (
                <p className="rounded-[10px] border border-white/10 bg-black/30 p-4 text-white/60">Nenhum outro agendamento para hoje.</p>
              ) : null}
              {remainingTodayAppointments.map((appointment) => (
                <article key={appointment.id} className="rounded-[10px] border border-white/10 bg-black/30 p-4">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div>
                      <p className="font-black uppercase">{appointment.client.user.name}</p>
                      <p className="mt-1 text-sm text-white/60">{appointmentServicesLabel(appointment)}</p>
                    </div>
                    <div className="text-sm text-white/65 sm:text-right">
                      <p className="font-black text-primary">{appointment.dataHora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
                      <p className="mt-1 uppercase">{statusLabel(appointment.status)}</p>
                    </div>
                  </div>
                  <AppointmentActionButtons appointmentId={appointment.id} status={appointment.status} />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-[12px] border border-primary/20 bg-card p-4 shadow-panel md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-black uppercase">Atendimentos por dia</h2>
              <p className="mt-1 text-sm text-white/55">Agendamentos concluidos, assinantes atendidos e atendimentos avulsos do periodo selecionado.</p>
            </div>
            <p className="rounded-[10px] border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-black uppercase text-primary">
              {report.period.start.toLocaleDateString("pt-BR")} a {report.period.end.toLocaleDateString("pt-BR")}
            </p>
          </div>
          <div className="mt-5 overflow-x-auto pb-2">
            <div className="flex min-w-full gap-3">
            {series.map((item) => (
              <div key={`${item.label}-${item.dateLabel}`} className="min-w-[150px] flex-1 rounded-[10px] border border-white/10 bg-black/30 p-3 text-center">
                <div className="mx-auto flex h-24 w-8 items-end rounded-full bg-white/10">
                  <div className="w-full rounded-full bg-primary" style={{ height: `${Math.max(8, (item.count / maxSeriesValue) * 100)}%` }} />
                </div>
                <p className="mt-3 text-xs uppercase text-white/55">{item.label}</p>
                <p className="text-xs font-black text-white">{item.dateLabel}</p>
                <strong className="text-primary">{item.count}</strong>
                <p className="text-[11px] text-white/45">{item.siteCount} site / {item.manualCount} avulso</p>
                <p className="text-[11px] text-white/45">{item.subscriptionCount} assinante</p>
                <p className="text-[11px] text-white/45">{formatCurrency(item.revenue)}</p>
              </div>
            ))}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-[12px] border border-primary/20 bg-card p-4 shadow-panel md:p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">Atalhos</p>
              <h2 className="mt-1 text-2xl font-black uppercase">Ferramentas do expediente</h2>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {shortcuts.map((shortcut) => (
              <Link
                key={shortcut.href}
                href={shortcut.href}
                className="group rounded-[12px] border border-white/10 bg-black/30 p-4 transition hover:border-primary/50 hover:bg-primary/10"
              >
                <shortcut.icon className="h-6 w-6 text-primary" />
                <p className="mt-4 text-sm font-black uppercase text-white">{shortcut.label}</p>
                <p className="mt-2 text-xs leading-relaxed text-white/45">{shortcut.description}</p>
              </Link>
            ))}
          </div>
        </section>

        <BarberPanelActionTabs
          services={serviceOptions.map((service) => ({ id: service.id, name: service.name, price: Number(service.price) }))}
          products={productOptions.map((product) => ({
            id: product.id,
            name: product.name,
            price: Number(product.price),
            stock: product.stock,
            active: product.active,
            visibleInStore: product.visibleInStore
          }))}
          barbers={[{ id: barberId, name: session.user.name }]}
          barberId={barberId}
        />
      </section>
    </main>
  );
}
