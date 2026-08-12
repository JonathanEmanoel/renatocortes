export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import Link from "next/link";
import { BarChart3, FileText, Scissors, Users } from "lucide-react";
import { InternalPageHeader } from "@/components/internal/internal-page-header";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getBarberFinancialSummary } from "@/lib/server/barber-report";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

export default async function AdminTeamPage() {
  const session = await getAuthenticatedUser();
  if (!session) redirect("/login?redirectTo=/admin/equipe");
  if (session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER") redirect("/cliente");

  const barbers = await prisma.barber.findMany({
    where: { active: true, deletedAt: null },
    include: {
      user: true
    },
    orderBy: { user: { name: "asc" } }
  });

  const ranges = [
    { label: "Semana", period: "week-current" },
    { label: "Quinzena", period: "fortnight-current" },
    { label: "Mes", period: "month-current" }
  ];
  const summaries = new Map(
    await Promise.all(
      barbers.flatMap((barber) =>
        ranges.map(async (range) => [`${barber.id}:${range.period}`, await getBarberFinancialSummary({ barberId: barber.id, period: range.period })] as const)
      )
    )
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
                <div className="flex items-center gap-3">
                  <Link
                    href={`/admin/equipe/relatorio?barberId=${barber.id}&period=month-current`}
                    className="inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-primary/40 px-4 text-sm font-black uppercase text-primary transition hover:bg-primary hover:text-black"
                  >
                    <FileText className="h-4 w-4" />
                    Relatorio detalhado
                  </Link>
                  <Scissors className="h-8 w-8 text-primary" />
                </div>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {ranges.map((range) => {
                  const financial = summaries.get(`${barber.id}:${range.period}`);
                  const gross = financial?.summary.grossProduced ?? 0;
                  const net = financial?.summary.totalCommission ?? 0;
                  const subscriberAppointments = financial?.summary.subscriptionBarberAppointments ?? 0;
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
