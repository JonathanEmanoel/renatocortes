import Link from "next/link";
import { Plus, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Product } from "@/types/client-area";

type ProductCardProps = {
  product: Product;
  compact?: boolean;
};

export function ProductCard({ product, compact = false }: ProductCardProps) {
  return (
    <article className="group overflow-hidden rounded-[8px] border border-white/14 bg-card transition hover:-translate-y-1 hover:border-primary/50">
      <Link href={`/cliente/produto/${product.id}`} className="block">
        <div className="grid aspect-[4/3] place-items-center bg-gradient-to-br from-[#1b120d] via-[#0b0b0b] to-black">
          <ShoppingBag className="h-16 w-16 text-white/80 transition group-hover:text-primary" />
        </div>
      </Link>
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-black uppercase leading-snug">{product.name}</h3>
            {!compact ? <p className="mt-2 text-sm leading-relaxed text-white/58">{product.description}</p> : null}
          </div>
          <Button size="icon" variant="ghost" aria-label={`Adicionar ${product.name}`}>
            <Plus className="h-6 w-6" />
          </Button>
        </div>
        <p className="mt-5 text-xl font-black text-primary">{product.price}</p>
      </div>
    </article>
  );
}
