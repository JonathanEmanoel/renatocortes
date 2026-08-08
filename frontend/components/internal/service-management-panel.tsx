"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Scissors } from "lucide-react";
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

const inputClass = "min-h-12 rounded-[10px] border border-primary/20 bg-black/45 px-4 text-base font-semibold text-white outline-none transition focus:border-primary";

const emptyService = {
  serviceId: "",
  name: "",
  description: "",
  duration: 30,
  price: 0,
  active: true
};

function parseNumber(value: string) {
  return Number(value.replace(",", ".")) || 0;
}

export function ServiceManagementPanel({ services }: { services: ServiceItem[] }) {
  const router = useRouter();
  const [form, setForm] = useState(emptyService);
  const [message, setMessage] = useState<string | null>(null);

  function selectService(id: string) {
    const service = services.find((item) => item.id === id);
    if (!service) return setForm(emptyService);
    setForm({ ...service, serviceId: service.id });
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
    setMessage("Servico salvo com sucesso.");
    router.refresh();
  }

  return (
    <section className="rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <Scissors className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-black uppercase">Servicos</h2>
        </div>
        <Button type="button" variant="outline" onClick={() => setForm(emptyService)}>
          <Plus className="h-4 w-4" />
          Novo servico
        </Button>
      </div>
      {message ? <div className="mt-5 rounded-[10px] border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-bold text-primary">{message}</div> : null}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <div className="rounded-[10px] border border-white/10 bg-black/30 p-4">
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
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black uppercase">{service.name}</p>
                    <p className="text-white/55">{service.duration} min</p>
                  </div>
                  <strong className="text-primary">{formatCurrency(service.price)}</strong>
                </div>
              </button>
            ))}
          </div>
        </div>
        <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void requestJson(form.serviceId ? "PATCH" : "POST", form); }}>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">{form.serviceId ? "Edicao" : "Novo"}</p>
            <h3 className="mt-1 text-2xl font-black uppercase">{form.serviceId ? `Editando: ${form.name || "servico"}` : "Novo servico"}</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">Nome<input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">Duracao<input className={inputClass} type="number" value={form.duration} onChange={(event) => setForm({ ...form, duration: Number(event.target.value) })} /></label>
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">Preco<input className={inputClass} value={form.price} onChange={(event) => setForm({ ...form, price: parseNumber(event.target.value) })} /></label>
          </div>
          <label className="grid gap-2 text-sm font-bold uppercase text-white/70">Descricao<textarea className={`${inputClass} min-h-28 py-3`} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <label className="flex items-center gap-3 font-bold uppercase text-white/70"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Servico ativo</label>
          <div className="flex flex-wrap gap-3">
            <Button type="submit">{form.serviceId ? "Salvar alteracoes" : "Criar servico"}</Button>
            {form.serviceId ? <Button type="button" variant="outline" onClick={() => window.confirm("Desativar este servico?") && void requestJson("DELETE", { serviceId: form.serviceId })}>Desativar</Button> : null}
          </div>
        </form>
      </div>
    </section>
  );
}
