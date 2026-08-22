export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { InternalPageHeader } from "@/components/internal/internal-page-header";
import { PlanManagementPanel } from "@/components/internal/plan-management-panel";
import { prisma } from "@/lib/prisma";
import { getDashboardPath } from "@/lib/auth-routes";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

export default async function AdminSettingsPage() {
  const session = await getAuthenticatedUser();
  if (!session) redirect("/login?redirectTo=/admin/configuracoes");
  if (session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER") redirect(getDashboardPath(session.user.role, Boolean(session.user.barber?.id)));

  const plans = await prisma.subscriptionPlan.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-8 text-white">
      <section className="mx-auto max-w-7xl">
        <InternalPageHeader
          eyebrow="Configuracoes"
          title="Configuracoes gerais"
          backHref="/admin"
          backLabel="Painel administrativo"
          role={session.user.role}
          hasBarber={Boolean(session.user.barber?.id)}
        />
        <div className="mt-8 grid gap-6">
          <PlanManagementPanel
            plans={plans.map((plan) => ({
              id: plan.id,
              name: plan.name,
              description: plan.description ?? "",
              value: Number(plan.value),
              benefits: Array.isArray(plan.benefits) ? plan.benefits.join("\n") : "",
              cutsIncluded: plan.cutsIncluded ?? 0,
              periodDays: plan.periodDays,
              active: plan.active
            }))}
          />
          <section className="rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
            <h2 className="text-xl font-black uppercase">Outras configuracoes</h2>
            <p className="mt-3 text-white/65">Nenhuma configuracao geral adicional cadastrada para edicao nesta etapa.</p>
          </section>
        </div>
      </section>
    </main>
  );
}
