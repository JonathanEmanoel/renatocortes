import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { StoreContent } from "./store-content";
import type { Product, ProductCategory } from "@/types/client-area";

function mapCategory(name: string): ProductCategory {
  if (name === "Pomadas") return "Pomadas";
  if (name === "Shampoos") return "Shampoo";
  if (name === "Acessórios" || name === "Acessorios") return "Acessorios";
  return "Todos";
}

export default async function StorePage() {
  const productRecords = await prisma.product.findMany({
    where: { active: true, deletedAt: null },
    include: { category: true },
    orderBy: { name: "asc" }
  });

  const products: Product[] = productRecords.map((product) => ({
    id: product.id,
    name: product.name,
    price: formatCurrency(Number(product.price)),
    description: product.description ?? "Produto Renato Cortes Barbearia.",
    category: mapCategory(product.category.name),
    stock: product.stock
  }));

  const categories = Array.from(new Set<ProductCategory>(["Todos", ...products.map((product) => product.category)]));

  return <StoreContent products={products} categories={categories} />;
}
