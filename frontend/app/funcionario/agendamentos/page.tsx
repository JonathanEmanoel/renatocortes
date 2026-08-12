export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Filter, RotateCcw, Search, Scissors } from "lucide-react";
import { AppointmentActionButtons } from "@/components/internal/appointment-action-buttons";
import { InternalPageHeader } from "@/components/internal/internal-page-header";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

type PageProps = {
  searchParams?: Promise<{
    status?: string;
    period?: string;
    date?: string;
    q?: string;
  }>;
};

const statusLabels: Record<string, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  COMPLETED: "Finalizado",
  CANCELED: "Cancelado",
  REJECTED: "Recusado",
  NO_SHOW: "No-show"
};

const validStatuses = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELED", "REJECTED", "NO_SHOW"] as const;
const operationalStatuses = ["PENDING", "CONFIRMED"] as const;
const historyStatuses = ["COMPLETED", "CANCELED", "REJECTED", "NO_SHOW"] as const;

function dayStart(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function dayEnd(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function startOfWeek(date: Date) {
  const next = dayStart(date);
  const day = next.getDay() || 7;
  next.setDate(next.getDate() - day + 1);
  return next;
}

function resolveActionPeriod(period?: string, date?: string) {
  const now = new Date();
  if (date) {
    const selected = new Date(`${date}T00:00:00`);
    return { start: dayStart(selected), end: dayEnd(selected), label: selected.toLocaleDateString("pt-BR") };
  }
  if (!period || period === "next30") {
    const end = new Date(now);
    end.setDate(end.getDate() + 30);
    return { start: dayStart(now), end: dayEnd(end), label: "Proximos 30 dias" };
  }
  if (period === "today") return { start: dayStart(now), end: dayEnd(now), label: "Hoje" };
  if (period === "week") {
    const start = startOfWeek(now);
    const end = dayEnd(new Date(start));
    end.setDate(start.getDate() + 6);
    return { start, end, label: "Semana atual" };
  }
  if (period === "month") return { start: dayStart(new Date(now.getFullYear(), now.getMonth(), 1)), end: dayEnd(new Date(now.getFullYear(), now.getMonth() + 1, 0)), label: "Mes atual" };
  const start = new Date(now);
  start.setDate(start.getDate() - 30);
  return { start: dayStart(start), end: dayEnd(now), label: "Ultimos 30 dias" };
}

function resolveHistoryPeriod(date?: string) {
  const now = new Date();
  if (date) {
    const selected = new Date(`${date}T00:00:00`);
    return { start: dayStart(selected), end: dayEnd(selected), label: selected.toLocaleDateString("pt-BR") };
  }
  const start = new Date(now);
  start.setDate(start.getDate() - 30);
  return { start: dayStart(start), end: dayEnd(now), label: "Ultimos 30 dias" };
}

function servicesLabel(appointment: { service: { name: string }; services: { service: { name: string } }[] }) {
  return appointment.services.length ? appointment.services.map((item) => item.service.name).join(" + ") : appointment.service.name;
}

function servicesDuration(appointment: { service: { duration: number }; services: { duration: number }[] }) {
  return appointment.services.length ? appointment.services.reduce((sum, item) => sum + item.duration, 0) : appointment.service.duration;
}

function servicesTotal(appointment: { service: { price: unknown }; services: { price: unknown }[] }) {
  return appointment.services.length ? appointment.services.reduce((sum, item) => sum + Number(item.price), 0) : Number(appointment.service.price);
}

const inputClass = "min-h-12 rounded-[10px] border border-primary/20 bg-black/45 px-4 font-semibold text-white outline-none transition focus:border-primary";

export default async function BarberAppointmentsPage({ searchParams }: PageProps) {
  const session = await getAuthenticatedUser();
  if (!session) redirect("/login?redirectTo=/funcionario/agendamentos");
  if (session.user.role !== "BARBER" && session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER") redirect("/cliente");
  const barberId = session.user.barber?.id;
  if (!barberId) redirect("/admin");

  const filters = (await searchParams) ?? {};
  const actionPeriod = resolveActionPeriod(filters.period, filters.date);
  const historyPeriod = resolveHistoryPeriod(filters.date);
  const status = validStatuses.find((item) => item === filters.status);
  const q = filters.q?.trim();
  const searchWhere = q
    ? {
        client: {
          user: {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { phone: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } }
            ]
          }
        }
      }
    : {};
  const operationalStatusFilter = status
    ? operationalStatuses.includes(status as (typeof operationalStatuses)[number])
      ? [status]
      : []
    : [...operationalStatuses];
  const historyStatusFilter = status
    ? historyStatuses.includes(status as (typeof historyStatuses)[number])
      ? [status]
      : []
    : [...historyStatuses];

  const include = {
    client: { include: { user: true, subscriptions: { where: { active: true, deletedAt: null } } } },
    service: true,
    services: { include: { service: true } }
  };

  const [operational, history] = await Promise.all([
    operationalStatusFilter.length === 0
      ? Promise.resolve([])
      : prisma.appointment.findMany({
          where: {
            barberId,
            deletedAt: null,
            dataHora: { gte: actionPeriod.start, lte: actionPeriod.end },
            status: { in: operationalStatusFilter },
            ...searchWhere
          },
          include,
          orderBy: { dataHora: "asc" }
        }),
    historyStatusFilter.length === 0
      ? Promise.resolve([])
      : prisma.appointment.findMany({
          where: {
            barberId,
            deletedAt: null,
            dataHora: { gte: historyPeriod.start, lte: historyPeriod.end },
            status: { in: historyStatusFilter },
            ...searchWhere
          },
          include,
          orderBy: { dataHora: "desc" }
        })
  ]);

  const pendingCount = operational.filter((appointment) => appointment.status === "PENDING").length;
  const confirmedCount = operational.filter((appointment) => appointment.status === "CONFIRMED").length;
  const completed = history.filter((appointment) => appointment.status === "COMPLETED");
  const completedRevenue = completed.reduce((sum, appointment) => sum + servicesTotal(appointment), 0);

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-8 text-white">
      <section className="mx-auto max-w-7xl">
        <InternalPageHeader
          eyebrow="Agenda"
          title="Gerenciar agendamentos"
          backHref="/funcionario"
          backLabel="Painel do barbeiro"
          role={session.user.role}
          hasBarber={Boolean(session.user.barber?.id)}
        />

        <form className="mt-8 rounded-[12px] border border-primary/20 bg-card p-5 shadow-panel" action="/funcionario/agendamentos">
          <div className="flex items-center gap-3">
            <Filter className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-black uppercase">Filtros da minha agenda</h2>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
              Periodo
              <select name="period" defaultValue={filters.period ?? "next30"} className={inputClass}>
                <option value="next30">Proximos 30 dias</option>
                <option value="today">Hoje</option>
                <option value="week">Semana atual</option>
                <option value="month">Mes atual</option>
                <option value="last30">Ultimos 30 dias</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
              Dia especifico
              <input name="date" type="date" defaultValue={filters.date ?? ""} className={inputClass} />
            </label>
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
              Status
              <select name="status" defaultValue={filters.status ?? ""} className={inputClass}>
                <option value="">Todos</option>
                {validStatuses.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70 xl:col-span-2">
              Buscar cliente
              <span className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/45" />
                <input name="q" defaultValue={filters.q ?? ""} placeholder="Nome, telefone ou e-mail" className={`${inputClass} w-full pl-12`} />
              </span>
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button className="inline-flex min-h-11 items-center rounded-[10px] bg-primary px-5 text-sm font-black uppercase text-black transition hover:bg-primary/90" type="submit">
              Aplicar filtros
            </button>
            <Link href="/funcionario/agendamentos" className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-primary/40 px-4 text-sm font-black uppercase text-primary transition hover:bg-primary hover:text-black">
              <RotateCcw className="h-4 w-4" />
              Limpar filtros
            </Link>
          </div>
        </form>

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Acoes", actionPeriod.label],
            ["Historico", historyPeriod.label],
            ["Pendentes", pendingCount],
            ["Confirmados", confirmedCount],
            ["Finalizados", `${completed.length} / ${formatCurrency(completedRevenue)}`]
          ].map(([label, value]) => (
            <article key={label} className="rounded-[12px] border border-primary/20 bg-card p-5 shadow-panel">
              <p className="text-sm uppercase tracking-[0.14em] text-white/55">{label}</p>
              <strong className="mt-2 block text-xl text-primary">{value}</strong>
            </article>
          ))}
        </section>

        <section className="mt-8 rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-6 w-6 text-primary" />
            <h2 className="text-xl font-black uppercase">Agendamentos para acao</h2>
          </div>
          <div className="mt-5 grid gap-4">
            {operational.length === 0 ? <p className="rounded-[10px] border border-white/10 bg-black/30 p-4 text-white/65">Nenhum agendamento pendente ou confirmado neste filtro.</p> : null}
            {operational.map((appointment) => (
              <article key={appointment.id} className="rounded-[10px] border border-white/10 bg-black/30 p-4">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                  <div>
                    <p className="font-black uppercase">{appointment.client.user.name}</p>
                    <p className="mt-1 text-sm text-white/60">{servicesLabel(appointment)}</p>
                    <p className="mt-1 text-sm text-white/45">{servicesDuration(appointment)} min - {formatCurrency(servicesTotal(appointment))}</p>
                    {appointment.client.subscriptions.length > 0 ? (
                      <span className="mt-2 inline-flex rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-black uppercase text-primary">Cliente assinante</span>
                    ) : null}
                  </div>
                  <div className="text-sm text-white/65 md:text-right">
                    <p>{appointment.dataHora.toLocaleDateString("pt-BR")}</p>
                    <p className="font-black text-primary">{appointment.dataHora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
                    <p className="mt-1 uppercase">{statusLabels[appointment.status] ?? appointment.status}</p>
                  </div>
                </div>
                <AppointmentActionButtons appointmentId={appointment.id} status={appointment.status} />
              </article>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
          <div className="flex items-center gap-3">
            <Scissors className="h-6 w-6 text-primary" />
            <h2 className="text-xl font-black uppercase">Historico da minha agenda</h2>
          </div>
          <div className="mt-5 grid gap-4">
            {history.length === 0 ? <p className="rounded-[10px] border border-white/10 bg-black/30 p-4 text-white/65">Nenhum historico encontrado neste filtro.</p> : null}
            {history.map((appointment) => (
              <article key={appointment.id} className="grid gap-3 rounded-[10px] border border-white/10 bg-black/30 p-4 md:grid-cols-4">
                <div>
                  <p className="text-xs uppercase text-white/45">Cliente</p>
                  <p className="font-black uppercase">{appointment.client.user.name}</p>
                  <p className="text-sm text-white/45">{appointment.client.user.phone ?? "Telefone nao informado"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-white/45">Servico</p>
                  <p className="font-bold">{servicesLabel(appointment)}</p>
                  <p className="text-sm text-white/55">{servicesDuration(appointment)} min</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-white/45">Valor</p>
                  <p className="font-black text-primary">{formatCurrency(servicesTotal(appointment))}</p>
                </div>
                <div className="md:text-right">
                  <p>{appointment.dataHora.toLocaleDateString("pt-BR")} {appointment.dataHora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
                  <p className="font-black uppercase text-primary">{statusLabels[appointment.status] ?? appointment.status}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
