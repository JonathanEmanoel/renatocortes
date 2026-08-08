export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { InternalPageHeader } from "@/components/internal/internal-page-header";
import { SaleActionButtons } from "@/components/internal/sale-action-buttons";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

function addressLabel(address: unknown) {
  if (!address || typeof address !== "object") return "Nao informado";
  const value = address as { street?: string; number?: string; neighborhood?: string; complement?: string };
  return [value.street, value.number, value.neighborhood, value.complement].filter(Boolean).join(", ") || "Nao informado";
}

const statusLabels = {
  OPEN: "Pendente",
  COMPLETED: "Finalizado",
  CANCELED: "Cancelado"
} as const;

type SaleWithRelations = Awaited<ReturnType<typeof prisma.sale.findMany>>[number] & {
  client: { user: { name: string; phone: string | null } } | null;
  items: { id: string; quantity: number; price: unknown; product: { name: string } }[];
};

function saleMatchesSearch(sale: SaleWithRelations, search: string) {
  if (!search) return true;
  const term = search.toLowerCase();
  return [
    sale.id,
    sale.customerName,
    sale.customerPhone,
    sale.client?.user.name,
    sale.client?.user.phone
  ].some((value) => String(value ?? "").toLowerCase().includes(term));
}

function inDateRange(sale: SaleWithRelations, from?: string, to?: string) {
  const created = sale.createdAt.getTime();
  if (from && created < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && created > new Date(`${to}T23:59:59`).getTime()) return false;
  return true;
}

function OrderCard({ sale }: { sale: SaleWithRelations }) {
  return (
    <article className="rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-white/45">Pedido</p>
          <h2 className="font-black uppercase">{sale.id.slice(0, 8)}</h2>
          <p className="mt-2 text-sm text-white/60">{sale.createdAt.toLocaleDateString("pt-BR")} {sale.createdAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
        </div>
        <div className="lg:text-right">
          <p className="text-sm uppercase text-white/55">Status</p>
          <p className="font-black uppercase text-primary">{statusLabels[sale.status]}</p>
          <p className="mt-2 text-2xl font-black text-primary">{formatCurrency(Number(sale.totalValue))}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className="rounded-[10px] border border-white/10 bg-black/30 p-4">
          <p className="text-xs uppercase text-white/45">Cliente</p>
          <p className="font-black uppercase">{sale.customerName || sale.client?.user.name || "Nao informado"}</p>
          <p className="mt-1 text-sm text-white/60">{sale.customerPhone || sale.client?.user.phone || "Nao informado"}</p>
        </div>
        <div className="rounded-[10px] border border-white/10 bg-black/30 p-4">
          <p className="text-xs uppercase text-white/45">Recebimento</p>
          <p className="font-bold">{sale.deliveryMethod || "Nao informado"}</p>
          <p className="mt-1 text-sm text-white/60">{addressLabel(sale.deliveryAddress)}</p>
        </div>
        <div className="rounded-[10px] border border-white/10 bg-black/30 p-4">
          <p className="text-xs uppercase text-white/45">Observacoes</p>
          <p className="text-sm text-white/65">{sale.observations || "Nenhuma"}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {sale.items.map((item) => (
          <div key={item.id} className="flex flex-col justify-between gap-2 rounded-[10px] border border-white/10 bg-black/30 p-3 sm:flex-row sm:items-center">
            <div>
              <p className="font-black uppercase">{item.product.name}</p>
              <p className="text-sm text-white/55">Qtd: {item.quantity}</p>
            </div>
            <p className="font-black text-primary">{formatCurrency(Number(item.price) * item.quantity)}</p>
          </div>
        ))}
      </div>

      {sale.status === "OPEN" ? <SaleActionButtons saleId={sale.id} /> : null}
    </article>
  );
}

function OrderSection({ title, empty, sales }: { title: string; empty: string; sales: SaleWithRelations[] }) {
  return (
    <section className="grid gap-4">
      <h2 className="text-xl font-black uppercase text-primary">{title}</h2>
      {sales.length === 0 ? <p className="rounded-[12px] border border-primary/20 bg-card p-6 text-white/65">{empty}</p> : null}
      {sales.map((sale) => <OrderCard key={sale.id} sale={sale} />)}
    </section>
  );
}

export default async function AdminOrdersPage({ searchParams }: { searchParams?: Promise<{ status?: string; search?: string; from?: string; to?: string }> }) {
  const session = await getAuthenticatedUser();
  if (!session) redirect("/login?redirectTo=/admin/pedidos");
  if (session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER") redirect("/cliente");
  const filters = (await searchParams) ?? {};

  const sales = await prisma.sale.findMany({
    where: { deletedAt: null },
    include: { client: { include: { user: true } }, items: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
    take: 80
  });
  const filteredSales = sales.filter((sale) => {
    if (filters.status && filters.status !== "ALL" && sale.status !== filters.status) return false;
    return saleMatchesSearch(sale, filters.search ?? "") && inDateRange(sale, filters.from, filters.to);
  });
  const pending = filteredSales.filter((sale) => sale.status === "OPEN");
  const completed = filteredSales.filter((sale) => sale.status === "COMPLETED");
  const canceled = filteredSales.filter((sale) => sale.status === "CANCELED");

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-8 text-white">
      <section className="mx-auto max-w-7xl">
        <InternalPageHeader
          eyebrow="Pedidos"
          title="Gestao de pedidos"
          backHref="/admin"
          backLabel="Painel administrativo"
          role={session.user.role}
          hasBarber={Boolean(session.user.barber?.id)}
        />

        <form className="mt-8 grid gap-3 rounded-[12px] border border-primary/20 bg-card p-4 shadow-panel md:grid-cols-4" action="/admin/pedidos">
          <select name="status" defaultValue={filters.status ?? "ALL"} className="min-h-12 rounded-[10px] border border-primary/20 bg-black/45 px-4 font-semibold text-white outline-none">
            <option value="ALL">Todos os status</option>
            <option value="OPEN">Pendentes</option>
            <option value="COMPLETED">Finalizados</option>
            <option value="CANCELED">Cancelados</option>
          </select>
          <input name="search" defaultValue={filters.search ?? ""} placeholder="Buscar cliente ou telefone" className="min-h-12 rounded-[10px] border border-primary/20 bg-black/45 px-4 font-semibold text-white outline-none" />
          <input name="from" defaultValue={filters.from ?? ""} type="date" className="min-h-12 rounded-[10px] border border-primary/20 bg-black/45 px-4 font-semibold text-white outline-none" />
          <input name="to" defaultValue={filters.to ?? ""} type="date" className="min-h-12 rounded-[10px] border border-primary/20 bg-black/45 px-4 font-semibold text-white outline-none" />
          <button className="min-h-12 rounded-[10px] bg-primary px-4 font-black uppercase text-black md:col-span-4" type="submit">
            Filtrar pedidos
          </button>
        </form>

        <p className="mt-6 rounded-[10px] border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-black uppercase text-primary">
          {pending.length} pedido(s) pendente(s)
        </p>

        <div className="mt-8 grid gap-8">
          <OrderSection title="Pendentes" empty="Nenhum pedido pendente." sales={pending} />
          <OrderSection title="Finalizados" empty="Nenhum pedido finalizado neste filtro." sales={completed} />
          <OrderSection title="Cancelados" empty="Nenhum pedido cancelado neste filtro." sales={canceled} />
        </div>
      </section>
    </main>
  );
}
