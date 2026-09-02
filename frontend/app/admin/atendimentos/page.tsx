export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { InternalPageHeader } from "@/components/internal/internal-page-header";
import { ManualServiceChangeActions } from "@/components/internal/manual-service-change-actions";
import { ManualServiceForm } from "@/components/internal/manual-service-form";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getDashboardPath } from "@/lib/auth-routes";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";
import { activeSubscribersForManualService, manualServiceTotals, requestTypeLabel } from "@/lib/server/manual-services";

export default async function AdminManualServicesPage() {
  const session = await getAuthenticatedUser();
  if (!session) redirect("/login?redirectTo=/admin/atendimentos");
  if (session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER") redirect(getDashboardPath(session.user.role, Boolean(session.user.barber?.id)));

  const [services, barbers, subscribers, pendingRequests] = await Promise.all([
    prisma.service.findMany({ where: { active: true, deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.barber.findMany({ where: { active: true, deletedAt: null }, include: { user: true }, orderBy: { user: { name: "asc" } } }),
    activeSubscribersForManualService(),
    prisma.manualServiceChangeRequest.findMany({
      where: { status: "PENDING" },
      include: {
        requestedBy: true,
        manualService: {
          include: {
            barber: { include: { user: true } },
            client: { include: { user: true } },
            items: { include: { service: true } }
          }
        }
      },
      orderBy: { createdAt: "asc" }
    })
  ]);

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-8 text-white">
      <section className="mx-auto max-w-7xl">
        <InternalPageHeader
          eyebrow="Atendimentos"
          title="Atendimento avulso"
          backHref="/admin"
          backLabel="Painel administrativo"
          role={session.user.role}
          hasBarber={Boolean(session.user.barber?.id)}
        />
        <section className="mt-8 rounded-[12px] border border-primary/20 bg-card p-5 shadow-panel">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">Aprovacao</p>
              <h2 className="text-2xl font-black uppercase">Alteracoes de atendimentos avulsos</h2>
            </div>
            <span className="rounded-[10px] border border-primary/30 px-3 py-2 text-sm font-black uppercase text-primary">
              {pendingRequests.length} pendente(s)
            </span>
          </div>
          <div className="mt-5 grid gap-3">
            {pendingRequests.length === 0 ? (
              <p className="rounded-[10px] border border-white/10 bg-black/30 p-4 text-sm text-white/60">Nenhuma alteracao pendente.</p>
            ) : null}
            {pendingRequests.map((request) => {
              const totals = manualServiceTotals(request.manualService);
              return (
                <article key={request.id} className="rounded-[10px] border border-white/10 bg-black/30 p-4">
                  <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">{requestTypeLabel(request.type)}</p>
                      <h3 className="mt-1 text-lg font-black uppercase">
                        {request.manualService.customerName ?? request.manualService.client?.user.name ?? "Cliente nao informado"}
                      </h3>
                      <p className="mt-1 text-sm text-white/55">
                        {request.manualService.barber.user.name} - {request.manualService.serviceDate.toLocaleDateString("pt-BR")} - {request.manualService.items.map((item) => `${item.service.name}${item.quantity > 1 ? ` x${item.quantity}` : ""}`).join(" + ")}
                      </p>
                      <p className="mt-2 text-sm text-white/60">
                        Solicitado por {request.requestedBy?.name ?? "usuario nao informado"} em {request.createdAt.toLocaleString("pt-BR")}.
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className="text-xs uppercase text-white/50">Impacto atual</p>
                      <strong className="text-primary">{formatCurrency(totals.chargedGross)}</strong>
                      <p className="text-sm text-white/55">Comissao {formatCurrency(totals.commission)}</p>
                    </div>
                  </div>
                  <ManualServiceChangeActions requestId={request.id} />
                </article>
              );
            })}
          </div>
        </section>

        <div className="mt-8">
          <ManualServiceForm
            services={services.map((service) => ({ id: service.id, name: service.name, price: Number(service.price) }))}
            barbers={barbers.map((barber) => ({ id: barber.id, name: barber.user.name }))}
            subscribers={subscribers}
            canChooseBarber
          />
        </div>
      </section>
    </main>
  );
}
