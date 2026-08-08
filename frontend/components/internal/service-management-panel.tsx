"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, DollarSign, Plus, Scissors, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";

type ServiceItem = {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: number;
  active: boolean;
};

type ServiceForm = {
  serviceId: string;
  name: string;
  description: string;
  duration: string;
  price: string;
  active: boolean;
};

const inputClass =
  "min-h-12 w-full rounded-[10px] border border-primary/20 bg-black/45 px-4 text-base font-semibold text-white outline-none transition focus:border-primary";

const emptyService: ServiceForm = {
  serviceId: "",
  name: "",
  description: "",
  duration: "30",
  price: "0,00",
  active: true
};

function parseNumber(value: string) {
  const normalized = value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value;
  return Number(normalized) || 0;
}

function moneyInput(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ServiceManagementPanel({ services }: { services: ServiceItem[] }) {
  const router = useRouter();
  const [form, setForm] = useState<ServiceForm>(emptyService);
  const [message, setMessage] = useState<string | null>(null);

  function startNewService() {
    setMessage(null);
    setForm(emptyService);
  }

  function selectService(id: string) {
    const service = services.find((item) => item.id === id);
    if (!service) return startNewService();
    setMessage(null);
    setForm({
      serviceId: service.id,
      name: service.name,
      description: service.description,
      duration: String(service.duration),
      price: moneyInput(service.price),
      active: service.active
    });
  }

  function servicePayload() {
    return {
      ...(form.serviceId ? { serviceId: form.serviceId } : {}),
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      duration: Number(form.duration) || 0,
      price: parseNumber(form.price),
      active: form.active
    };
  }

  async function requestJson(method: "POST" | "PATCH" | "DELETE", body: unknown) {
    setMessage(null);
    const response = await fetch("/api/internal/services", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.message ?? "Nao foi possivel salvar o servico.");
      return;
    }
    setMessage(method === "DELETE" ? "Servico removido com sucesso." : "Servico salvo com sucesso.");
    if (method === "DELETE") setForm(emptyService);
    router.refresh();
  }

  return (
    <section className="rounded-[12px] border border-primary/20 bg-card p-4 shadow-panel sm:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <Scissors className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-black uppercase">Servicos</h2>
        </div>
        <Button type="button" variant="outline" onClick={startNewService}>
          <Plus className="h-4 w-4" />
          Novo servico
        </Button>
      </div>

      {message ? <div className="mt-5 rounded-[10px] border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-bold text-primary">{message}</div> : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="min-w-0 rounded-[10px] border border-white/10 bg-black/30 p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">Clique em um servico para editar</p>
          <div className="mt-4 grid max-h-[34rem] gap-3 overflow-auto pr-1">
            {services.length === 0 ? <p className="rounded-[8px] border border-white/10 p-4 text-sm text-white/60">Nenhum servico cadastrado.</p> : null}
            {services.map((service) => (
              <button
                type="button"
                key={service.id}
                onClick={() => selectService(service.id)}
                className={`rounded-[8px] border p-3 text-left text-sm transition hover:border-primary/50 ${form.serviceId === service.id ? "border-primary/60 bg-primary/10" : "border-white/10 bg-black/30"}`}
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-black uppercase">{service.name}</p>
                    <p className="text-white/55">{service.duration} min</p>
                  </div>
                  <strong className="shrink-0 text-primary">{formatCurrency(service.price)}</strong>
                </div>
              </button>
            ))}
          </div>
        </div>

        <form className="grid min-w-0 gap-5" onSubmit={(event) => { event.preventDefault(); void requestJson(form.serviceId ? "PATCH" : "POST", servicePayload()); }}>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">{form.serviceId ? "Edicao" : "Novo"}</p>
            <h3 className="mt-1 truncate text-2xl font-black uppercase">{form.serviceId ? `Editando: ${form.name || "servico"}` : "Novo servico"}</h3>
          </div>

          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <label className="grid min-w-0 gap-2 text-sm font-bold uppercase text-white/70 md:col-span-2">
              Nome do servico
              <input className={inputClass} placeholder="Ex.: Corte degrade navalhado" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>

            <label className="grid min-w-0 gap-2 text-sm font-bold uppercase text-white/70">
              Duracao em minutos
              <div className="flex min-w-0 items-center rounded-[10px] border border-primary/20 bg-black/45 px-4 focus-within:border-primary">
                <Clock className="h-5 w-5 shrink-0 text-primary" />
                <input className="min-h-12 w-full min-w-0 bg-transparent px-3 text-base font-semibold text-white outline-none" inputMode="numeric" type="number" min={5} max={600} step={5} placeholder="Ex.: 30" value={form.duration} onChange={(event) => setForm({ ...form, duration: event.target.value })} />
                <span className="shrink-0 text-sm font-bold text-white/45">min</span>
              </div>
            </label>

            <label className="grid min-w-0 gap-2 text-sm font-bold uppercase text-white/70">
              Preco
              <div className="flex min-w-0 items-center rounded-[10px] border border-primary/20 bg-black/45 px-4 focus-within:border-primary">
                <DollarSign className="h-5 w-5 shrink-0 text-primary" />
                <input className="min-h-12 w-full min-w-0 bg-transparent px-3 text-base font-semibold text-white outline-none" inputMode="decimal" placeholder="Ex.: 25,00" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} />
              </div>
            </label>
          </div>

          <label className="grid min-w-0 gap-2 text-sm font-bold uppercase text-white/70">
            Descricao opcional
            <textarea className={`${inputClass} min-h-28 py-3`} placeholder="Detalhes que ajudam a equipe ou o cliente a entender o servico." value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </label>

          <label className="flex items-center gap-3 font-bold uppercase text-white/70"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Servico ativo</label>

          <div className="flex flex-wrap gap-3">
            <Button type="submit">{form.serviceId ? "Salvar alteracoes" : "Criar servico"}</Button>
            {form.serviceId ? (
              <Button type="button" variant="outline" onClick={() => window.confirm("Excluir este servico da lista?") && void requestJson("DELETE", { serviceId: form.serviceId })}>
                <Trash2 className="h-4 w-4" />
                Excluir servico
              </Button>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}
