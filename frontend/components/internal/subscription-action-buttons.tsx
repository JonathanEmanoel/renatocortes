"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type SubscriptionAction = "approve" | "reject" | "cancel";

export function SubscriptionActionButtons({ subscriptionId, active }: { subscriptionId: string; active?: boolean }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function runAction(action: SubscriptionAction) {
    if ((action === "reject" || action === "cancel") && !window.confirm("Confirmar esta alteracao na assinatura?")) return;

    setIsLoading(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/internal/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId, action })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setFeedback(payload?.message ?? "Nao foi possivel alterar a assinatura.");
        return;
      }

      router.refresh();
    } catch {
      setFeedback("Falha de conexao.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {active ? (
          <Button type="button" variant="outline" onClick={() => runAction("cancel")} disabled={isLoading}>Cancelar assinatura</Button>
        ) : (
          <>
            <Button type="button" onClick={() => runAction("approve")} disabled={isLoading}>Aprovar</Button>
            <Button type="button" variant="outline" onClick={() => runAction("reject")} disabled={isLoading}>Recusar</Button>
          </>
        )}
      </div>
      {feedback ? <p className="mt-3 rounded-[8px] border border-primary/50 p-3 text-sm text-primary">{feedback}</p> : null}
    </div>
  );
}
