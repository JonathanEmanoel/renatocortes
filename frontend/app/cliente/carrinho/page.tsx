import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { ClientShell } from "@/components/client/client-shell";
import { SectionTitle } from "@/components/client/section-title";
import { Button } from "@/components/ui/button";
import { products } from "@/utils/client-mocks";

const cartItems = products.slice(0, 3).map((product, index) => ({
  product,
  quantity: index + 1,
  subtotal: ["R$ 45,00", "R$ 110,00", "R$ 105,00"][index]
}));

export default function CartPage() {
  return (
    <ClientShell>
      <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary">Carrinho</p>
      <h1 className="mt-3 text-3xl font-black uppercase md:text-5xl">Seu pedido</h1>

      <section className="mt-9">
        <SectionTitle title="Produtos" />
        <div className="grid gap-4">
          {cartItems.map((item) => (
            <article key={item.product.id} className="grid gap-4 rounded-[8px] border border-white/14 bg-card p-4 md:grid-cols-[80px_1fr_auto] md:items-center">
              <div className="grid aspect-square place-items-center rounded-[8px] bg-black/50">
                <ShoppingBag className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="font-black uppercase">{item.product.name}</h2>
                <p className="mt-2 text-sm text-white/58">{item.product.price}</p>
                <div className="mt-4 flex items-center gap-3">
                  <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Diminuir">
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="font-black">{item.quantity}</span>
                  <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Aumentar">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-5 md:block md:text-right">
                <p className="text-xl font-black text-primary">{item.subtotal}</p>
                <Button variant="ghost" size="icon" className="mt-0 md:mt-3" aria-label="Remover">
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
          <strong className="text-3xl text-primary">R$ 260,00</strong>
        </div>
        <Button className="mt-7 w-full">Finalizar Pedido</Button>
      </section>
    </ClientShell>
  );
}
