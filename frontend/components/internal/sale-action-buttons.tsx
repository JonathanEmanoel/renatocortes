"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SaleActionButtons({ saleId }: { saleId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"complete" | "cancel" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function runAction(action: "complete" | "cancel") {
    if (!window.confirm(action === "complete" ? "Finalizar este pedido e baixar estoque?" : "Cancelar este pedido?")) return;
    setLoading(action);
    setFeedback(null);

    try {
      const response = await fetch("/api/internal/sales", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleId, action })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setFeedback(payload?.message ?? "Nao foi possivel alterar o pedido.");
        return;
      }
      setFeedback(action === "complete" ? "Pedido finalizado com sucesso." : "Pedido cancelado com sucesso.");
      router.refresh();
    } catch {
      setFeedback("Falha de conexao.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => runAction("complete")} disabled={loading !== null}>
          {loading === "complete" ? "Finalizando..." : "Finalizar pedido"}
        </Button>
        <Button type="button" variant="outline" onClick={() => runAction("cancel")} disabled={loading !== null}>
          {loading === "cancel" ? "Cancelando..." : "Cancelar"}
        </Button>
      </div>
      {feedback ? <p className="mt-3 rounded-[8px] border border-primary/50 p-3 text-sm text-primary">{feedback}</p> : null}
    </div>
  );
}
