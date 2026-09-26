export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { InternalPageHeader } from "@/components/internal/internal-page-header";
import { SubscriptionPayoutPanel } from "@/components/internal/subscription-payout-panel";
import { getDashboardPath } from "@/lib/auth-routes";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";
import { calculateSubscriptionPayouts, currentCompetenceMonth } from "@/lib/server/subscription-payouts";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/*
 * Tela administrativa do fechamento de assinaturas.
 * A pagina fica restrita a ADMIN/DEVELOPER; barbeiros veem seus ganhos no painel
 * proprio depois que o repasse for pago.
 */
export default async function SubscriptionPayoutsPage({ searchParams }: PageProps) {
  const session = await getAuthenticatedUser();
  if (!session) redirect("/login?redirectTo=/admin/equipe/repasses");
  if (session.user.role !== "ADMIN") {
    redirect(getDashboardPath(session.user.role, Boolean(session.user.barber?.id)));
  }

  const params = (await searchParams) ?? {};
  const competenceMonth = firstParam(params.competenceMonth) ?? currentCompetenceMonth();
  const calculation = await calculateSubscriptionPayouts(competenceMonth);

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-8 text-white">
      <section className="mx-auto max-w-7xl">
        <InternalPageHeader
          eyebrow="Equipe"
          title="Repasses de assinaturas"
          backHref="/admin/equipe"
          backLabel="Desempenho dos profissionais"
          role={session.user.role}
          hasBarber={Boolean(session.user.barber?.id)}
        />

        <SubscriptionPayoutPanel {...calculation} />
      </section>
    </main>
  );
}
