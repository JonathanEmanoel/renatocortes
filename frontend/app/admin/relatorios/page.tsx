export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { InternalPageHeader } from "@/components/internal/internal-page-header";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

export default async function AdminReportsPage() {
  const session = await getAuthenticatedUser();
  if (!session) redirect("/login?redirectTo=/admin/relatorios");
  if (session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER") redirect("/cliente");

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [sales, expenses, servicesRanking, productsRanking, allServices, allProducts] = await Promise.all([
    prisma.sale.findMany({ where: { createdAt: { gte: monthStart }, status: "COMPLETED", deletedAt: null }, select: { totalValue: true } }),
    prisma.expense.findMany({ where: { createdAt: { gte: monthStart }, deletedAt: null }, select: { amount: true } }),
    prisma.appointment.groupBy({ by: ["serviceId"], where: { createdAt: { gte: monthStart }, deletedAt: null }, _count: { _all: true }, orderBy: { _count: { serviceId: "desc" } }, take: 8 }),
    prisma.saleItem.groupBy({ by: ["productId"], where: { sale: { createdAt: { gte: monthStart }, deletedAt: null } }, _sum: { quantity: true }, orderBy: { _sum: { quantity: "desc" } }, take: 8 }),
    prisma.service.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
    prisma.product.findMany({ where: { deletedAt: null }, select: { id: true, name: true } })
  ]);

  const serviceById = new Map(allServices.map((service) => [service.id, service.name]));
  const productById = new Map(allProducts.map((product) => [product.id, product.name]));
  const revenue = sales.reduce((sum, sale) => sum + Number(sale.totalValue), 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);

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

        <div className="mt-8 flex flex-wrap gap-3">
          <a href="/api/internal/reports/export?format=csv" className="inline-flex rounded-[10px] border border-primary/40 px-4 py-3 text-sm font-black uppercase text-primary">
            <Download className="mr-2 h-4 w-4" /> Excel
          </a>
          <a href="/api/internal/reports/export?format=html" target="_blank" rel="noreferrer" className="inline-flex rounded-[10px] border border-primary/40 px-4 py-3 text-sm font-black uppercase text-primary">
            <Download className="mr-2 h-4 w-4" /> PDF
          </a>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[["Receita do mes", revenue], ["Despesas do mes", expenseTotal], ["Lucro liquido", revenue - expenseTotal]].map(([label, value]) => (
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
                  <span>{serviceById.get(item.serviceId) ?? item.serviceId}</span>
                  <strong className="text-primary">{item._count._all}</strong>
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
