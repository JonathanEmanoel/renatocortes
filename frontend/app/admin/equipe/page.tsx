export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { BarChart3, Scissors, Users } from "lucide-react";
import { InternalPageHeader } from "@/components/internal/internal-page-header";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

function startOfRange(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

function appointmentTotal(appointment: { service: { price: unknown }; services: { price: unknown }[] }) {
  return appointment.services.length ? appointment.services.reduce((sum, item) => sum + Number(item.price), 0) : Number(appointment.service.price);
}

export default async function AdminTeamPage() {
  const session = await getAuthenticatedUser();
  if (!session) redirect("/login?redirectTo=/admin/equipe");
  if (session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER") redirect("/cliente");

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const fortnightStart = startOfRange(14);
  const weekStart = startOfRange(7);

  const barbers = await prisma.barber.findMany({
    where: { active: true, deletedAt: null },
    include: {
      user: true,
      appointments: {
        where: { status: "COMPLETED", deletedAt: null, dataHora: { gte: monthStart } },
        include: { service: true, services: true, client: { include: { subscriptions: true } } }
      },
      commissions: {
        where: { createdAt: { gte: monthStart } }
      }
    },
    orderBy: { user: { name: "asc" } }
  });

  const ranges = [
    { label: "Semana", start: weekStart },
    { label: "Quinzena", start: fortnightStart },
    { label: "Mes", start: monthStart }
  ];

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
                  const gross = appointments.reduce((sum, appointment) => sum + appointmentTotal(appointment), 0);
                  const commissions = barber.commissions.filter((commission) => commission.createdAt >= range.start);
                  const net = commissions.reduce((sum, commission) => sum + Number(commission.amount), 0);
                  const subscriberAppointments = appointments.filter((appointment) =>
                    appointment.client.subscriptions.some((subscription) => subscription.active && (!subscription.endDate || subscription.endDate >= appointment.dataHora))
                  ).length;
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
