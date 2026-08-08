"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Crown, XCircle } from "lucide-react";
import { ClientShell } from "@/components/client/client-shell";
import { Badge } from "@/components/client/badge";
import { SectionTitle } from "@/components/client/section-title";
import { SubscriptionCard } from "@/components/client/subscription-card";
import { Button } from "@/components/ui/button";
import type { SubscriptionPlan } from "@/types/client-area";

type CurrentSubscription = {
  id: string;
  status: "ACTIVE" | "PENDING";
  planId: string;
  planName: string;
  price: string;
  renewalDate: string | null;
  benefits: string[];
};

export function SubscriptionsContent({ plans, currentSubscription }: { plans: SubscriptionPlan[]; currentSubscription: CurrentSubscription | null }) {
  const router = useRouter();
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function sendRequest(body: object, successMessage: string) {
    const response = await fetch("/api/subscriptions", {
      method: currentSubscription ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message ?? "Não foi possível atualizar a assinatura.");
    setFeedback(payload?.message ?? successMessage);
    router.refresh();
    return payload;
  }

  async function selectPlan(plan: SubscriptionPlan) {
    setFeedback(null);
    setLoadingPlanId(plan.id);
    try {
      if (currentSubscription) {
        if (plan.id === currentSubscription.planId) return;
        await sendRequest({ action: "change", subscriptionId: currentSubscription.id, planId: plan.id }, "Plano alterado com sucesso.");
        return;
      }

      const payload = await sendRequest({ planId: plan.id }, "Solicitação salva. Confirme a assinatura pelo WhatsApp.");
      if (payload?.whatsAppUrl) window.open(payload.whatsAppUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Falha de conexão. Tente novamente.");
    } finally {
      setLoadingPlanId(null);
    }
  }

  async function cancelSubscription() {
    if (!currentSubscription || !window.confirm("Deseja cancelar sua assinatura? Seus benefícios deixarão de estar disponíveis.")) return;
    setFeedback(null);
    setIsCancelling(true);
    try {
      await sendRequest({ action: "cancel", subscriptionId: currentSubscription.id }, "Assinatura cancelada com sucesso.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Falha de conexão. Tente novamente.");
    } finally {
      setIsCancelling(false);
    }
  }

  const renewal = currentSubscription?.renewalDate
    ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(currentSubscription.renewalDate))
    : "A definir";

  return (
    <ClientShell>
      <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary">Assinaturas</p>
      <h1 className="mt-3 text-3xl font-black uppercase md:text-5xl">Planos premium</h1>

      {currentSubscription ? (
        <section className="mt-8 rounded-[14px] border border-primary/35 bg-gradient-to-br from-primary/18 via-black to-[#080808] p-7 shadow-panel">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="grid h-14 w-14 place-items-center rounded-full border border-primary/40 bg-primary/10"><Crown className="h-8 w-8 text-primary" /></div>
              <div className="mt-5 flex items-center gap-3"><h2 className="text-2xl font-black uppercase md:text-4xl">{currentSubscription.planName}</h2><Badge tone={currentSubscription.status === "ACTIVE" ? "green" : "white"}>{currentSubscription.status === "ACTIVE" ? "Ativa" : "Em análise"}</Badge></div>
              <p className="mt-3 text-lg font-bold text-primary">{currentSubscription.price} <span className="text-sm font-medium text-white/55">por mês</span></p>
            </div>
            <Button type="button" variant="outline" onClick={cancelSubscription} disabled={isCancelling}>{isCancelling ? "Cancelando..." : "Cancelar assinatura"}<XCircle className="h-5 w-5" /></Button>
          </div>
          <div className="mt-7 grid gap-4 border-t border-white/10 pt-6 md:grid-cols-2">
            <p className="flex items-center gap-3 text-white/75"><CalendarClock className="h-5 w-5 text-primary" />{currentSubscription.status === "ACTIVE" ? `Renovação em ${renewal}` : "Aguardando confirmação da barbearia"}</p>
            <p className="text-sm text-white/55">Para alterar o plano, escolha outra opção abaixo.</p>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {currentSubscription.benefits.map((benefit) => <p key={benefit} className="flex items-center gap-2 text-sm text-white/75"><Check className="h-4 w-4 shrink-0 text-primary" />{benefit}</p>)}
          </div>
        </section>
      ) : (
        <section className="mt-8 rounded-[14px] border border-primary/35 bg-gradient-to-br from-primary/18 via-black to-[#080808] p-7 shadow-panel">
          <div className="grid h-14 w-14 place-items-center rounded-full border border-primary/40 bg-primary/10"><Crown className="h-8 w-8 text-primary" /></div>
          <h2 className="mt-5 max-w-2xl text-2xl font-black uppercase md:text-4xl">Quantidade ilimitada, economia e visual sempre em dia.</h2>
          <p className="mt-4 max-w-xl text-white/68">Escolha o plano ideal e solicite a ativação.</p>
        </section>
      )}

      <section className="mt-10">
        <SectionTitle title={currentSubscription ? "Alterar plano" : "Escolha seu plano"} />
        {feedback ? <p className="mb-5 rounded-[8px] border border-primary/50 p-4 text-primary">{feedback}</p> : null}
        <div className="grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => <SubscriptionCard key={plan.id} plan={plan} onRequest={selectPlan} isLoading={loadingPlanId === plan.id} disabled={plan.id === currentSubscription?.planId} actionLabel={plan.id === currentSubscription?.planId ? "Plano atual" : currentSubscription ? "Alterar para este plano" : "Solicitar plano"} />)}
        </div>
      </section>
    </ClientShell>
  );
}
