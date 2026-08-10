"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/utils/cn";

type ProductOption = {
  id: string;
  name: string;
  price: number;
  stock: number;
  active: boolean;
  visibleInStore: boolean;
};

const inputClass = "min-h-12 w-full min-w-0 rounded-[10px] border border-primary/20 bg-black/45 px-4 text-base font-semibold text-white outline-none transition focus:border-primary";

function ProductSelect({
  products,
  value,
  onChange
}: {
  products: ProductOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = products.find((product) => product.id === value);

  return (
    <div className="relative grid min-w-0 gap-2 text-sm font-bold uppercase text-white/70 md:col-span-2">
      <span>Produto</span>
      <button
        type="button"
        aria-expanded={open}
        className={cn(inputClass, "flex items-center justify-between gap-3 text-left")}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0">
          <span className="block truncate">{selected?.name ?? "Selecione um produto"}</span>
          {selected ? (
            <span className="block truncate text-xs font-semibold normal-case text-white/45">
              {formatCurrency(selected.price)} - estoque {selected.stock} - {selected.visibleInStore ? "loja" : "presencial"}
            </span>
          ) : null}
        </span>
        <ChevronDown className={cn("h-6 w-6 shrink-0 transition", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-80 overflow-auto rounded-[10px] border border-primary/35 bg-[#111] p-2 shadow-panel">
          {products.map((product) => {
            const selectedProduct = product.id === value;
            return (
              <button
                key={product.id}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-[8px] px-4 py-3 text-left text-base font-black normal-case text-white transition hover:bg-primary hover:text-black",
                  selectedProduct && "bg-primary text-black"
                )}
                onClick={() => {
                  onChange(product.id);
                  setOpen(false);
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate">{product.name}</span>
                  <span className={cn("block truncate text-xs font-semibold", selectedProduct ? "text-black/60" : "text-white/45")}>
                    {formatCurrency(product.price)} - estoque {product.stock} - {product.visibleInStore ? "loja" : "presencial"}
                  </span>
                </span>
                {selectedProduct ? <Check className="h-5 w-5 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function ManualProductSaleForm({ products }: { products: ProductOption[] }) {
  const router = useRouter();
  const availableProducts = products.filter((product) => product.active);
  const [productId, setProductId] = useState(availableProducts[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [customerName, setCustomerName] = useState("");
  const [observations, setObservations] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedProduct = useMemo(() => availableProducts.find((product) => product.id === productId), [availableProducts, productId]);
  const total = (selectedProduct?.price ?? 0) * quantity;

  async function submitSale() {
    if (!selectedProduct) {
      setMessage("Selecione um produto disponivel.");
      return;
    }
    if (quantity < 1) {
      setMessage("Informe uma quantidade valida.");
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/internal/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName || undefined,
          observations: observations || undefined,
          items: [{ productId: selectedProduct.id, quantity }]
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.message ?? "Nao foi possivel registrar a venda.");
        return;
      }
      setMessage("Venda registrada com sucesso.");
      setQuantity(1);
      setCustomerName("");
      setObservations("");
      router.refresh();
    } catch {
      setMessage("Falha de conexao ao registrar a venda.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
      <div className="flex items-center gap-3">
        <ShoppingCart className="h-6 w-6 text-primary" />
        <h2 className="text-xl font-black uppercase">Venda presencial</h2>
      </div>

      {availableProducts.length === 0 ? (
        <p className="mt-5 rounded-[10px] border border-white/10 bg-black/30 p-4 text-white/60">Nenhum produto ativo disponivel para venda presencial.</p>
      ) : (
        <>
          <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-[minmax(0,2fr)_minmax(8rem,0.7fr)_minmax(10rem,1fr)]">
            <ProductSelect products={availableProducts} value={productId} onChange={setProductId} />
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
              Quantidade
              <input className={inputClass} type="number" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} />
            </label>
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
              Cliente
              <input className={inputClass} value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Opcional" />
            </label>
          </div>
          <label className="mt-4 grid gap-2 text-sm font-bold uppercase text-white/70">
            Observacoes
            <textarea className={`${inputClass} min-h-24 py-3`} value={observations} onChange={(event) => setObservations(event.target.value)} placeholder="Opcional" />
          </label>
          <div className="mt-5 flex flex-col justify-between gap-3 rounded-[10px] border border-white/10 bg-black/30 p-4 sm:flex-row sm:items-center">
            <p className="text-sm uppercase text-white/55">
              Total <strong className="ml-2 text-xl text-primary">{formatCurrency(total)}</strong>
            </p>
            <Button type="button" onClick={() => void submitSale()} disabled={loading}>
              {loading ? "Registrando..." : "Registrar venda"}
            </Button>
          </div>
        </>
      )}

      {message ? <p className="mt-4 rounded-[10px] border border-primary/35 bg-primary/10 px-4 py-3 text-sm font-bold text-primary">{message}</p> : null}
    </section>
  );
}
