export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import Link from "next/link";
import { Download, Filter, RotateCcw } from "lucide-react";
import { InternalPageHeader } from "@/components/internal/internal-page-header";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { getBarberReport, parseBarberReportFilters, type ReportType } from "@/lib/server/barber-report";
import { getDashboardPath } from "@/lib/auth-routes";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const inputClass = "min-h-12 rounded-[10px] border border-primary/20 bg-black/45 px-4 font-semibold text-white outline-none transition focus:border-primary";
const chipClass = "inline-flex min-h-11 items-center justify-center rounded-[10px] border px-4 text-sm font-black uppercase transition";

const periodChoices = [
  { value: "today", label: "Hoje" },
  { value: "day", label: "Dia" },
  { value: "week", label: "Semana" },
  { value: "fortnight", label: "Quinzena" },
  { value: "month", label: "Mes" },
  { value: "custom", label: "Personalizado" }
];

function queryString(params: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (!value) return;
    if (Array.isArray(value)) value.forEach((item) => item && query.append(key, item));
    else query.set(key, value);
  });
  return query.toString();
}

function normalizePeriod(period?: string) {
  if (period === "week-current" || period === "week-previous") return "week";
  if (period === "fortnight-current" || period === "fortnight-previous") return "fortnight";
  if (period === "month-current" || period === "month-previous") return "month";
  if (period === "today" || period === "day" || period === "week" || period === "fortnight" || period === "month" || period === "custom") return period;
  return "month";
}

function periodHref(params: Record<string, string | string[] | undefined>, period: string) {
  return `/admin/equipe/relatorio?${queryString({
    ...params,
    period,
    date: undefined,
    month: undefined,
    startDate: undefined,
    endDate: undefined
  })}`;
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="rounded-[12px] border border-primary/20 bg-card p-5 shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-black uppercase">{title}</h2>
        <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-black text-primary">{count}</span>
      </div>
      <div className="mt-4">{count === 0 ? <p className="rounded-[10px] border border-white/10 bg-black/25 p-4 text-white/60">Nenhum registro encontrado neste filtro.</p> : children}</div>
    </section>
  );
}

