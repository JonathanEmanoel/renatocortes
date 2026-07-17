import Link from "next/link";
import { notFound } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { ClientShell } from "@/components/client/client-shell";
import { ProductCard } from "@/components/client/product-card";
import { SectionTitle } from "@/components/client/section-title";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { ProductDetailActions } from "./product-detail-actions";
import type { Product, ProductCategory } from "@/types/client-area";

type ProductPageProps = {
  params: Promise<{
    id: string;
  }>;
};

function mapCategory(name: string): ProductCategory {
  if (name === "Pomadas") return "Pomadas";
  if (name === "Shampoos") return "Shampoo";
  if (name === "Acessórios" || name === "Acessorios") return "Acessorios";
  return "Todos";
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params;
  const product = await prisma.product.findFirst({
    where: { id, active: true, deletedAt: null },
    include: { category: true }
  });

  if (!product) {
    notFound();
  }

  const relatedRecords = await prisma.product.findMany({
    where: {
      id: { not: product.id },
      categoryId: product.categoryId,
      active: true,
      deletedAt: null
    },
    include: { category: true },
    take: 3
  });

  const related: Product[] = relatedRecords.map((item) => ({
    id: item.id,
    name: item.name,
    price: formatCurrency(Number(item.price)),
    description: item.description ?? "Produto Renato Cortes Barbearia.",
    category: mapCategory(item.category.name),
    stock: item.stock
  }));

  const price = formatCurrency(Number(product.price));

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
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary">{product.category.name}</p>
          <h1 className="mt-4 text-3xl font-black uppercase md:text-5xl">{product.name}</h1>
          <p className="mt-5 text-3xl font-black text-primary">{product.stock > 0 ? price : "Esgotado"}</p>
          <p className="mt-6 leading-relaxed text-white/68">{product.description ?? "Produto Renato Cortes Barbearia."}</p>
          <p className="mt-4 text-sm font-bold uppercase tracking-[0.12em] text-white/55">
            Estoque disponível: {product.stock}
          </p>
          <ProductDetailActions
            product={{
              id: product.id,
              name: product.name,
              price,
              priceValue: Number(product.price),
              stock: product.stock
            }}
          />
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
