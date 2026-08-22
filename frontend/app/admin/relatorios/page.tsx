export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InternalPageHeader } from "@/components/internal/internal-page-header";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { periodQuery, resolvePeriodRange } from "@/lib/server/date-periods";
import { getFinanceMetrics } from "@/lib/server/finance-rules";
import { getDashboardPath } from "@/lib/auth-routes";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const inputClass = "min-h-12 rounded-[10px] border border-primary/20 bg-black/45 px-4 font-semibold text-white outline-none transition focus:border-primary";

export default async function AdminReportsPage({ searchParams }: PageProps) {
  const session = await getAuthenticatedUser();
  if (!session) redirect("/login?redirectTo=/admin/relatorios");
  if (session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER") redirect(getDashboardPath(session.user.role, Boolean(session.user.barber?.id)));

  const params = (await searchParams) ?? {};
  const range = resolvePeriodRange({
    period: firstParam(params.period),
    date: firstParam(params.date),
    month: firstParam(params.month),
    startDate: firstParam(params.startDate),
    endDate: firstParam(params.endDate)
  });
  const metrics = range.invalid
    ? { grossRevenue: 0, paidExpenses: 0, netProfit: 0 }
    : await getFinanceMetrics(range.start, range.end);
  const exportQuery = periodQuery(range);
  const completedAppointments = range.invalid
    ? []
    : await prisma.appointment.findMany({
        where: { dataHora: { gte: range.start, lte: range.end }, status: "COMPLETED", deletedAt: null },
        include: { service: true, services: { include: { service: true } } }
      });
  const productsRanking = range.invalid
    ? []
    : await prisma.saleItem.groupBy({
        by: ["productId"],
        where: { sale: { status: "COMPLETED", completedAt: { gte: range.start, lte: range.end }, deletedAt: null } },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 8
      });
  const allProducts = range.invalid
    ? []
    : await prisma.product.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });

  const productById = new Map(allProducts.map((product) => [product.id, product.name]));
  const serviceCounts = new Map<string, { name: string; count: number }>();
  for (const appointment of completedAppointments) {
    const services = appointment.services.length ? appointment.services.map((item) => item.service) : [appointment.service];
    for (const service of services) {
      const current = serviceCounts.get(service.id) ?? { name: service.name, count: 0 };
      serviceCounts.set(service.id, { ...current, count: current.count + 1 });
    }
  }
  const servicesRanking = Array.from(serviceCounts.entries())
    .map(([serviceId, item]) => ({ serviceId, ...item }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-8 text-white">
      <section className="mx-auto max-w-7xl">
        <InternalPageHeader
          eyebrow="Relatorios"
          title="Indicadores e exportacoes"
          backHref="/admin"
          backLabel="Painel administrativo"
          role={session.user.role}
          hasBarber={Boolean(session.user.barber?.id)}
        />

        <form className="mt-8 rounded-[12px] border border-primary/20 bg-card p-5 shadow-panel" action="/admin/relatorios">
          <div className="grid gap-4 md:grid-cols-5">
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
              Periodo
              <select name="period" defaultValue={range.period} className={inputClass}>
                <option value="day">Dia</option>
                <option value="week">Semana</option>
                <option value="month">Mes</option>
                <option value="custom">Personalizado</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
              Dia
              <input name="date" type="date" defaultValue={range.date} className={inputClass} />
            </label>
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
              Mes
              <input name="month" type="month" defaultValue={range.month} className={inputClass} />
            </label>
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
              Inicio
              <input name="startDate" type="date" defaultValue={range.startDate} className={inputClass} />
            </label>
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
              Fim
              <input name="endDate" type="date" defaultValue={range.endDate} className={inputClass} />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="submit">Aplicar filtros</Button>
            <a href={`/api/internal/reports/export?format=csv&${exportQuery}`} className="inline-flex min-h-11 items-center rounded-[10px] border border-primary/40 px-4 text-sm font-black uppercase text-primary">
              <Download className="mr-2 h-4 w-4" /> Excel
            </a>
            <a href={`/api/internal/reports/export?format=html&${exportQuery}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-[10px] border border-primary/40 px-4 text-sm font-black uppercase text-primary">
              <Download className="mr-2 h-4 w-4" /> PDF
            </a>
            <span className="text-sm font-bold text-white/55">{range.label}</span>
          </div>
          {range.invalid && range.error ? (
            <p className="mt-4 rounded-[10px] border border-red-500/40 bg-red-500/10 p-3 text-sm font-bold text-red-200">{range.error}</p>
          ) : null}
        </form>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[["Receita do periodo", metrics.grossRevenue], ["Despesas pagas do periodo", metrics.paidExpenses], ["Lucro liquido", metrics.netProfit]].map(([label, value]) => (
            <article key={String(label)} className="rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
              <p className="text-sm uppercase text-white/55">{label}</p>
              <strong className="mt-2 block text-3xl text-primary">{formatCurrency(Number(value))}</strong>
            </article>
          ))}
        </div>

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
            <h2 className="text-xl font-black uppercase">Servicos mais vendidos</h2>
            <div className="mt-5 grid gap-3">
              {servicesRanking.length === 0 ? <p className="text-white/65">Nenhum servico no periodo.</p> : null}
              {servicesRanking.map((item) => (
                <div key={item.serviceId} className="flex items-center justify-between rounded-[10px] border border-white/10 bg-black/30 p-4">
                  <span>{item.name}</span>
                  <strong className="text-primary">{item.count}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
            <h2 className="text-xl font-black uppercase">Produtos mais vendidos</h2>
            <div className="mt-5 grid gap-3">
              {productsRanking.length === 0 ? <p className="text-white/65">Nenhum produto no periodo.</p> : null}
              {productsRanking.map((item) => (
                <div key={item.productId} className="flex items-center justify-between rounded-[10px] border border-white/10 bg-black/30 p-4">
                  <span>{productById.get(item.productId) ?? item.productId}</span>
                  <strong className="text-primary">{item._sum.quantity ?? 0}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
