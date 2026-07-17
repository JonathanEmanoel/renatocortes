"use client";

import { useState } from "react";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addStoredCartItem } from "@/lib/cart";

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

  function addToCart() {
    if (isOutOfStock) {
      setFeedback("Produto indisponível no momento.");
      return;
    }

    addStoredCartItem({
      ...product,
      quantity
    });
    setFeedback("Produto adicionado ao carrinho.");
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
      {feedback ? <p className="mt-5 rounded-[8px] border border-primary/50 p-4 text-primary">{feedback}</p> : null}
      <Button className="mt-8 w-full" disabled={isOutOfStock} onClick={addToCart}>
        <ShoppingBag className="h-5 w-5" />
        {isOutOfStock ? "Esgotado" : "Adicionar ao Carrinho"}
      </Button>
    </>
  );
}
