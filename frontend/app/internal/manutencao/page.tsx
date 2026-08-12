export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Database, History, ShieldAlert } from "lucide-react";
import { MaintenanceConsole } from "@/components/internal/maintenance-console";
import { InternalPageHeader } from "@/components/internal/internal-page-header";
import { getMaintenanceData, maintenanceCategories, type MaintenanceCategory, type MaintenanceFilters } from "@/lib/server/maintenance";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const inputClass = "min-h-12 rounded-[10px] border border-primary/20 bg-black/45 px-4 font-semibold text-white outline-none transition focus:border-primary";

function first(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function parseFilters(params: Record<string, string | string[] | undefined>): MaintenanceFilters {
  const category = first(params, "category");
  const view = first(params, "view");
  const validCategory = maintenanceCategories.some((item) => item.id === category) ? category as MaintenanceCategory : "accounts";
  return {
    category: validCategory,
    view: view === "hidden" ? "hidden" : "active",
    q: first(params, "q") || undefined,
    barberId: first(params, "barberId") || undefined,
    clientId: first(params, "clientId") || undefined,
    status: first(params, "status") || undefined,
    startDate: first(params, "startDate") || undefined,
    endDate: first(params, "endDate") || undefined
  };
}

export default async function MaintenancePage({ searchParams }: PageProps) {
  const session = await getAuthenticatedUser();
  if (!session) redirect("/login?redirectTo=/internal/manutencao");

  if (session.user.role !== "DEVELOPER") {
    return (
      <main className="min-h-screen bg-barber-radial px-5 py-10 text-white">
        <section className="mx-auto max-w-3xl rounded-[14px] border border-red-500/30 bg-red-500/10 p-8 text-red-100 shadow-panel">
          <ShieldAlert className="h-10 w-10" />
          <h1 className="mt-4 text-3xl font-black uppercase">Acesso negado</h1>
          <p className="mt-3 text-white/70">Esta area e exclusiva para usuarios com role DEVELOPER. Administradores, barbeiros e clientes nao podem acessar.</p>
          <Link href="/" className="mt-6 inline-flex rounded-[10px] border border-red-300/40 px-4 py-3 text-sm font-black uppercase text-red-100 transition hover:bg-red-500 hover:text-white">
            Voltar
          </Link>
        </section>
      </main>
    );
  }

  const params = (await searchParams) ?? {};
  const filters = parseFilters(params);
  const data = await getMaintenanceData(filters, session.user.id);
  const activeHref = `/internal/manutencao?category=${filters.category}`;
  const hiddenHref = `/internal/manutencao?category=${filters.category}&view=hidden`;

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-8 text-white">
      <section className="mx-auto max-w-7xl">
        <InternalPageHeader
          eyebrow="Developer"
          title="Central de manutencao"
          backHref="/admin"
          backLabel="Painel do desenvolvedor"
          role={session.user.role}
          hasBarber={Boolean(session.user.barber?.id)}
        />

        <div className="mt-8 rounded-[12px] border border-red-500/30 bg-red-500/10 p-5 text-red-100">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-1 h-6 w-6 shrink-0" />
            <div>
              <h2 className="font-black uppercase">Ferramenta destrutiva com preview obrigatorio</h2>
              <p className="mt-1 text-sm text-white/70">
                Use esta central somente para dados de teste. Nenhuma operacao acontece sem selecao manual, pre-visualizacao de impacto e confirmacao digitando EXCLUIR.
              </p>
            </div>
          </div>
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {maintenanceCategories.map((category) => (
            <Link
              key={category.id}
              href={`/internal/manutencao?category=${category.id}`}
              className={`rounded-[12px] border p-4 shadow-panel transition hover:border-primary ${filters.category === category.id ? "border-primary bg-primary/10" : "border-primary/20 bg-card"}`}
            >
              <Database className="h-6 w-6 text-primary" />
              <p className="mt-3 text-sm font-black uppercase">{category.label}</p>
              <strong className="mt-2 block text-2xl text-primary">{data.counters[category.id]}</strong>
            </Link>
          ))}
        </section>

        <form className="mt-8 rounded-[12px] border border-primary/20 bg-card p-5 shadow-panel" action="/internal/manutencao">
          <input type="hidden" name="category" value={filters.category} />
          <input type="hidden" name="view" value={filters.view ?? "active"} />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70 xl:col-span-2">
              Buscar
              <input name="q" defaultValue={filters.q} placeholder="Nome, e-mail, ID, cliente..." className={inputClass} />
            </label>
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
              Barbeiro
              <select name="barberId" defaultValue={filters.barberId ?? ""} className={inputClass}>
                <option value="">Todos</option>
                {data.options.barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.label}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
              Cliente
              <select name="clientId" defaultValue={filters.clientId ?? ""} className={inputClass}>
                <option value="">Todos</option>
                {data.options.clients.map((client) => <option key={client.id} value={client.id}>{client.label}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
              Inicio
              <input name="startDate" type="date" defaultValue={filters.startDate} className={inputClass} />
            </label>
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
              Fim
              <input name="endDate" type="date" defaultValue={filters.endDate} className={inputClass} />
            </label>
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
              Status
              <select name="status" defaultValue={filters.status ?? ""} className={inputClass}>
                <option value="">Todos</option>
                <option value="PENDING">Pendente</option>
                <option value="CONFIRMED">Confirmado</option>
                <option value="COMPLETED">Concluido</option>
                <option value="CANCELED">Cancelado</option>
                <option value="REJECTED">Rejeitado</option>
                <option value="OPEN">Aberto</option>
                <option value="PAID">Pago</option>
              </select>
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button className="min-h-12 rounded-[10px] bg-primary px-6 text-sm font-black uppercase text-black transition hover:brightness-110">Aplicar filtros</button>
            <Link href={`/internal/manutencao?category=${filters.category}${filters.view === "hidden" ? "&view=hidden" : ""}`} className="inline-flex min-h-12 items-center rounded-[10px] border border-primary/40 px-6 text-sm font-black uppercase text-primary transition hover:bg-primary hover:text-black">
              Limpar filtros
            </Link>
          </div>
        </form>

        <section className="mt-8 rounded-[12px] border border-primary/20 bg-card p-5 shadow-panel">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary">Categoria selecionada</p>
              <h2 className="mt-2 text-2xl font-black uppercase">{maintenanceCategories.find((item) => item.id === filters.category)?.label}</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href={activeHref}
                className={`inline-flex min-h-11 items-center rounded-[10px] border px-4 text-sm font-black uppercase transition ${filters.view === "hidden" ? "border-primary/35 text-primary hover:bg-primary/10" : "border-primary bg-primary text-black"}`}
              >
                Registros ativos
              </Link>
              <Link
                href={hiddenHref}
                className={`inline-flex min-h-11 items-center rounded-[10px] border px-4 text-sm font-black uppercase transition ${filters.view === "hidden" ? "border-primary bg-primary text-black" : "border-primary/35 text-primary hover:bg-primary/10"}`}
              >
                Registros ocultos
              </Link>
            </div>
          </div>
          <MaintenanceConsole category={filters.category} rows={data.rows} hiddenView={filters.view === "hidden"} />
        </section>

        <section className="mt-8 rounded-[12px] border border-primary/20 bg-card p-5 shadow-panel">
          <div className="flex items-center gap-3">
            <History className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-black uppercase">Ultimas operacoes</h2>
          </div>
          <div className="mt-5 grid gap-3">
            {data.history.length === 0 ? <p className="text-white/60">Nenhuma operacao de manutencao registrada ainda.</p> : null}
            {data.history.map((item) => (
              <article key={item.id} className="rounded-[10px] border border-white/10 bg-black/30 p-4">
                <p className="font-black uppercase">{item.action}</p>
                <p className="mt-1 text-sm text-white/60">{item.createdAt} - {item.user} - {item.entity}</p>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
