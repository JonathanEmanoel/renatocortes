import { Check, Crown } from "lucide-react";
import { Badge } from "@/components/client/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import type { SubscriptionPlan } from "@/types/client-area";

export function SubscriptionCard({
  plan,
  onRequest,
  isLoading
}: {
  plan: SubscriptionPlan;
  onRequest?: (plan: SubscriptionPlan) => void;
  isLoading?: boolean;
}) {
  return (
    <article
      className={cn(
        "relative rounded-[8px] border bg-card p-6 transition hover:-translate-y-1",
        plan.featured ? "border-primary shadow-red" : "border-white/14 hover:border-primary/50"
      )}
    >
      {plan.featured ? (
        <div className="mb-5">
          <Badge>Mais escolhido</Badge>
        </div>
      ) : null}
      <Crown className="h-9 w-9 text-primary" />
      <h3 className="mt-5 text-xl font-black uppercase">{plan.name}</h3>
      <p className="mt-4 text-3xl font-black text-primary">{plan.price}</p>
      {plan.periodicity ? <p className="mt-2 text-sm font-bold uppercase tracking-[0.12em] text-white/45">{plan.periodicity}</p> : null}
      <div className="mt-6 grid gap-3">
        {plan.benefits.map((benefit) => (
          <p key={benefit} className="flex items-center gap-3 text-sm text-white/72">
            <Check className="h-5 w-5 text-primary" />
            {benefit}
          </p>
        ))}
      </div>
      <Button className="mt-8 w-full" variant={plan.featured ? "primary" : "outline"} onClick={() => onRequest?.(plan)} disabled={isLoading}>
        {isLoading ? "Solicitando..." : "Solicitar Plano"}
      </Button>
    </article>
  );
}
