"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ImagePlus, Package, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/utils/cn";

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

type ProductForm = {
  productId: string;
  categoryId: string;
  name: string;
  description: string;
  price: string;
  costPrice: string;
  stock: string;
  image: string;
  active: boolean;
  visibleInStore: boolean;
};

const inputClass = "min-h-12 w-full rounded-[10px] border border-primary/20 bg-black/45 px-4 text-base font-semibold text-white outline-none transition focus:border-primary";

function parseNumber(value: string) {
  const normalized = value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value;
  return Number(normalized) || 0;
}

function moneyInput(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function displayCategoryName(name: string) {
  if (name === "Acessorios") return "Acessórios";
  if (name === "Oleos") return "Óleos";
  if (name === "Maquinas") return "Máquinas";
  return name;
}

const emptyProduct: ProductForm = {
  productId: "",
  categoryId: "",
  name: "",
  description: "",
  price: "0,00",
  costPrice: "0,00",
  stock: "0",
  image: "",
  active: true,
  visibleInStore: true
};

export function ProductManagementPanel({ categories, products }: { categories: CategoryOption[]; products: ProductItem[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ ...emptyProduct, categoryId: categories[0]?.id ?? "" });
  const [message, setMessage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const selectedCategory = categories.find((category) => category.id === form.categoryId);

  function selectProduct(id: string) {
    const product = products.find((item) => item.id === id);
    if (!product) return setForm({ ...emptyProduct, categoryId: categories[0]?.id ?? "" });
    setForm({
      productId: product.id,
      categoryId: product.categoryId,
      name: product.name,
      description: product.description,
      price: moneyInput(product.price),
      costPrice: moneyInput(product.costPrice),
      stock: String(product.stock),
      image: product.image,
      active: product.active,
      visibleInStore: product.visibleInStore
    });
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

  async function uploadImage(file: File) {
    setMessage(null);
    setUploadingImage(true);

    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/internal/product-images", {
        method: "POST",
        body
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.message ?? "Nao foi possivel enviar a imagem.");
        return;
      }
      setForm((current) => ({ ...current, image: payload.url }));
      setMessage("Imagem enviada com sucesso.");
    } catch {
      setMessage("Falha de conexao ao enviar imagem.");
    } finally {
      setUploadingImage(false);
    }
  }

  function productPayload() {
    return {
      ...(form.productId ? { productId: form.productId } : {}),
      categoryId: form.categoryId,
      name: form.name,
      description: form.description || undefined,
      price: parseNumber(form.price),
      costPrice: parseNumber(form.costPrice),
      stock: Number(form.stock) || 0,
      image: form.image || undefined,
      active: form.active,
      visibleInStore: form.visibleInStore
    };
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
          <form className="grid min-w-0 gap-4" onSubmit={(event) => { event.preventDefault(); void requestJson("/api/internal/products", form.productId ? "PATCH" : "POST", productPayload()); }}>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">{form.productId ? "Edicao" : "Novo"}</p>
              <h3 className="mt-1 text-2xl font-black uppercase">{form.productId ? `Editando: ${form.name || "produto"}` : "Novo produto"}</h3>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold uppercase text-white/70">Nome<input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <div className="relative grid gap-2 text-sm font-bold uppercase text-white/70">
                <span>Categoria</span>
                <button
                  type="button"
                  aria-expanded={categoryOpen}
                  className={cn(inputClass, "flex items-center justify-between gap-3 text-left text-lg")}
                  onClick={() => setCategoryOpen((current) => !current)}
                >
                  <span className="truncate">{displayCategoryName(selectedCategory?.name ?? "Outros")}</span>
                  <ChevronDown className={cn("h-6 w-6 shrink-0 transition", categoryOpen && "rotate-180")} />
                </button>
                {categoryOpen ? (
                  <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-80 overflow-auto rounded-[10px] border border-primary/35 bg-[#111] p-2 shadow-panel">
                    {categories.map((category) => {
                      const selected = category.id === form.categoryId;
                      return (
                        <button
                          key={category.id}
                          type="button"
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-[8px] px-4 py-3 text-left text-base font-black normal-case text-white transition hover:bg-primary hover:text-black",
                            selected && "bg-primary text-black"
                          )}
                          onClick={() => {
                            setForm({ ...form, categoryId: category.id });
                            setCategoryOpen(false);
                          }}
                        >
                          <span>{displayCategoryName(category.name)}</span>
                          {selected ? <Check className="h-5 w-5" /> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <label className="grid gap-2 text-sm font-bold uppercase text-white/70">Preco venda<input className={inputClass} inputMode="decimal" placeholder="0,00" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></label>
              <label className="grid gap-2 text-sm font-bold uppercase text-white/70">Preco custo<input className={inputClass} inputMode="decimal" placeholder="0,00" value={form.costPrice} onChange={(event) => setForm({ ...form, costPrice: event.target.value })} /></label>
              <label className="grid gap-2 text-sm font-bold uppercase text-white/70">Estoque<input className={inputClass} type="number" min={0} step={1} value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} /></label>
              <label className="grid min-w-0 gap-2 text-sm font-bold uppercase text-white/70">
                Imagem do produto
                <input
                  id="product-image-upload"
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadImage(file);
                  }}
                />
                <span className="flex min-h-12 w-full max-w-full min-w-0 overflow-hidden rounded-[10px] border border-primary/20 bg-black/45 p-2 text-left text-sm normal-case text-white/60 transition focus-within:border-primary sm:text-base">
                  <span className="flex min-w-0 items-center gap-3">
                    <ImagePlus className="h-5 w-5 shrink-0 text-primary" />
                    <span className="truncate">
                      {form.image ? "Imagem selecionada" : "JPEG, PNG, WEBP ou GIF"}
                    </span>
                  </span>
                  <span className="ml-auto shrink-0 rounded-[8px] bg-primary px-3 py-2 text-xs font-black uppercase text-black sm:px-4">
                    Escolher
                  </span>
                </span>
                {uploadingImage ? <span className="text-xs text-primary">Enviando imagem...</span> : null}
              </label>
            </div>
            {form.image ? (
              <div className="rounded-[10px] border border-white/10 bg-black/30 p-3">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">Previa da imagem</p>
                <div
                  aria-label={form.name || "Produto"}
                  className="mt-3 h-40 w-full rounded-[8px] bg-cover bg-center"
                  role="img"
                  style={{ backgroundImage: `url("${form.image}")` }}
                />
              </div>
            ) : null}
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">Descricao<textarea className={`${inputClass} min-h-28 py-3`} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            <label className="flex items-center gap-3 font-bold uppercase text-white/70"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Produto ativo</label>
            <label className="flex items-center gap-3 font-bold uppercase text-white/70"><input type="checkbox" checked={form.visibleInStore} onChange={(event) => setForm({ ...form, visibleInStore: event.target.checked })} /> Visivel na loja do cliente</label>
            <div className="flex flex-wrap gap-3">
              <Button type="submit">{form.productId ? "Salvar alteracoes" : "Criar produto"}</Button>
              {form.productId ? <Button type="button" variant="outline" onClick={() => window.confirm("Excluir este produto? Ele deixara de aparecer nas listas e na loja.") && void requestJson("/api/internal/products", "DELETE", { productId: form.productId })}>Excluir produto</Button> : null}
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
