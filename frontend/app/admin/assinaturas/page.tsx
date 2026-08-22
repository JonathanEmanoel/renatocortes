export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { InternalPageHeader } from "@/components/internal/internal-page-header";
import { SubscriptionActionButtons } from "@/components/internal/subscription-action-buttons";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getDashboardPath } from "@/lib/auth-routes";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

function renewalMessage(input: { clientName: string; planName: string; endDate?: Date | null }) {
  return [
    "Ola!",
    "",
    `Sua assinatura ${input.planName} na Renato Cortes Barbearia esta proxima do vencimento.`,
    input.endDate ? `Vencimento: ${input.endDate.toLocaleDateString("pt-BR")}` : "Vencimento: nao informado",
    "",
    "Podemos renovar para voce manter seus beneficios?",
    "",
    "Obrigado!"
  ].join("\n");
}

function daysRemaining(endDate?: Date | null) {
  if (!endDate) return "Sem vencimento";
  const diff = Math.ceil((endDate.getTime() - Date.now()) / 86_400_000);
  if (diff < 0) return `Vencida ha ${Math.abs(diff)} dia(s)`;
  if (diff === 0) return "Vence hoje";
  return `${diff} dia(s) restantes`;
}

export default async function AdminSubscriptionsPage() {
  const session = await getAuthenticatedUser();
  if (!session) redirect("/login?redirectTo=/admin/assinaturas");
  if (session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER") redirect(getDashboardPath(session.user.role, Boolean(session.user.barber?.id)));

  const now = new Date();
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 7);

  const [priority, active, pending, inactive] = await Promise.all([
    prisma.subscription.findMany({
      where: {
        deletedAt: null,
        status: "ACTIVE",
        OR: [{ endDate: { lte: soon } }, { endDate: null }]
      },
      include: { client: { include: { user: true } }, subscriptionPlan: true },
      orderBy: { endDate: "asc" }
    }),
    prisma.subscription.findMany({
      where: { deletedAt: null, status: "ACTIVE" },
      include: { client: { include: { user: true } }, subscriptionPlan: true },
      orderBy: { endDate: "asc" }
    }),
    prisma.subscription.findMany({
      where: { deletedAt: null, status: "PENDING" },
      include: { client: { include: { user: true } }, subscriptionPlan: true },
      orderBy: { createdAt: "asc" }
    }),
    prisma.subscription.findMany({
      where: { deletedAt: null, status: { in: ["REJECTED", "CANCELED", "EXPIRED"] } },
      include: { client: { include: { user: true } }, subscriptionPlan: true },
      orderBy: { updatedAt: "desc" },
      take: 40
    })
  ]);

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-8 text-white">
      <section className="mx-auto max-w-7xl">
        <InternalPageHeader
          eyebrow="Assinaturas"
          title="Gestao de assinantes"
          backHref="/admin"
          backLabel="Painel administrativo"
          role={session.user.role}
          hasBarber={Boolean(session.user.barber?.id)}
        />

        <section className="mt-8 rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
          <h2 className="text-xl font-black uppercase">Prioridade: vencidas ou proximas do vencimento</h2>
          <div className="mt-5 grid gap-4">
            {priority.length === 0 ? <p className="text-white/65">Nenhuma assinatura em prioridade.</p> : null}
            {priority.map((subscription) => {
              const url = buildWhatsAppUrl(
                renewalMessage({
                  clientName: subscription.client.user.name,
                  planName: subscription.subscriptionPlan.name,
                  endDate: subscription.endDate
                }),
                subscription.client.user.phone
              );
              return (
                <article key={subscription.id} className="rounded-[10px] border border-primary/20 bg-black/30 p-4">
                  <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                    <div>
                      <p className="font-black uppercase">{subscription.client.user.name}</p>
                      <p className="mt-1 text-sm text-white/60">{subscription.subscriptionPlan.name} - {formatCurrency(Number(subscription.subscriptionPlan.value))}</p>
                      <p className="mt-1 text-sm text-white/50">Vence em: {subscription.endDate ? subscription.endDate.toLocaleDateString("pt-BR") : "Nao informado"}</p>
                      <p className="mt-1 text-sm font-bold text-primary">{daysRemaining(subscription.endDate)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      <a href={url} className="rounded-[10px] border border-primary bg-primary px-4 py-3 text-sm font-black uppercase text-black">
                        Renovar no WhatsApp
                      </a>
                      <SubscriptionActionButtons subscriptionId={subscription.id} active />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
            <h2 className="text-xl font-black uppercase">Assinantes ativos</h2>
            <div className="mt-5 grid gap-4">
              {active.length === 0 ? <p className="text-white/65">Nenhuma assinatura ativa.</p> : null}
              {active.map((subscription) => (
                <article key={subscription.id} className="rounded-[10px] border border-white/10 bg-black/30 p-4">
                  <p className="font-black uppercase">{subscription.client.user.name}</p>
                  <p className="mt-1 text-sm text-white/55">{subscription.client.user.phone ?? "Telefone nao informado"}</p>
                  <p className="mt-1 text-sm text-white/60">{subscription.subscriptionPlan.name}</p>
                  <p className="mt-1 text-sm text-primary">{subscription.endDate ? subscription.endDate.toLocaleDateString("pt-BR") : "Sem vencimento"} - {daysRemaining(subscription.endDate)}</p>
                  <SubscriptionActionButtons subscriptionId={subscription.id} active />
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
            <h2 className="text-xl font-black uppercase">Pendentes</h2>
            <div className="mt-5 grid gap-4">
              {pending.length === 0 ? <p className="text-white/65">Nenhuma assinatura pendente.</p> : null}
              {pending.map((subscription) => (
                <article key={subscription.id} className="rounded-[10px] border border-white/10 bg-black/30 p-4">
                  <p className="font-black uppercase">{subscription.client.user.name}</p>
                  <p className="mt-1 text-sm text-white/55">{subscription.client.user.phone ?? "Telefone nao informado"}</p>
                  <p className="mt-1 text-sm text-white/60">{subscription.subscriptionPlan.name}</p>
                  <SubscriptionActionButtons subscriptionId={subscription.id} />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
          <h2 className="text-xl font-black uppercase">Vencidas, canceladas e recusadas</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {inactive.length === 0 ? <p className="text-white/65">Nenhuma assinatura inativa recente.</p> : null}
            {inactive.map((subscription) => (
              <article key={subscription.id} className="rounded-[10px] border border-white/10 bg-black/30 p-4">
                <p className="font-black uppercase">{subscription.client.user.name}</p>
                <p className="mt-1 text-sm text-white/55">{subscription.client.user.phone ?? "Telefone nao informado"}</p>
                <p className="mt-1 text-sm text-white/60">{subscription.subscriptionPlan.name}</p>
                <p className="mt-1 text-sm text-primary">{subscription.status}</p>
                <p className="mt-1 text-sm text-white/50">{subscription.endDate ? subscription.endDate.toLocaleDateString("pt-BR") : "Sem vencimento"}</p>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
