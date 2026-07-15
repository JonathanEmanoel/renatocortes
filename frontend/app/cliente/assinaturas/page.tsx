import { Crown } from "lucide-react";
import { ClientShell } from "@/components/client/client-shell";
import { SectionTitle } from "@/components/client/section-title";
import { SubscriptionCard } from "@/components/client/subscription-card";
import { plans } from "@/utils/client-mocks";

export default function SubscriptionsPage() {
  return (
    <ClientShell>
      <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary">Assinaturas</p>
      <h1 className="mt-3 text-3xl font-black uppercase md:text-5xl">Planos premium</h1>

      <section className="mt-8 rounded-[8px] border border-primary/35 bg-gradient-to-br from-primary/18 via-black to-[#080808] p-7">
        <Crown className="h-11 w-11 text-primary" />
        <h2 className="mt-5 max-w-2xl text-2xl font-black uppercase md:text-4xl">Quantidade ilimitada, economia e visual sempre em dia.</h2>
        <p className="mt-4 max-w-xl text-white/68">Escolha o plano ideal e solicite a ativação. Tudo segue mockado nesta etapa.</p>
      </section>

      <section className="mt-10">
        <SectionTitle title="Escolha seu plano" />
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <SubscriptionCard key={plan.id} plan={plan} />
          ))}
        </div>
      </section>
    </ClientShell>
  );
}
