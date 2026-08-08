"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function StockAdjustForm({ productId, currentStock }: { productId: string; currentStock: number }) {
  const router = useRouter();
  const [stock, setStock] = useState(String(currentStock));
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function submit() {
    setIsLoading(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/internal/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, stock: Number(stock) })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setFeedback(payload?.message ?? "Não foi possível atualizar o estoque.");
        return;
      }

      router.refresh();
    } catch {
      setFeedback("Falha de conexão.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input
        value={stock}
        onChange={(event) => setStock(event.target.value)}
        type="number"
        min={0}
        className="h-11 w-24 rounded-[8px] border border-primary/25 bg-black/40 px-3 font-black text-white outline-none focus:border-primary"
      />
      <Button type="button" onClick={submit} disabled={isLoading}>
        {isLoading ? "Salvando..." : "Atualizar"}
      </Button>
      {feedback ? <p className="basis-full text-sm text-primary">{feedback}</p> : null}
    </div>
  );
}
