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
        "relative overflow-hidden rounded-[16px] border bg-card p-7 shadow-[0_20px_60px_rgba(0,0,0,0.32)] transition hover:-translate-y-1",
        plan.featured ? "border-primary bg-primary/10 shadow-red" : "border-primary/18 hover:border-primary/55"
      )}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accentRed via-primary to-accentBlue" />
      {plan.featured ? (
        <div className="mb-5">
          <Badge>Mais escolhido</Badge>
        </div>
      ) : null}
      <div className="grid h-14 w-14 place-items-center rounded-full border border-primary/35 bg-black/45">
        <Crown className="h-8 w-8 text-primary" />
      </div>
      <h3 className="mt-6 text-2xl font-black uppercase leading-tight">{plan.name}</h3>
      <p className="mt-5 text-4xl font-black text-primary">{plan.price}</p>
      {plan.periodicity ? <p className="mt-2 text-sm font-bold uppercase tracking-[0.12em] text-white/45">{plan.periodicity}</p> : null}
      <div className="mt-7 grid gap-4">
        {plan.benefits.map((benefit) => (
          <p key={benefit} className="flex items-center gap-3 text-sm font-medium text-white/78">
            <Check className="h-5 w-5 shrink-0 text-primary" />
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
