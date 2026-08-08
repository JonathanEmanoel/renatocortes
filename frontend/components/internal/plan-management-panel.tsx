"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";

type PlanItem = {
  id: string;
  name: string;
  description: string;
  value: number;
  benefits: string;
  cutsIncluded: number;
  periodDays: number;
  active: boolean;
};

const inputClass = "min-h-12 rounded-[10px] border border-primary/20 bg-black/45 px-4 text-base font-semibold text-white outline-none transition focus:border-primary";
const emptyPlan = { planId: "", name: "", description: "", value: 0, benefits: "", cutsIncluded: 0, periodDays: 30, active: true };

function parseNumber(value: string) {
  return Number(value.replace(",", ".")) || 0;
}

export function PlanManagementPanel({ plans }: { plans: PlanItem[] }) {
  const router = useRouter();
  const [form, setForm] = useState(emptyPlan);
  const [message, setMessage] = useState<string | null>(null);

  function selectPlan(id: string) {
    const plan = plans.find((item) => item.id === id);
    if (!plan) return setForm(emptyPlan);
    setForm({ ...plan, planId: plan.id });
  }

  async function requestJson(method: "POST" | "PATCH" | "DELETE", body: unknown) {
    setMessage(null);
    const response = await fetch("/api/internal/plans", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.message ?? "Nao foi possivel salvar o plano.");
      return;
    }
    setMessage("Plano salvo com sucesso.");
    router.refresh();
  }

  return (
    <section className="rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
      <div className="flex items-center gap-3">
        <Crown className="h-6 w-6 text-primary" />
        <h2 className="text-xl font-black uppercase">Planos de assinatura</h2>
      </div>
      {message ? <div className="mt-5 rounded-[10px] border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-bold text-primary">{message}</div> : null}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <div className="rounded-[10px] border border-white/10 bg-black/30 p-4">
          <select className={`${inputClass} w-full`} onChange={(event) => selectPlan(event.target.value)} value={form.planId}>
            <option value="">Novo plano</option>
            {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
          </select>
          <div className="mt-4 grid gap-3">
            {plans.map((plan) => (
              <div key={plan.id} className="flex items-center justify-between rounded-[8px] border border-white/10 bg-black/30 px-3 py-2 text-sm">
                <span>{plan.name}</span>
                <strong className="text-primary">{formatCurrency(plan.value)}</strong>
              </div>
            ))}
          </div>
        </div>
        <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void requestJson(form.planId ? "PATCH" : "POST", form); }}>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">Nome<input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">Valor<input className={inputClass} value={form.value} onChange={(event) => setForm({ ...form, value: parseNumber(event.target.value) })} /></label>
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">Dias<input className={inputClass} type="number" value={form.periodDays} onChange={(event) => setForm({ ...form, periodDays: Number(event.target.value) })} /></label>
          </div>
          <label className="grid gap-2 text-sm font-bold uppercase text-white/70">Beneficios<textarea className={`${inputClass} min-h-28 py-3`} value={form.benefits} onChange={(event) => setForm({ ...form, benefits: event.target.value })} /></label>
          <label className="grid gap-2 text-sm font-bold uppercase text-white/70">Descricao<textarea className={`${inputClass} min-h-24 py-3`} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <label className="flex items-center gap-3 font-bold uppercase text-white/70"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Plano ativo</label>
          <div className="flex flex-wrap gap-3">
            <Button type="submit">Salvar plano</Button>
            {form.planId ? <Button type="button" variant="outline" onClick={() => void requestJson("DELETE", { planId: form.planId })}>Desativar</Button> : null}
          </div>
        </form>
      </div>
    </section>
  );
}
