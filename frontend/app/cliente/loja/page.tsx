"use client";

import { useState } from "react";
import { ClientShell } from "@/components/client/client-shell";
import { ProductCard } from "@/components/client/product-card";
import { SearchBar } from "@/components/client/search-bar";
import { SectionTitle } from "@/components/client/section-title";
import { productCategories, products } from "@/utils/client-mocks";
import { cn } from "@/utils/cn";
import type { ProductCategory } from "@/types/client-area";

export default function StorePage() {
  const [category, setCategory] = useState<ProductCategory>("Todos");
  const filtered = category === "Todos" ? products : products.filter((product) => product.category === category);

  return (
    <ClientShell>
      <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary">Loja</p>
      <h1 className="mt-3 text-3xl font-black uppercase md:text-5xl">Produtos Renato Cortes</h1>

      <div className="mt-8">
        <SearchBar placeholder="Pesquisar produto" />
      </div>

      <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
        {productCategories.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCategory(item)}
            className={cn(
              "whitespace-nowrap rounded-full border px-4 py-2 text-xs font-black uppercase transition",
              category === item ? "border-primary bg-primary text-white" : "border-white/14 bg-card text-white/70"
            )}
          >
            {item === "Oleos" ? "Óleos" : item === "Acessorios" ? "Acessórios" : item}
          </button>
        ))}
      </div>

      <section className="mt-8">
        <SectionTitle title="Catálogo" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    </ClientShell>
  );
}
