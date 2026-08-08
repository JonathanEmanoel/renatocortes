"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, ChevronDown, Crown, DollarSign, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/utils/cn";

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

type PlanForm = {
  planId: string;
  name: string;
  description: string;
  value: string;
  benefits: string;
  cutsIncluded: string;
  periodDays: string;
  active: boolean;
};

const inputClass =
  "min-h-12 w-full rounded-[10px] border border-primary/20 bg-black/45 px-4 text-base font-semibold text-white outline-none transition focus:border-primary";

const emptyPlan: PlanForm = {
  planId: "",
  name: "",
  description: "",
  value: "0,00",
  benefits: "",
  cutsIncluded: "0",
  periodDays: "30",
  active: true
};

function parseNumber(value: string) {
  const normalized = value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value;
  return Number(normalized) || 0;
}

function moneyInput(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PlanManagementPanel({ plans }: { plans: PlanItem[] }) {
  const router = useRouter();
  const [form, setForm] = useState<PlanForm>(emptyPlan);
  const [message, setMessage] = useState<string | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const selectedPlan = plans.find((plan) => plan.id === form.planId);

  function startNewPlan() {
    setMessage(null);
    setSelectorOpen(false);
    setForm(emptyPlan);
  }

  function selectPlan(id: string) {
    const plan = plans.find((item) => item.id === id);
    if (!plan) return startNewPlan();
    setMessage(null);
    setSelectorOpen(false);
    setForm({
      planId: plan.id,
      name: plan.name,
      description: plan.description,
      value: moneyInput(plan.value),
      benefits: plan.benefits,
      cutsIncluded: String(plan.cutsIncluded),
      periodDays: String(plan.periodDays),
      active: plan.active
    });
  }

  function planPayload() {
    return {
      ...(form.planId ? { planId: form.planId } : {}),
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      value: parseNumber(form.value),
      benefits: form.benefits.trim() || undefined,
      cutsIncluded: Number(form.cutsIncluded) || 0,
      periodDays: Number(form.periodDays) || 30,
      active: form.active
    };
  }

  async function requestJson(method: "POST" | "PATCH" | "DELETE", body: unknown) {
    setMessage(null);
    const response = await fetch("/api/internal/plans", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.message ?? "Nao foi possivel salvar o plano.");
      return;
    }
    setMessage(method === "DELETE" ? "Plano removido com sucesso." : "Plano salvo com sucesso.");
    if (method === "DELETE") setForm(emptyPlan);
    router.refresh();
  }

  return (
    <section className="rounded-[12px] border border-primary/20 bg-card p-4 shadow-panel sm:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <Crown className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-black uppercase">Planos de assinatura</h2>
        </div>
        <Button type="button" variant="outline" onClick={startNewPlan}>
          <Plus className="h-4 w-4" />
          Novo plano
        </Button>
      </div>

      {message ? <div className="mt-5 rounded-[10px] border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-bold text-primary">{message}</div> : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="min-w-0 rounded-[10px] border border-white/10 bg-black/30 p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">Clique em um plano para editar</p>

          <div className="relative mt-4">
            <button
              type="button"
              aria-expanded={selectorOpen}
              className={cn(inputClass, "flex items-center justify-between gap-3 text-left text-lg")}
              onClick={() => setSelectorOpen((current) => !current)}
            >
              <span className="truncate">{selectedPlan?.name ?? "Novo plano"}</span>
              <ChevronDown className={cn("h-6 w-6 shrink-0 transition", selectorOpen && "rotate-180")} />
            </button>
            {selectorOpen ? (
              <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-80 overflow-auto rounded-[10px] border border-primary/35 bg-[#111] p-2 shadow-panel">
                <button
                  type="button"
                  className={cn("flex w-full items-center justify-between gap-3 rounded-[8px] px-4 py-3 text-left text-base font-black text-white transition hover:bg-primary hover:text-black", !form.planId && "bg-primary text-black")}
                  onClick={startNewPlan}
                >
                  <span>Novo plano</span>
                  {!form.planId ? <Check className="h-5 w-5" /> : null}
                </button>
                {plans.map((plan) => {
                  const selected = plan.id === form.planId;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      className={cn("flex w-full items-center justify-between gap-3 rounded-[8px] px-4 py-3 text-left text-base font-black text-white transition hover:bg-primary hover:text-black", selected && "bg-primary text-black")}
                      onClick={() => selectPlan(plan.id)}
                    >
                      <span className="truncate">{plan.name}</span>
                      {selected ? <Check className="h-5 w-5" /> : <span className="shrink-0 text-sm">{formatCurrency(plan.value)}</span>}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3">
            {plans.length === 0 ? <p className="rounded-[8px] border border-white/10 p-4 text-sm text-white/60">Nenhum plano cadastrado.</p> : null}
            {plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => selectPlan(plan.id)}
                className={cn(
                  "rounded-[8px] border p-3 text-left text-sm transition hover:border-primary/50",
                  form.planId === plan.id ? "border-primary/60 bg-primary/10" : "border-white/10 bg-black/30"
                )}
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-black uppercase">{plan.name}</p>
                    <p className="text-white/55">{plan.periodDays} dias</p>
                  </div>
                  <strong className="shrink-0 text-primary">{formatCurrency(plan.value)}</strong>
                </div>
              </button>
            ))}
          </div>
        </div>

        <form className="grid min-w-0 gap-5" onSubmit={(event) => { event.preventDefault(); void requestJson(form.planId ? "PATCH" : "POST", planPayload()); }}>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">{form.planId ? "Edicao" : "Novo"}</p>
            <h3 className="mt-1 truncate text-2xl font-black uppercase">{form.planId ? `Editando: ${form.name || "plano"}` : "Novo plano"}</h3>
          </div>

          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <label className="grid min-w-0 gap-2 text-sm font-bold uppercase text-white/70 md:col-span-2">
              Nome do plano
              <input className={inputClass} placeholder="Ex.: Plano Cabelo + Barba" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>

            <label className="grid min-w-0 gap-2 text-sm font-bold uppercase text-white/70">
              Valor mensal
              <div className="flex min-w-0 items-center rounded-[10px] border border-primary/20 bg-black/45 px-4 focus-within:border-primary">
                <DollarSign className="h-5 w-5 shrink-0 text-primary" />
                <input className="min-h-12 w-full min-w-0 bg-transparent px-3 text-base font-semibold text-white outline-none" inputMode="decimal" placeholder="Ex.: 75,00" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} />
              </div>
            </label>

            <label className="grid min-w-0 gap-2 text-sm font-bold uppercase text-white/70">
              Validade
              <div className="flex min-w-0 items-center rounded-[10px] border border-primary/20 bg-black/45 px-4 focus-within:border-primary">
                <CalendarDays className="h-5 w-5 shrink-0 text-primary" />
                <input className="min-h-12 w-full min-w-0 bg-transparent px-3 text-base font-semibold text-white outline-none" inputMode="numeric" type="number" min={1} max={365} placeholder="Ex.: 30" value={form.periodDays} onChange={(event) => setForm({ ...form, periodDays: event.target.value })} />
                <span className="shrink-0 text-sm font-bold text-white/45">dias</span>
              </div>
            </label>

            <label className="grid min-w-0 gap-2 text-sm font-bold uppercase text-white/70 md:col-span-2">
              Cortes incluidos
              <input className={inputClass} inputMode="numeric" type="number" min={0} max={999} placeholder="0 para ilimitado" value={form.cutsIncluded} onChange={(event) => setForm({ ...form, cutsIncluded: event.target.value })} />
            </label>
          </div>

          <label className="grid min-w-0 gap-2 text-sm font-bold uppercase text-white/70">
            Beneficios
            <textarea className={`${inputClass} min-h-28 py-3`} placeholder="Um beneficio por linha. Ex.: Cortes ilimitados" value={form.benefits} onChange={(event) => setForm({ ...form, benefits: event.target.value })} />
          </label>

          <label className="grid min-w-0 gap-2 text-sm font-bold uppercase text-white/70">
            Descricao opcional
            <textarea className={`${inputClass} min-h-24 py-3`} placeholder="Texto curto para explicar o plano." value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </label>

          <label className="flex items-center gap-3 font-bold uppercase text-white/70"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Plano ativo</label>

          <div className="flex flex-wrap gap-3">
            <Button type="submit">{form.planId ? "Salvar alteracoes" : "Criar plano"}</Button>
            {form.planId ? (
              <Button type="button" variant="outline" onClick={() => window.confirm("Excluir este plano da lista?") && void requestJson("DELETE", { planId: form.planId })}>
                <Trash2 className="h-4 w-4" />
                Excluir plano
              </Button>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}
