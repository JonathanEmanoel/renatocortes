"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { ClientShell } from "@/components/client/client-shell";
import { SectionTitle } from "@/components/client/section-title";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/store/cart-store";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

export function CartContent() {
  const items = useCartStore((state) => state.items);
  const removeItem = useCartStore((state) => state.removeItem);
  const increaseQuantity = useCartStore((state) => state.increaseQuantity);
  const decreaseQuantity = useCartStore((state) => state.decreaseQuantity);
  const total = items.reduce((sum, item) => sum + item.priceValue * item.quantity, 0);
  const router = useRouter();

  return (
    <ClientShell>
      <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary">Carrinho</p>
      <h1 className="mt-3 text-3xl font-black uppercase md:text-5xl">Seu pedido</h1>

      <section className="mt-9">
        <SectionTitle title="Produtos" />
        <div className="grid gap-4">
          {items.length === 0 ? (
            <div className="rounded-[12px] border border-primary/20 bg-card p-7 text-center">
              <ShoppingBag className="mx-auto h-12 w-12 text-primary" />
              <p className="mt-4 text-lg font-bold">Seu carrinho está vazio.</p>
              <Link href="/cliente/loja" className="mt-4 inline-flex rounded-[10px] border border-primary px-6 py-3 font-black uppercase text-primary transition hover:bg-primary/10">
                Continuar comprando
              </Link>
            </div>
          ) : null}

          {items.map((item) => (
            <article key={item.id} className="grid gap-4 rounded-[12px] border border-primary/18 bg-card p-4 shadow-[0_16px_44px_rgba(0,0,0,0.24)] md:grid-cols-[80px_1fr_auto] md:items-center">
              <div className="grid aspect-square place-items-center rounded-[10px] bg-black/50">
                <ShoppingBag className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="font-black uppercase">{item.name}</h2>
                <p className="mt-2 text-sm text-white/58">Preço unitário: {item.price}</p>
                <div className="mt-4 flex items-center gap-3">
                  <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Diminuir" onClick={() => decreaseQuantity(item.id)}>
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="grid h-9 min-w-10 place-items-center rounded-[8px] border border-primary/20 font-black">{item.quantity}</span>
                  <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Aumentar" onClick={() => increaseQuantity(item.id)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-5 md:block md:text-right">
                <div>
                  <p className="text-sm text-white/60">Subtotal</p>
                  <p className="text-xl font-black text-primary">{formatCurrency(item.priceValue * item.quantity)}</p>
                </div>
                <Button variant="ghost" size="icon" className="mt-0 md:mt-3" aria-label="Remover" onClick={() => removeItem(item.id)}>
                  <Trash2 className="h-5 w-5" />
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {items.length > 0 ? (
        <section className="mt-8 rounded-[12px] border border-primary/35 bg-card p-6 shadow-panel">
          <div className="flex items-center justify-between gap-4">
            <span className="text-white/60">Total</span>
            <strong className="text-3xl text-primary">{formatCurrency(total)}</strong>
          </div>
          <Button className="mt-7 w-full" onClick={() => router.push("/cliente/checkout")}>
            Finalizar Compra
          </Button>
        </section>
      ) : null}
    </ClientShell>
  );
}
