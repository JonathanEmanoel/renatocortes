"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MessageCircle, ShoppingBag } from "lucide-react";
import { ClientShell } from "@/components/client/client-shell";
import { SectionTitle } from "@/components/client/section-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCartStore } from "@/store/cart-store";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

type DeliveryMethod = "Retirar na barbearia" | "Entrega";

const CHECKOUT_SUCCESS_STORAGE_KEY = "renato-cortes-checkout-success";

export default function CheckoutPage() {
  const items = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clearCart);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("Retirar na barbearia");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [complement, setComplement] = useState("");
  const [observations, setObservations] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [whatsAppSuccessUrl, setWhatsAppSuccessUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.priceValue * item.quantity, 0),
    [items]
  );

  useEffect(() => {
    const savedUrl = window.sessionStorage.getItem(CHECKOUT_SUCCESS_STORAGE_KEY);
    if (savedUrl) {
      setWhatsAppSuccessUrl(savedUrl);
      setFeedback("Pedido realizado com sucesso. Confirme pelo WhatsApp.");
    }
  }, []);

  useEffect(() => {
    if (items.length > 0 && whatsAppSuccessUrl) {
      window.sessionStorage.removeItem(CHECKOUT_SUCCESS_STORAGE_KEY);
      setWhatsAppSuccessUrl(null);
      setFeedback(null);
    }
  }, [items.length, whatsAppSuccessUrl]);

  async function submitOrder() {
    if (whatsAppSuccessUrl) {
      window.location.assign(whatsAppSuccessUrl);
      return;
    }

    setFeedback(null);

    if (items.length === 0) {
      setFeedback("Seu carrinho esta vazio.");
      return;
    }

    if (customerName.trim().length < 3 || customerPhone.trim().length < 8) {
      setFeedback("Informe nome e telefone para continuar.");
      return;
    }

    if (deliveryMethod === "Entrega" && (!street.trim() || !number.trim() || !neighborhood.trim())) {
      setFeedback("Informe rua, numero e bairro para entrega.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item) => ({ productId: item.id, quantity: item.quantity })),
          customerName,
          customerPhone,
          deliveryMethod,
          deliveryAddress:
            deliveryMethod === "Entrega"
              ? {
                  street,
                  number,
                  neighborhood,
                  complement: complement || undefined
                }
              : undefined,
          observations
        })
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setFeedback(payload?.message ?? "Nao foi possivel enviar seu pedido.");
        return;
      }

      if (payload?.whatsAppUrl) {
        setWhatsAppSuccessUrl(payload.whatsAppUrl);
        window.sessionStorage.setItem(CHECKOUT_SUCCESS_STORAGE_KEY, payload.whatsAppUrl);
        setFeedback("Pedido realizado com sucesso. Confirme pelo WhatsApp.");
        clearCart();
        window.location.assign(payload.whatsAppUrl);
        return;
      }

      clearCart();
      setFeedback("Pedido realizado com sucesso, mas o link do WhatsApp nao foi retornado.");
    } catch {
      setFeedback("Falha de conexao. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ClientShell>
      <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary">Checkout</p>
      <h1 className="mt-3 text-3xl font-black uppercase md:text-5xl">Finalizar pedido</h1>

      {whatsAppSuccessUrl ? (
        <section className="mt-9 rounded-[12px] border border-primary/30 bg-card p-7 text-center shadow-panel">
          <MessageCircle className="mx-auto h-12 w-12 text-primary" />
          <p className="mt-4 text-lg font-black uppercase text-primary">Pedido realizado com sucesso.</p>
          <p className="mt-3 text-white/68">Se o WhatsApp nao abrir automaticamente, toque no botao abaixo para enviar a confirmacao.</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <a href={whatsAppSuccessUrl} className="inline-flex min-h-12 items-center justify-center rounded-[10px] bg-primary px-6 text-sm font-black uppercase text-black transition hover:bg-primary/90">
              Abrir WhatsApp
            </a>
            <Link href="/cliente/loja" className="inline-flex min-h-12 items-center justify-center rounded-[10px] border border-primary/45 px-6 text-sm font-black uppercase text-primary transition hover:bg-primary hover:text-black">
              Continuar comprando
            </Link>
          </div>
        </section>
      ) : items.length === 0 ? (
        <section className="mt-9 rounded-[12px] border border-primary/20 bg-card p-7 text-center">
          <ShoppingBag className="mx-auto h-12 w-12 text-primary" />
          <p className="mt-4 text-lg font-bold">Seu carrinho esta vazio.</p>
          <Link href="/cliente/loja" className="mt-5 inline-flex rounded-[10px] border border-primary px-6 py-3 font-black uppercase text-primary">
            Continuar comprando
          </Link>
        </section>
      ) : (
        <div className="mt-9 grid gap-7 lg:grid-cols-[1fr_0.75fr]">
          <section className="rounded-[12px] border border-primary/20 bg-card p-6">
            <SectionTitle title="Dados do pedido" />
            <div className="grid gap-5">
              <label className="grid gap-2">
                <span className="font-bold">Nome</span>
                <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Seu nome" />
              </label>
              <label className="grid gap-2">
                <span className="font-bold">Telefone</span>
                <Input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="(00) 00000-0000" />
              </label>

              <div className="grid gap-3">
                <span className="font-bold">Forma de recebimento</span>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(["Retirar na barbearia", "Entrega"] as DeliveryMethod[]).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setDeliveryMethod(method)}
                      className={`rounded-[10px] border px-4 py-4 font-black uppercase transition ${
                        deliveryMethod === method ? "border-primary bg-primary text-black" : "border-primary/20 bg-black/30 text-white"
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              {deliveryMethod === "Entrega" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 sm:col-span-2">
                    <span className="font-bold">Rua</span>
                    <Input value={street} onChange={(event) => setStreet(event.target.value)} placeholder="Rua" />
                  </label>
                  <label className="grid gap-2">
                    <span className="font-bold">Numero</span>
                    <Input value={number} onChange={(event) => setNumber(event.target.value)} placeholder="Numero" />
                  </label>
                  <label className="grid gap-2">
                    <span className="font-bold">Bairro</span>
                    <Input value={neighborhood} onChange={(event) => setNeighborhood(event.target.value)} placeholder="Bairro" />
                  </label>
                  <label className="grid gap-2 sm:col-span-2">
                    <span className="font-bold">Complemento</span>
                    <Input value={complement} onChange={(event) => setComplement(event.target.value)} placeholder="Complemento" />
                  </label>
                </div>
              ) : null}

              <label className="grid gap-2">
                <span className="font-bold">Observacoes</span>
                <textarea
                  value={observations}
                  onChange={(event) => setObservations(event.target.value)}
                  className="min-h-28 rounded-[10px] border border-primary/20 bg-black/35 p-4 text-white outline-none transition placeholder:text-white/50 focus:border-primary/80"
                  placeholder="Alguma observacao para o pedido?"
                />
              </label>
            </div>
          </section>

          <aside className="rounded-[12px] border border-primary/25 bg-card p-6">
            <SectionTitle title="Resumo" />
            <div className="grid gap-4">
              {items.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-4 border-b border-white/10 pb-3">
                  <div>
                    <p className="font-black uppercase">{item.name}</p>
                    <p className="mt-1 text-sm text-white/60">{item.quantity}x - {formatCurrency(item.priceValue * item.quantity)}</p>
                  </div>
                  <span className="font-black text-primary">{item.quantity}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 flex items-center justify-between">
              <span className="text-white/60">Total</span>
              <strong className="text-3xl text-primary">{formatCurrency(total)}</strong>
            </div>
            {feedback ? <p className="mt-5 rounded-[10px] border border-primary/50 p-4 text-primary">{feedback}</p> : null}
            <Button className="mt-7 w-full" onClick={submitOrder} disabled={isSubmitting}>
              <MessageCircle className="h-5 w-5" />
              {isSubmitting ? "Enviando..." : "Enviar Pedido"}
            </Button>
          </aside>
        </div>
      )}
    </ClientShell>
  );
}
