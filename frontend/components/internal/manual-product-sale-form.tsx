"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";

type ProductOption = {
  id: string;
  name: string;
  price: number;
  stock: number;
  active: boolean;
  visibleInStore: boolean;
};

const inputClass = "min-h-12 rounded-[10px] border border-primary/20 bg-black/45 px-4 text-base font-semibold text-white outline-none transition focus:border-primary";

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
          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70 md:col-span-2">
              Produto
              <select className={inputClass} value={productId} onChange={(event) => setProductId(event.target.value)}>
                {availableProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} - estoque {product.stock} - {product.visibleInStore ? "loja" : "presencial"}
                  </option>
                ))}
              </select>
            </label>
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
