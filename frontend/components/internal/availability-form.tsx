"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { dayValidationMessage, type ScheduleBreakInput } from "@/lib/availability-rules";

type AvailabilityDay = {
  weekDay: number;
  label: string;
  active: boolean;
  startTime: string;
  endTime: string;
  breaks: ScheduleBreakInput[];
};

const inputClass = "min-h-11 w-full min-w-0 rounded-[8px] border border-primary/20 bg-black/45 px-3 font-semibold text-white outline-none focus:border-primary";

export function AvailabilityForm({ barberId, days }: { barberId?: string; days: AvailabilityDay[] }) {
  const router = useRouter();
  const [items, setItems] = useState(days);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [conflicts, setConflicts] = useState<{ date: string; time: string; client: string }[]>([]);

  function updateDay(index: number, changes: Partial<AvailabilityDay>) {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...changes } : item)));
  }

  async function save() {
    setFeedback(null);
    setConflicts([]);
    const invalid = items.find((item) => dayValidationMessage(item));
    if (invalid) { setFeedback(`${invalid.label}: ${dayValidationMessage(invalid)}`); return; }
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
        setConflicts(payload?.conflicts ?? []);
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
      <fieldset disabled={isLoading} className="mt-5 min-w-0 grid gap-3">
        {items.map((item, index) => (
          <div key={item.weekDay} className="min-w-0 grid gap-3 border-b border-white/10 py-4">
            <div className="grid min-w-0 grid-cols-2 items-end gap-3 md:grid-cols-[1fr_9rem_9rem_auto]">
            <label className="flex items-center gap-3 font-black uppercase">
              <input type="checkbox" checked={item.active} onChange={(event) => updateDay(index, { active: event.target.checked })} />
              {item.label}
            </label>
            <label className="grid gap-1 text-xs font-bold uppercase text-white/55">
              Inicio
              <input aria-label={`${item.label}: inicio do expediente`} className={inputClass} type="time" value={item.startTime} onChange={(event) => updateDay(index, { startTime: event.target.value })} disabled={!item.active} required />
            </label>
            <label className="grid gap-1 text-xs font-bold uppercase text-white/55">
              Fim
              <input aria-label={`${item.label}: fim do expediente`} className={inputClass} type="time" value={item.endTime} onChange={(event) => updateDay(index, { endTime: event.target.value })} disabled={!item.active} required />
            </label>
            <span className={`rounded-full border px-3 py-2 text-xs font-black uppercase ${item.active ? "border-primary/40 bg-primary/10 text-primary" : "border-white/10 bg-white/5 text-white/35"}`}>
              {item.active ? "Atende" : "Indisponivel"}
            </span>
            </div>
            <fieldset disabled={!item.active} aria-label={`Intervalos de ${item.label}`} className="min-w-0 grid gap-3 disabled:opacity-50">
              <legend className="mb-2 text-xs font-bold uppercase text-white/55">Intervalos</legend>
              {item.breaks.map((pause, pauseIndex) => (
                <div key={pauseIndex} className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-[9rem_9rem_minmax(0,1fr)_auto] md:items-end">
                  <label className="grid min-w-0 gap-1 text-xs font-bold text-white/65">Inicio
                    <input type="time" aria-label={`${item.label}: inicio do intervalo ${pauseIndex + 1}`} className={inputClass} value={pause.startTime} onChange={(event) => updateDay(index, { breaks: item.breaks.map((value, i) => i === pauseIndex ? { ...value, startTime: event.target.value } : value) })} />
                  </label>
                  <label className="grid min-w-0 gap-1 text-xs font-bold text-white/65">Fim
                    <input type="time" aria-label={`${item.label}: fim do intervalo ${pauseIndex + 1}`} className={inputClass} value={pause.endTime} onChange={(event) => updateDay(index, { breaks: item.breaks.map((value, i) => i === pauseIndex ? { ...value, endTime: event.target.value } : value) })} />
                  </label>
                  <label className="grid min-w-0 gap-1 text-xs font-bold text-white/65">Descricao (opcional)
                    <input aria-label={`${item.label}: descricao do intervalo ${pauseIndex + 1}`} className={inputClass} maxLength={80} placeholder="Intervalo" value={pause.label ?? ""} onChange={(event) => updateDay(index, { breaks: item.breaks.map((value, i) => i === pauseIndex ? { ...value, label: event.target.value } : value) })} />
                  </label>
                  <button type="button" title="Remover intervalo" aria-label={`${item.label}: remover intervalo ${pauseIndex + 1}`} className="min-h-11 min-w-11 justify-self-end rounded-[8px] border border-red-400/30 px-3 text-red-300 focus-visible:outline focus-visible:outline-2" onClick={() => updateDay(index, { breaks: item.breaks.filter((_, i) => i !== pauseIndex) })}><Trash2 className="h-5 w-5" /></button>
                </div>
              ))}
              <button type="button" disabled={item.breaks.length >= 12} className="inline-flex min-h-11 items-center justify-self-start gap-2 rounded-[8px] border border-primary/30 px-3 text-sm font-bold text-primary disabled:opacity-50" onClick={() => updateDay(index, { breaks: [...item.breaks, { startTime: "", endTime: "", label: "" }] })}><Plus className="h-4 w-4" />Adicionar intervalo</button>
            </fieldset>
            {dayValidationMessage(item) ? <p className="text-sm text-amber-300">{dayValidationMessage(item)}</p> : null}
          </div>
        ))}
      </fieldset>
      {feedback ? <p role="status" className="mt-5 rounded-[8px] border border-primary/50 p-3 text-sm text-primary">{feedback}</p> : null}
      {conflicts.length ? <ul className="mt-3 grid gap-2 text-sm text-amber-200">{conflicts.map((conflict, index) => <li key={index}>{conflict.date.split("-").reverse().join("/")} - {conflict.time} - {conflict.client}</li>)}</ul> : null}
      <Button type="button" className="mt-5" onClick={save} disabled={isLoading}>{isLoading ? "Salvando..." : "Salvar disponibilidade"}</Button>
    </section>
  );
}
