import Link from "next/link";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { ClientShell } from "@/components/client/client-shell";
import { ProductCard } from "@/components/client/product-card";
import { SectionTitle } from "@/components/client/section-title";
import { Button } from "@/components/ui/button";
import { products } from "@/utils/client-mocks";

type ProductPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params;
  const product = products.find((item) => item.id === id) ?? products[0];
  const related = products.filter((item) => item.id !== product.id).slice(0, 3);

  return (
    <ClientShell>
      <Link href="/cliente/loja" className="text-sm font-black uppercase tracking-[0.08em] text-primary">
        Voltar para loja
      </Link>

      <section className="mt-6 grid gap-7 lg:grid-cols-[1fr_0.9fr]">
        <div className="grid aspect-square place-items-center rounded-[8px] border border-white/14 bg-gradient-to-br from-[#1b120d] via-black to-[#070707]">
          <ShoppingBag className="h-28 w-28 text-primary" />
        </div>
        <div className="rounded-[8px] border border-white/14 bg-card p-6">
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary">{product.category}</p>
          <h1 className="mt-4 text-3xl font-black uppercase md:text-5xl">{product.name}</h1>
          <p className="mt-5 text-3xl font-black text-primary">{product.price}</p>
          <p className="mt-6 leading-relaxed text-white/68">{product.description}</p>
          <div className="mt-8 flex items-center gap-3">
            <Button variant="ghost" size="icon" aria-label="Diminuir quantidade">
              <Minus className="h-5 w-5" />
            </Button>
            <span className="grid h-12 w-14 place-items-center rounded-[8px] border border-white/14 font-black">1</span>
            <Button variant="ghost" size="icon" aria-label="Aumentar quantidade">
              <Plus className="h-5 w-5" />
            </Button>
          </div>
          <Button className="mt-8 w-full">
            <ShoppingBag className="h-5 w-5" />
            Adicionar ao Carrinho
          </Button>
        </div>
      </section>

      <section className="mt-10">
        <SectionTitle title="Produtos relacionados" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {related.map((item) => (
            <ProductCard key={item.id} product={item} compact />
          ))}
        </div>
      </section>
    </ClientShell>
  );
}
