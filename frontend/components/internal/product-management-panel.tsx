"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";

type CategoryOption = { id: string; name: string };
type ProductItem = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  costPrice: number;
  stock: number;
  image: string;
  active: boolean;
  visibleInStore: boolean;
};

const inputClass = "min-h-12 rounded-[10px] border border-primary/20 bg-black/45 px-4 text-base font-semibold text-white outline-none transition focus:border-primary";

function parseNumber(value: string) {
  return Number(value.replace(",", ".")) || 0;
}

const emptyProduct = {
  productId: "",
  categoryId: "",
  name: "",
  description: "",
  price: 0,
  costPrice: 0,
  stock: 0,
  image: "",
  active: true,
  visibleInStore: true
};

export function ProductManagementPanel({ categories, products }: { categories: CategoryOption[]; products: ProductItem[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ ...emptyProduct, categoryId: categories[0]?.id ?? "" });
  const [message, setMessage] = useState<string | null>(null);

  function selectProduct(id: string) {
    const product = products.find((item) => item.id === id);
    if (!product) return setForm({ ...emptyProduct, categoryId: categories[0]?.id ?? "" });
    setForm({ ...product, productId: product.id });
  }

  async function requestJson(url: string, method: "POST" | "PATCH" | "DELETE", body: unknown) {
    setMessage(null);
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.message ?? "Nao foi possivel concluir a acao.");
      return;
    }
    setMessage("Operacao realizada com sucesso.");
    router.refresh();
  }

  return (
    <div className="grid gap-8">
      {message ? <div className="rounded-[10px] border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-bold text-primary">{message}</div> : null}

      <section className="rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <Package className="h-6 w-6 text-primary" />
            <h2 className="text-xl font-black uppercase">Produtos e estoque</h2>
          </div>
          <Button type="button" variant="outline" onClick={() => setForm({ ...emptyProduct, categoryId: categories[0]?.id ?? "" })}>
            <Plus className="h-4 w-4" />
            Novo produto
          </Button>
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.2fr]">
          <div className="rounded-[10px] border border-white/10 bg-black/30 p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">Clique em um produto para editar</p>
            <div className="mt-4 grid max-h-[34rem] gap-3 overflow-auto pr-1">
              {products.length === 0 ? <p className="rounded-[8px] border border-white/10 p-4 text-sm text-white/60">Nenhum produto cadastrado.</p> : null}
              {products.map((product) => (
                <button
                  type="button"
                  key={product.id}
                  onClick={() => selectProduct(product.id)}
                  className={`rounded-[8px] border p-3 text-left text-sm transition hover:border-primary/50 ${form.productId === product.id ? "border-primary/60 bg-primary/10" : "border-white/10 bg-black/30"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black uppercase">{product.name}</p>
                      <p className="text-white/55">Estoque: {product.stock}</p>
                      <p className="text-white/45">{product.visibleInStore ? "Publico" : "Interno"}</p>
                    </div>
                    <strong className="text-primary">{formatCurrency(product.price)}</strong>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void requestJson("/api/internal/products", form.productId ? "PATCH" : "POST", form); }}>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">{form.productId ? "Edicao" : "Novo"}</p>
              <h3 className="mt-1 text-2xl font-black uppercase">{form.productId ? `Editando: ${form.name || "produto"}` : "Novo produto"}</h3>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold uppercase text-white/70">Nome<input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label className="grid gap-2 text-sm font-bold uppercase text-white/70">Categoria<select className={inputClass} value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label className="grid gap-2 text-sm font-bold uppercase text-white/70">Preco venda<input className={inputClass} value={form.price} onChange={(event) => setForm({ ...form, price: parseNumber(event.target.value) })} /></label>
              <label className="grid gap-2 text-sm font-bold uppercase text-white/70">Preco custo<input className={inputClass} value={form.costPrice} onChange={(event) => setForm({ ...form, costPrice: parseNumber(event.target.value) })} /></label>
              <label className="grid gap-2 text-sm font-bold uppercase text-white/70">Estoque<input className={inputClass} type="number" min={0} value={form.stock} onChange={(event) => setForm({ ...form, stock: Number(event.target.value) })} /></label>
              <label className="grid gap-2 text-sm font-bold uppercase text-white/70">Imagem<input className={inputClass} value={form.image} onChange={(event) => setForm({ ...form, image: event.target.value })} /></label>
            </div>
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">Descricao<textarea className={`${inputClass} min-h-28 py-3`} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            <label className="flex items-center gap-3 font-bold uppercase text-white/70"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Produto ativo</label>
            <label className="flex items-center gap-3 font-bold uppercase text-white/70"><input type="checkbox" checked={form.visibleInStore} onChange={(event) => setForm({ ...form, visibleInStore: event.target.checked })} /> Visivel na loja do cliente</label>
            <div className="flex flex-wrap gap-3">
              <Button type="submit">{form.productId ? "Salvar alteracoes" : "Criar produto"}</Button>
              {form.productId ? <Button type="button" variant="outline" onClick={() => window.confirm("Desativar este produto?") && void requestJson("/api/internal/products", "DELETE", { productId: form.productId })}>Desativar</Button> : null}
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
