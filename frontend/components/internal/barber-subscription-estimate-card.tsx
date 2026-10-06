"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Info, RotateCw } from "lucide-react";
import { formatCurrency, formatDatePtBr } from "@/lib/format";
import type { BarberSubscriptionEstimate } from "@/lib/server/barber-subscription-estimate";

export function BarberSubscriptionEstimateCard({ estimate }: { estimate: BarberSubscriptionEstimate }) {
  const [month, setMonth] = useState(estimate.competenceMonth);
  const [data, setData] = useState(estimate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const requestId = useRef(0);
  const currentData = useRef(estimate);
  const maximumMonth = estimate.competenceMonth;
  const move = (offset: number) => {
    const [year, number] = month.split("-").map(Number);
    const date = new Date(Date.UTC(year, number - 1 + offset, 1));
    const next = date.toISOString().slice(0, 7);
    if (next <= maximumMonth) setMonth(next);
  };
  useEffect(() => {
    const id = ++requestId.current;
    // The initial server projection is already authenticated and ready to display.
    if (currentData.current.competenceMonth === month) {
      setLoading(false);
      setError("");
      return;
    }
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 20_000);
    setLoading(true);
    setError("");
    fetch(`/api/internal/subscription-estimate?competenceMonth=${month}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Nao foi possivel carregar esta competencia.");
        return response.json() as Promise<BarberSubscriptionEstimate>;
      })
      .then((result) => {
        if (result.competenceMonth !== month) throw new Error("Competencia da resposta invalida.");
        if (id === requestId.current && !controller.signal.aborted) {
          currentData.current = result;
          setData(result);
        }
      })
      .catch(() => {
        if (id === requestId.current && (!controller.signal.aborted || timedOut)) setError(timedOut ? "A consulta demorou mais que o esperado. Tente novamente." : "Nao foi possivel carregar esta competencia.");
      })
      .finally(() => {
        clearTimeout(timeout);
        if (id === requestId.current && (!controller.signal.aborted || timedOut)) setLoading(false);
      });
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [month, retry]);
  estimate = data;
  return (
    <article className="min-w-0 rounded-[12px] border border-primary/25 bg-black/30 p-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-white/50">Assinantes</p>
      <div className="mt-1 flex min-w-0 items-center gap-1">
        <button type="button" title="Mes anterior" aria-label="Mes anterior" className="flex h-11 w-11 shrink-0 items-center justify-center text-primary" onClick={() => move(-1)}><ChevronLeft size={20} /></button>
        <input type="month" aria-label="Competencia de assinaturas" className="min-w-0 flex-1 bg-transparent text-xs text-primary [color-scheme:dark]" value={month} max={maximumMonth} onChange={(event) => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value) && event.target.value <= maximumMonth) setMonth(event.target.value); }} />
        <button type="button" title="Mes seguinte" aria-label="Mes seguinte" disabled={month >= maximumMonth} className="flex h-11 w-11 shrink-0 items-center justify-center text-primary disabled:opacity-30" onClick={() => move(1)}><ChevronRight size={20} /></button>
      </div>
      <div aria-live="polite" aria-busy={!error && (loading || data.competenceMonth !== month)}>
      {error ? <div className="py-4"><p role="alert" className="text-sm text-white/60">{error}</p><button type="button" className="mt-3 inline-flex min-h-11 items-center gap-2 text-xs text-primary" onClick={() => setRetry((value) => value + 1)}><RotateCw size={16} /> Tentar novamente</button></div> : loading || data.competenceMonth !== month ? <div className="h-48 animate-pulse bg-white/5" aria-label="Carregando repasse" /> : <>
      <p className="text-xs uppercase text-primary">{estimate.label}</p>
      <strong className="mt-3 block text-lg text-white">{estimate.attendances} atendimento(s) no mes</strong>
      <p className="mt-3 text-xs font-bold uppercase text-white/60">{estimate.isPaid ? "Repasse pago" : estimate.needsReview ? "Estimativa em revisao" : month < maximumMonth ? "Repasse pendente (estimativa)" : "Estimativa do repasse"}</p>
      <strong className="mt-1 block break-words text-2xl text-primary">{formatCurrency(estimate.isPaid ? estimate.paidAmount : estimate.estimatedAmount)}</strong>
      {estimate.isPaid && estimate.paidAt ? <p className="mt-1 text-xs text-white/60">Ultimo pagamento em: {formatDatePtBr(new Date(estimate.paidAt))}</p> : null}
      <p className="mt-2 text-sm text-white/60">Participacao {estimate.isPaid ? "final" : "atual"}: {estimate.sharePercent.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</p>
      {estimate.pendingAdjustment > 0 ? <p className="mt-2 text-xs text-primary">Estimativa de complemento: {formatCurrency(estimate.pendingAdjustment)}</p> : null}
      {estimate.needsReview ? <p className="mt-2 text-xs text-white/60">Revisao pendente pelo administrador.</p> : null}
      {!estimate.isPaid ? <p className="mt-3 text-xs leading-relaxed text-white/45">Pode variar ate o fechamento do mes.</p> : null}
      <details className="mt-3 text-xs leading-relaxed text-white/50">
        <summary className="flex cursor-pointer items-center gap-1.5"><Info size={14} aria-hidden="true" /> Sobre o repasse</summary>
        <p className="mt-2">Este valor considera os atendimentos de assinantes registrados no mes. O valor final e definido no fechamento mensal e so entra nos seus ganhos apos o pagamento do repasse.</p>
      </details>
      </>}
      </div>
    </article>
  );
}
