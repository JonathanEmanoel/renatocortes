"use client";

import { useEffect, useState } from "react";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { ClientShell } from "@/components/client/client-shell";
import { SectionTitle } from "@/components/client/section-title";
import { Button } from "@/components/ui/button";
import { readStoredCart, type StoredCartItem, writeStoredCart } from "@/lib/cart";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

export function CartContent() {
  const [items, setItems] = useState<StoredCartItem[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const total = items.reduce((sum, item) => sum + item.priceValue * item.quantity, 0);

  useEffect(() => {
    setItems(readStoredCart());
  }, []);

  function persist(next: StoredCartItem[]) {
    setItems(next);
    writeStoredCart(next);
  }

  function updateQuantity(productId: string, delta: number) {
    persist(
      items.map((item) =>
        item.id === productId ? { ...item, quantity: Math.max(1, Math.min(item.stock, item.quantity + delta)) } : item
      )
    );
  }

  function removeItem(productId: string) {
    persist(items.filter((item) => item.id !== productId));
  }

  async function finishOrder() {
    setFeedback(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item) => ({
            productId: item.id,
            quantity: item.quantity
          }))
        })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setFeedback(payload?.message ?? "Não foi possível finalizar o pedido.");
        return;
      }

      if (payload?.whatsAppUrl) {
        window.open(payload.whatsAppUrl, "_blank", "noopener,noreferrer");
      }

      persist([]);
      setFeedback("Pedido salvo. Confirme a compra pelo WhatsApp.");
    } catch {
      setFeedback("Falha de conexão. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ClientShell>
      <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary">Carrinho</p>
      <h1 className="mt-3 text-3xl font-black uppercase md:text-5xl">Seu pedido</h1>

      <section className="mt-9">
        <SectionTitle title="Produtos" />
        <div className="grid gap-4">
          {items.length === 0 ? (
            <div className="rounded-[8px] border border-white/14 bg-card p-7 text-center">
              <p className="text-lg font-bold">Seu carrinho está vazio.</p>
            </div>
          ) : null}
          {items.map((item) => (
            <article key={item.id} className="grid gap-4 rounded-[8px] border border-white/14 bg-card p-4 md:grid-cols-[80px_1fr_auto] md:items-center">
              <div className="grid aspect-square place-items-center rounded-[8px] bg-black/50">
                <ShoppingBag className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="font-black uppercase">{item.name}</h2>
                <p className="mt-2 text-sm text-white/58">{item.price}</p>
                <div className="mt-4 flex items-center gap-3">
                  <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Diminuir" onClick={() => updateQuantity(item.id, -1)}>
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="font-black">{item.quantity}</span>
                  <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Aumentar" onClick={() => updateQuantity(item.id, 1)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-5 md:block md:text-right">
                <p className="text-xl font-black text-primary">{formatCurrency(item.priceValue * item.quantity)}</p>
                <Button variant="ghost" size="icon" className="mt-0 md:mt-3" aria-label="Remover" onClick={() => removeItem(item.id)}>
                  <Trash2 className="h-5 w-5" />
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-[8px] border border-primary/35 bg-card p-6">
        <div className="flex items-center justify-between gap-4">
          <span className="text-white/60">Total</span>
          <strong className="text-3xl text-primary">{formatCurrency(total)}</strong>
        </div>
        {feedback ? <p className="mt-6 rounded-[8px] border border-primary/50 p-4 text-primary">{feedback}</p> : null}
        <Button className="mt-7 w-full" onClick={finishOrder} disabled={isSubmitting || items.length === 0}>
          {isSubmitting ? "Finalizando..." : "Finalizar Pedido"}
        </Button>
      </section>
    </ClientShell>
  );
}
