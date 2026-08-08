"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type AvailabilityDay = {
  weekDay: number;
  label: string;
  active: boolean;
  startTime: string;
  endTime: string;
};

const inputClass = "min-h-11 rounded-[10px] border border-primary/20 bg-black/45 px-3 font-semibold text-white outline-none";

export function AvailabilityForm({ barberId, days }: { barberId?: string; days: AvailabilityDay[] }) {
  const router = useRouter();
  const [items, setItems] = useState(days);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function updateDay(index: number, changes: Partial<AvailabilityDay>) {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...changes } : item)));
  }

  async function save() {
    setFeedback(null);
    setIsLoading(true);
    try {
      const response = await fetch("/api/internal/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barberId, days: items })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setFeedback(payload?.message ?? "Nao foi possivel salvar.");
        return;
      }
      setFeedback("Disponibilidade atualizada.");
      router.refresh();
    } catch {
      setFeedback("Falha de conexao.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
      <h2 className="text-xl font-black uppercase">Disponibilidade semanal</h2>
      <div className="mt-5 grid gap-3">
        {items.map((item, index) => (
          <div key={item.weekDay} className="grid gap-3 rounded-[10px] border border-white/10 bg-black/30 p-4 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
            <label className="flex items-center gap-3 font-black uppercase">
              <input type="checkbox" checked={item.active} onChange={(event) => updateDay(index, { active: event.target.checked })} />
              {item.label}
            </label>
            <label className="grid gap-1 text-xs font-bold uppercase text-white/55">
              Inicio
              <input className={inputClass} type="time" value={item.startTime} onChange={(event) => updateDay(index, { startTime: event.target.value })} disabled={!item.active} />
            </label>
            <label className="grid gap-1 text-xs font-bold uppercase text-white/55">
              Fim
              <input className={inputClass} type="time" value={item.endTime} onChange={(event) => updateDay(index, { endTime: event.target.value })} disabled={!item.active} />
            </label>
            <span className={`rounded-full border px-3 py-2 text-xs font-black uppercase ${item.active ? "border-primary/40 bg-primary/10 text-primary" : "border-white/10 bg-white/5 text-white/35"}`}>
              {item.active ? "Atende" : "Indisponivel"}
            </span>
          </div>
        ))}
      </div>
      {feedback ? <p className="mt-5 rounded-[8px] border border-primary/50 p-3 text-sm text-primary">{feedback}</p> : null}
      <Button type="button" className="mt-5" onClick={save} disabled={isLoading}>{isLoading ? "Salvando..." : "Salvar disponibilidade"}</Button>
    </section>
  );
}
