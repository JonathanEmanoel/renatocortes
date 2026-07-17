"use client";

import { useState } from "react";
import { Crown } from "lucide-react";
import { ClientShell } from "@/components/client/client-shell";
import { SectionTitle } from "@/components/client/section-title";
import { SubscriptionCard } from "@/components/client/subscription-card";
import type { SubscriptionPlan } from "@/types/client-area";

export function SubscriptionsContent({ plans }: { plans: SubscriptionPlan[] }) {
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function requestPlan(plan: SubscriptionPlan) {
    setFeedback(null);
    setLoadingPlanId(plan.id);

    try {
      const response = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setFeedback(payload?.message ?? "Não foi possível solicitar a assinatura.");
        return;
      }

      if (payload?.whatsAppUrl) {
        window.open(payload.whatsAppUrl, "_blank", "noopener,noreferrer");
      }

      setFeedback("Solicitação salva. Confirme a assinatura pelo WhatsApp.");
    } catch {
      setFeedback("Falha de conexão. Tente novamente.");
    } finally {
      setLoadingPlanId(null);
    }
  }

  return (
    <ClientShell>
      <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary">Assinaturas</p>
      <h1 className="mt-3 text-3xl font-black uppercase md:text-5xl">Planos premium</h1>

      <section className="mt-8 rounded-[8px] border border-primary/35 bg-gradient-to-br from-primary/18 via-black to-[#080808] p-7">
        <Crown className="h-11 w-11 text-primary" />
        <h2 className="mt-5 max-w-2xl text-2xl font-black uppercase md:text-4xl">Quantidade ilimitada, economia e visual sempre em dia.</h2>
        <p className="mt-4 max-w-xl text-white/68">Escolha o plano ideal e solicite a ativação.</p>
      </section>

      <section className="mt-10">
        <SectionTitle title="Escolha seu plano" />
        {feedback ? <p className="mb-5 rounded-[8px] border border-primary/50 p-4 text-primary">{feedback}</p> : null}
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <SubscriptionCard key={plan.id} plan={plan} onRequest={requestPlan} isLoading={loadingPlanId === plan.id} />
          ))}
        </div>
      </section>
    </ClientShell>
  );
}
