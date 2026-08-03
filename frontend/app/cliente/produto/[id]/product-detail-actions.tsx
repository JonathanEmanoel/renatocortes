"use client";

import { useState } from "react";
import Link from "next/link";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addStoredCartItem } from "@/lib/cart";
import { useCartStore } from "@/store/cart-store";

type ProductDetailActionsProps = {
  product: {
    id: string;
    name: string;
    price: string;
    priceValue: number;
    stock: number;
  };
};

export function ProductDetailActions({ product }: ProductDetailActionsProps) {
  const [quantity, setQuantity] = useState(1);
  const [feedback, setFeedback] = useState<string | null>(null);
  const isOutOfStock = product.stock <= 0;

  const addItem = useCartStore((state) => state.addItem);

  function addToCart() {
    if (isOutOfStock) {
      setFeedback("Produto indisponível no momento.");
      return;
    }

    addItem({
      ...product,
      quantity
    });
    setFeedback("Produto adicionado ao carrinho.");
    window.setTimeout(() => setFeedback(null), 3200);
  }

  return (
    <>
      <div className="mt-8 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Diminuir quantidade"
          disabled={isOutOfStock}
          onClick={() => setQuantity((current) => Math.max(1, current - 1))}
        >
          <Minus className="h-5 w-5" />
        </Button>
        <span className="grid h-12 w-14 place-items-center rounded-[8px] border border-white/14 font-black">
          {isOutOfStock ? 0 : quantity}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Aumentar quantidade"
          disabled={isOutOfStock}
          onClick={() => setQuantity((current) => Math.min(product.stock, current + 1))}
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>
      {feedback ? (
        <div className="mt-5 flex flex-col gap-3 rounded-[12px] border border-primary/40 bg-black/70 p-4 shadow-panel sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Carrinho</p>
            <p className="mt-1 font-semibold text-white">{feedback}</p>
          </div>
          <Link href="/cliente/carrinho" className="text-sm font-black uppercase text-primary underline underline-offset-4">
            Ver carrinho
          </Link>
        </div>
      ) : null}
      <Button className="mt-8 w-full" disabled={isOutOfStock} onClick={addToCart}>
        <ShoppingBag className="h-5 w-5" />
        {isOutOfStock ? "Esgotado" : "Adicionar ao Carrinho"}
      </Button>
    </>
  );
}
