export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { AppointmentActionButtons } from "@/components/internal/appointment-action-buttons";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

function servicesLabel(appointment: { service: { name: string }; services: { service: { name: string } }[] }) {
  return appointment.services.length ? appointment.services.map((item) => item.service.name).join(" + ") : appointment.service.name;
}

function servicesDuration(appointment: { service: { duration: number }; services: { duration: number }[] }) {
  return appointment.services.length ? appointment.services.reduce((sum, item) => sum + item.duration, 0) : appointment.service.duration;
}

function servicesTotal(appointment: { service: { price: unknown }; services: { price: unknown }[] }) {
  return appointment.services.length ? appointment.services.reduce((sum, item) => sum + Number(item.price), 0) : Number(appointment.service.price);
}

type AdminAppointmentsPageProps = {
  searchParams?: Promise<{
    barberId?: string;
    status?: string;
    date?: string;
  }>;
};

const operationalStatuses = ["PENDING", "CONFIRMED"] as const;
const historyStatuses = ["REJECTED", "CANCELED", "COMPLETED", "NO_SHOW"] as const;

export default async function AdminAppointmentsPage({ searchParams }: AdminAppointmentsPageProps) {
  const session = await getAuthenticatedUser();
  if (!session) redirect("/login?redirectTo=/admin/agendamentos");
  if (session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER") redirect("/cliente");
  const filters = (await searchParams) ?? {};

  const since = new Date();
  since.setDate(since.getDate() - 30);
  const dayStart = filters.date ? new Date(`${filters.date}T00:00:00`) : null;
  const dayEnd = filters.date ? new Date(`${filters.date}T23:59:59`) : null;
  const barberFilter = filters.barberId && filters.barberId !== "ALL" ? filters.barberId : undefined;
  const operationalStatusFilter = operationalStatuses.find((status) => status === filters.status);
  const historyStatusFilter = historyStatuses.find((status) => status === filters.status);

  const [barbers, operational, history] = await Promise.all([
    prisma.barber.findMany({
      where: { active: true, deletedAt: null },
      include: { user: true },
      orderBy: { user: { name: "asc" } }
    }),
    prisma.appointment.findMany({
      where: {
        deletedAt: null,
        barberId: barberFilter,
        status: operationalStatusFilter ?? { in: [...operationalStatuses] },
        dataHora: dayStart && dayEnd ? { gte: dayStart, lte: dayEnd } : undefined
      },
      include: { client: { include: { user: true } }, barber: { include: { user: true } }, service: true, services: { include: { service: true } } },
      orderBy: { dataHora: "asc" }
    }),
    prisma.appointment.findMany({
      where: {
        deletedAt: null,
        barberId: barberFilter,
        dataHora: dayStart && dayEnd ? { gte: dayStart, lte: dayEnd } : { gte: since },
        status: historyStatusFilter ?? { in: [...historyStatuses] }
      },
      include: { client: { include: { user: true } }, barber: { include: { user: true } }, service: true, services: { include: { service: true } } },
      orderBy: { dataHora: "desc" }
    })
  ]);

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-8 text-white">
      <section className="mx-auto max-w-7xl">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary">Agenda</p>
        <h1 className="mt-3 text-3xl font-black uppercase md:text-5xl">Gestao de agendamentos</h1>

        <form className="mt-8 grid gap-3 rounded-[12px] border border-primary/20 bg-card p-4 shadow-panel md:grid-cols-4" action="/admin/agendamentos">
          <select name="barberId" defaultValue={filters.barberId ?? "ALL"} className="min-h-12 rounded-[10px] border border-primary/20 bg-black/45 px-4 font-semibold text-white outline-none">
            <option value="ALL">Todos os profissionais</option>
            {barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.user.name}</option>)}
          </select>
          <select name="status" defaultValue={filters.status ?? "ALL"} className="min-h-12 rounded-[10px] border border-primary/20 bg-black/45 px-4 font-semibold text-white outline-none">
            <option value="ALL">Todos os status</option>
            <option value="PENDING">Pendentes</option>
            <option value="CONFIRMED">Confirmados</option>
            <option value="REJECTED">Recusados</option>
            <option value="CANCELED">Cancelados</option>
            <option value="COMPLETED">Finalizados</option>
            <option value="NO_SHOW">No-show</option>
          </select>
          <input name="date" type="date" defaultValue={filters.date ?? ""} className="min-h-12 rounded-[10px] border border-primary/20 bg-black/45 px-4 font-semibold text-white outline-none" />
          <button className="rounded-[10px] border border-primary bg-primary px-4 py-3 font-black uppercase text-black" type="submit">Filtrar</button>
        </form>

        <section className="mt-8 rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
          <h2 className="text-xl font-black uppercase">Operacional</h2>
          <div className="mt-5 grid gap-4">
            {operational.length === 0 ? <p className="text-white/65">Nenhum agendamento pendente ou confirmado.</p> : null}
            {operational.map((appointment) => (
              <article key={appointment.id} className="rounded-[10px] border border-white/10 bg-black/30 p-4">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                  <div>
                    <p className="font-black uppercase">{appointment.client.user.name}</p>
                    <p className="mt-1 text-sm text-white/60">{servicesLabel(appointment)} com {appointment.barber.user.name}</p>
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

        <section className="mt-8 rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
          <h2 className="text-xl font-black uppercase">Historico dos ultimos 30 dias</h2>
          <div className="mt-5 grid gap-4">
            {history.length === 0 ? <p className="text-white/65">Nenhum historico recente.</p> : null}
            {history.map((appointment) => (
              <article key={appointment.id} className="grid gap-3 rounded-[10px] border border-white/10 bg-black/30 p-4 md:grid-cols-4">
                <div>
                  <p className="text-xs uppercase text-white/45">Cliente</p>
                  <p className="font-black uppercase">{appointment.client.user.name}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-white/45">Barbeiro</p>
                  <p className="font-black uppercase">{appointment.barber.user.name}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-white/45">Servico</p>
                  <p className="font-bold">{servicesLabel(appointment)}</p>
                  <p className="text-sm text-white/55">{servicesDuration(appointment)} min - {formatCurrency(servicesTotal(appointment))}</p>
                </div>
                <div className="md:text-right">
                  <p>{appointment.dataHora.toLocaleDateString("pt-BR")} {appointment.dataHora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
                  <p className="font-black uppercase text-primary">{appointment.status}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
