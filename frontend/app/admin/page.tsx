export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, BarChart3, CalendarDays, Crown, Package, Settings, ShieldAlert, Users } from "lucide-react";
import { AdminModuleNav } from "@/components/internal/admin-module-nav";
import { AppointmentActionButtons } from "@/components/internal/appointment-action-buttons";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getFinanceMetrics } from "@/lib/server/finance-rules";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

function appointmentServicesLabel(appointment: { service: { name: string }; services: { service: { name: string } }[] }) {
  return appointment.services.length ? appointment.services.map((item) => item.service.name).join(" + ") : appointment.service.name;
}

export default async function AdminPanelPage() {
  const session = await getAuthenticatedUser();

  if (!session) redirect("/login?redirectTo=/admin");
  if (session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER") {
    redirect(session.user.role === "BARBER" ? "/funcionario" : "/cliente");
  }

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const dueSoonEnd = new Date(todayStart);
  dueSoonEnd.setDate(dueSoonEnd.getDate() + 7);

  const todayMetrics = await getFinanceMetrics(todayStart, todayEnd);
  const monthMetrics = await getFinanceMetrics(monthStart, monthEnd);
  const [
    todayAppointmentsCount,
    pendingSalesCount,
    activeSubscriptions,
    pendingSubscriptionsCount,
    dueSubscriptionsCount,
    clientsCount,
    lowStockProducts,
    operationalAppointments
  ] = await Promise.all([
    prisma.appointment.count({ where: { dataHora: { gte: todayStart, lt: todayEnd }, deletedAt: null } }),
    prisma.sale.count({ where: { status: "OPEN", deletedAt: null } }),
    prisma.subscription.count({ where: { status: "ACTIVE", deletedAt: null } }),
    prisma.subscription.count({ where: { status: "PENDING", deletedAt: null } }),
    prisma.subscription.count({ where: { status: "ACTIVE", endDate: { lte: dueSoonEnd }, deletedAt: null } }),
    prisma.client.count({ where: { deletedAt: null } }),
    prisma.product.findMany({ where: { active: true, stock: { lte: 5 }, deletedAt: null }, orderBy: { stock: "asc" }, take: 8 }),
    prisma.appointment.findMany({
      where: { deletedAt: null, status: { in: ["PENDING", "CONFIRMED"] } },
      include: { client: { include: { user: true } }, barber: { include: { user: true } }, service: true, services: { include: { service: true } } },
      orderBy: { dataHora: "asc" },
      take: 8
    })
  ]);

  const cards = [
    { label: "Agendamentos hoje", value: todayAppointmentsCount, icon: CalendarDays },
    { label: "Faturamento bruto do dia", value: formatCurrency(todayMetrics.grossRevenue), icon: BarChart3 },
    { label: "Faturamento bruto do mes", value: formatCurrency(monthMetrics.grossRevenue), icon: BarChart3 },
    { label: "Resultado liquido do mes", value: formatCurrency(monthMetrics.netProfit), icon: BarChart3 },
    { label: "Pedidos pendentes", value: pendingSalesCount, icon: Package },
    { label: "Assinaturas ativas", value: activeSubscriptions, icon: Crown },
    { label: "Assinaturas pendentes", value: pendingSubscriptionsCount, icon: Crown },
    { label: "Assinaturas vencendo", value: dueSubscriptionsCount, icon: AlertTriangle },
    { label: "Clientes", value: clientsCount, icon: Users }
  ];

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-8 text-white">
      <section className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary">
              {session.user.role === "DEVELOPER" ? "Painel do desenvolvedor" : "Painel administrativo"}
            </p>
            <h1 className="mt-3 text-3xl font-black uppercase md:text-5xl">Ola, {session.user.name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {session.user.barber?.id ? (
              <Link href="/funcionario" className="rounded-[12px] border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-bold uppercase text-primary transition hover:bg-primary hover:text-black">
                Meu painel de barbeiro
              </Link>
            ) : null}
            {session.user.role === "DEVELOPER" ? (
              <div className="rounded-[12px] border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-bold uppercase text-primary">
                <Settings className="mr-2 inline h-4 w-4" />
                Acesso tecnico total
              </div>
            ) : null}
          </div>
        </div>

        <AdminModuleNav />

        {session.user.role === "DEVELOPER" ? (
          <Link href="/internal/manutencao" className="mt-6 flex rounded-[12px] border border-red-500/35 bg-red-500/10 p-5 text-red-100 shadow-panel transition hover:border-red-300 hover:bg-red-500/15">
            <ShieldAlert className="mr-4 h-7 w-7 shrink-0" />
            <span>
              <strong className="block text-lg font-black uppercase">Manutencao do sistema</strong>
              <span className="mt-1 block text-sm text-white/65">Area restrita ao desenvolvedor. Permite ocultar ou excluir dados de teste com preview e confirmacao forte.</span>
            </span>
          </Link>
        ) : null}

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <article key={card.label} className="rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
              <card.icon className="h-8 w-8 text-primary" />
              <p className="mt-5 text-sm uppercase tracking-[0.12em] text-white/55">{card.label}</p>
              <strong className="mt-2 block text-3xl text-primary">{card.value}</strong>
            </article>
          ))}
        </div>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <h2 className="text-xl font-black uppercase">Agendamentos que precisam de acao</h2>
              <Link href="/admin/agendamentos" className="text-sm font-black uppercase text-primary">Ver todos</Link>
            </div>
            <div className="mt-5 grid gap-4">
              {operationalAppointments.length === 0 ? <p className="text-white/65">Nenhum agendamento pendente ou confirmado.</p> : null}
              {operationalAppointments.map((appointment) => (
                <article key={appointment.id} className="rounded-[10px] border border-white/10 bg-black/30 p-4">
                  <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                    <div>
                      <p className="font-black uppercase">{appointment.client.user.name}</p>
                      <p className="mt-1 text-sm text-white/60">{appointmentServicesLabel(appointment)} com {appointment.barber.user.name}</p>
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
          </div>

          <div className="rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <h2 className="text-xl font-black uppercase">Alertas de estoque</h2>
              <Link href="/admin/produtos" className="text-sm font-black uppercase text-primary">Gerenciar</Link>
            </div>
            <div className="mt-5 grid gap-3">
              {lowStockProducts.length === 0 ? <p className="text-white/65">Nenhum produto com estoque baixo.</p> : null}
              {lowStockProducts.map((product) => (
                <div key={product.id} className="flex items-center justify-between rounded-[10px] border border-white/10 bg-black/30 p-4">
                  <span className="font-black uppercase">{product.name}</span>
                  <strong className="text-primary">{product.stock}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