export default async function BarberReportPage({ searchParams }: PageProps) {
  const session = await getAuthenticatedUser();
  if (!session) redirect("/login?redirectTo=/admin/equipe/relatorio");
  if (session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER") redirect(getDashboardPath(session.user.role, Boolean(session.user.barber?.id)));

  const params = (await searchParams) ?? {};
  const report = await getBarberReport(parseBarberReportFilters(params));
  const selectedPeriod = normalizePeriod(report.filters.period);
  const serviceLabel = report.filters.serviceId
    ? report.options.services.find((service) => service.id === report.filters.serviceId)?.name ?? "Servico filtrado"
    : "Todos os servicos";
  const pdfHref = `/api/internal/barber-report/pdf?${queryString({ ...params, barberId: report.barber.id })}`;

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-8 text-white">
      <section className="mx-auto max-w-7xl">
        <InternalPageHeader
          eyebrow="Equipe"
          title="Relatorio detalhado"
          backHref="/admin/equipe"
          backLabel="Desempenho dos profissionais"
          role={session.user.role}
          hasBarber={Boolean(session.user.barber?.id)}
        />

        <form className="mt-8 rounded-[12px] border border-primary/20 bg-card p-5 shadow-panel" action="/admin/equipe/relatorio">
          <div className="flex items-center gap-3">
            <Filter className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-black uppercase">Filtros</h2>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3 xl:grid-cols-4">
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
              Profissional
              <select name="barberId" defaultValue={report.barber.id} className={inputClass}>
                {report.options.barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.name}</option>)}
              </select>
            </label>
            <div className="grid gap-3 md:col-span-2 xl:col-span-3">
              <p className="text-sm font-bold uppercase text-white/70">Periodo</p>
              <input type="hidden" name="period" value={selectedPeriod} />
              <div className="flex flex-wrap gap-2">
                {periodChoices.map((choice) => (
                  <Link
                    key={choice.value}
                    href={periodHref(params, choice.value)}
                    className={`${chipClass} ${
                      selectedPeriod === choice.value
                        ? "border-primary bg-primary text-black"
                        : "border-primary/30 bg-black/30 text-primary hover:bg-primary hover:text-black"
                    }`}
                  >
                    {choice.label}
                  </Link>
                ))}
              </div>
            </div>
            {selectedPeriod === "day" ? (
              <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
                Escolha a data
                <input name="date" type="date" defaultValue={report.filters.date} className={inputClass} />
              </label>
            ) : null}
            {selectedPeriod === "week" ? (
              <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
                Data de referencia da semana
                <input name="date" type="date" defaultValue={report.filters.date} className={inputClass} />
              </label>
            ) : null}
            {selectedPeriod === "fortnight" ? (
              <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
                Data de referencia da quinzena
                <input name="date" type="date" defaultValue={report.filters.date} className={inputClass} />
              </label>
            ) : null}
            {selectedPeriod === "month" ? (
              <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
                Mes e ano
                <input name="month" type="month" defaultValue={report.filters.month} className={inputClass} />
              </label>
            ) : null}
            {selectedPeriod === "custom" ? (
              <>
                <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
                  Data inicial
                  <input name="startDate" type="date" defaultValue={report.filters.startDate} className={inputClass} />
                </label>
                <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
                  Data final
                  <input name="endDate" type="date" defaultValue={report.filters.endDate} className={inputClass} />
                </label>
              </>
            ) : null}
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
              Servico
              <select name="serviceId" defaultValue={report.filters.serviceId ?? ""} className={inputClass}>
                <option value="">Todos</option>
                {report.options.services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
              Produto
              <select name="productId" defaultValue={report.filters.productId ?? ""} className={inputClass}>
                <option value="">Todos</option>
                {report.options.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
              Tipo de produto
              <select name="productType" defaultValue={report.filters.productType} className={inputClass}>
                <option value="all">Todos</option>
                <option value="store">Produto da loja</option>
                <option value="internal">Somente presencial</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
              Comissao em venda
              <select name="commission" defaultValue={report.filters.commission} className={inputClass}>
                <option value="all">Todas</option>
                <option value="with">Com comissao</option>
                <option value="without">Sem comissao</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
              Status
              <select name="status" defaultValue={report.filters.status ?? ""} className={inputClass}>
                <option value="">Todos</option>
                <option value="PENDING">Pendente</option>
                <option value="CONFIRMED">Confirmado</option>
                <option value="COMPLETED">Concluido</option>
                <option value="CANCELED">Cancelado</option>
                <option value="REJECTED">Rejeitado</option>
                <option value="NO_SHOW">Nao compareceu</option>
              </select>
            </label>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {[
              ["site", "Servicos pelo site"],
              ["manual", "Atendimentos avulsos"],
              ["subscription", "Assinantes"],
              ["sales", "Vendas presenciais"]
            ].map(([value, label]) => (
              <label key={value} className="flex items-center gap-3 rounded-[10px] border border-white/10 bg-black/30 p-3 font-bold uppercase text-white/75">
                <input type="checkbox" name="type" value={value} defaultChecked={report.filters.types.includes(value as ReportType)} className="h-4 w-4 accent-primary" />
                {label}
              </label>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="submit">Aplicar filtros</Button>
            <Link href="/admin/equipe/relatorio" className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-primary/40 px-4 text-sm font-black uppercase text-primary transition hover:bg-primary hover:text-black">
              <RotateCcw className="h-4 w-4" />
              Limpar filtros
            </Link>
            <a href={pdfHref} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-primary/40 px-4 text-sm font-black uppercase text-primary transition hover:bg-primary hover:text-black">
              <Download className="h-4 w-4" />
              Gerar PDF
            </a>
          </div>
          {report.period.invalid && report.period.error ? (
            <p className="mt-4 rounded-[10px] border border-red-500/40 bg-red-500/10 p-3 text-sm font-bold text-red-200">{report.period.error}</p>
          ) : null}
          <p className="mt-4 rounded-[10px] border border-primary/20 bg-primary/10 p-3 text-sm font-bold text-primary">
            Exibindo: {report.barber.name} • {report.period.start.toLocaleDateString("pt-BR")} a {report.period.end.toLocaleDateString("pt-BR")} • {serviceLabel}
          </p>
        </form>

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Profissional", report.barber.name],
            ["Periodo", `${report.period.label} - ${report.period.start.toLocaleDateString("pt-BR")} a ${report.period.end.toLocaleDateString("pt-BR")}`],
            ["Faturamento produzido", formatCurrency(report.summary.grossProduced)],
            ["Comissao total", formatCurrency(report.summary.totalCommission)]
          ].map(([label, value]) => (
            <article key={label} className="rounded-[12px] border border-primary/20 bg-card p-5 shadow-panel">
              <p className="text-sm uppercase tracking-[0.14em] text-white/55">{label}</p>
              <strong className="mt-2 block text-xl text-primary">{value}</strong>
            </article>
          ))}
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Servicos pelo site", report.summary.siteCount, report.summary.siteGross, report.summary.siteCommission],
            ["Atendimentos avulsos", report.summary.manualCount, report.summary.manualGross, report.summary.manualCommission],
            ["Assinantes", report.summary.subscriptionCount, 0, report.summary.subscriptionCommission],
            ["Vendas presenciais", report.summary.salesCount, report.summary.salesGross, report.summary.salesCommission]
          ].map(([label, count, gross, commission]) => (
            <article key={label} className="rounded-[10px] border border-white/10 bg-black/30 p-4">
              <p className="text-sm uppercase text-white/55">{label}</p>
              <strong className="mt-2 block text-lg text-white">{count} registro(s)</strong>
              <p className="mt-2 text-sm text-white/60">Faturamento: <span className="font-black text-white">{formatCurrency(Number(gross))}</span></p>
              <p className="text-sm text-white/60">Comissao: <span className="font-black text-primary">{formatCurrency(Number(commission))}</span></p>
            </article>
          ))}
        </section>

        <div className="mt-8 grid gap-6">
          <Section title="Vendas presenciais" count={report.sections.sales.length}>
            <div className="grid gap-3">
              {report.sections.sales.map((row) => (
                <article key={row.id} className="rounded-[10px] border border-white/10 bg-black/30 p-4">
                  <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                    <div>
                      <p className="font-black uppercase">{row.product}</p>
                      <p className="mt-1 text-sm text-white/55">{row.code} - {row.dateText} {row.timeText} - {row.productTypeLabel}</p>
                    </div>
                    <strong className="text-primary">{formatCurrency(row.commission)}</strong>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-white/70 md:grid-cols-5">
                    <span>Qtd: {row.quantity}</span>
                    <span>Venda: {formatCurrency(row.gross)}</span>
                    <span>Custo: {formatCurrency(row.totalCost)}</span>
                    <span>Lucro: {formatCurrency(row.profit)}</span>
                    <span>{row.commissionRule}</span>
                  </div>
                </article>
              ))}
            </div>
          </Section>

          <Section title="Servicos pelo site" count={report.sections.site.length}>
            <div className="grid gap-3">
              {report.sections.site.map((row) => (
                <article key={row.id} className="rounded-[10px] border border-white/10 bg-black/30 p-4">
                  <p className="font-black uppercase">{row.client}</p>
                  <p className="mt-1 text-sm text-white/55">{row.code} - {row.dateText} {row.timeText} - {row.services} - {row.statusText}</p>
                  <p className="mt-2 text-white/70">Faturamento realizado: <span className="font-black text-white">{formatCurrency(row.financialGross)}</span></p>
                  <p className="mt-1 text-primary">Comissao: {formatCurrency(row.commission)} / Barbearia: {formatCurrency(row.businessShare)}</p>
                </article>
              ))}
            </div>
          </Section>

          <Section title="Atendimentos avulsos" count={report.sections.manual.length}>
            <div className="grid gap-3">
              {report.sections.manual.map((row) => (
                <article key={row.id} className="rounded-[10px] border border-white/10 bg-black/30 p-4">
                  <p className="font-black uppercase">{row.client}</p>
                  <p className="mt-1 text-sm text-white/55">{row.code} - {row.dateText} {row.timeText} - {row.services}</p>
                  <p className="mt-2 text-primary">Comissao: {formatCurrency(row.commission)} / Barbearia: {formatCurrency(row.businessShare)}</p>
                </article>
              ))}
            </div>
          </Section>

          <Section title="Atendimentos de assinantes" count={report.sections.subscription.length}>
            <div className="grid gap-3">
              {report.sections.subscription.map((row) => (
                <article key={row.id} className="rounded-[10px] border border-white/10 bg-black/30 p-4">
                  <p className="font-black uppercase">{row.client}</p>
                  <p className="mt-1 text-sm text-white/55">{row.code} - {row.dateText} {row.timeText} - {row.plan} - {row.services} - {row.statusText}</p>
                </article>
              ))}
            </div>
          </Section>

          <section className="rounded-[12px] border border-primary/20 bg-card p-5 shadow-panel">
            <h2 className="text-xl font-black uppercase">Demonstrativo da comissao</h2>
            <div className="mt-4 grid gap-3 text-sm text-white/70 md:grid-cols-2">
              <p>Servicos pelo site: 50% = <strong className="text-primary">{formatCurrency(report.summary.siteCommission)}</strong></p>
              <p>Avulsos: 50% = <strong className="text-primary">{formatCurrency(report.summary.manualCommission)}</strong></p>
              <p>Assinaturas: pool 40% {formatCurrency(report.summary.subscriptionPool)} ({report.summary.subscriptionBarberAppointments}/{report.summary.subscriptionTotalAppointments}) = <strong className="text-primary">{formatCurrency(report.summary.subscriptionCommission)}</strong></p>
              <p>Vendas elegiveis: 20% do lucro = <strong className="text-primary">{formatCurrency(report.summary.salesCommission)}</strong></p>
              <p>Vendas internas: sem comissao, faturamento {formatCurrency(report.summary.salesWithoutCommissionGross)}</p>
              <p className="font-black uppercase text-primary">Total: {formatCurrency(report.summary.totalCommission)}</p>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
