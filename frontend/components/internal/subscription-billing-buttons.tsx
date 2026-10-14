"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDatePtBr } from "@/lib/format";
import type { SubscriptionBillingPreview } from "@/lib/server/subscription-billing";

export function SubscriptionBillingButtons({ subscriptionId, today }: { subscriptionId: string; today: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"confirm" | "schedule" | null>(null);
  const [preview, setPreview] = useState<SubscriptionBillingPreview | null>(null);
  const [day, setDay] = useState(10);
  const [paidDate, setPaidDate] = useState(today);
  const [method, setMethod] = useState("");
  const [acknowledgeLegacy, setAcknowledgeLegacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!mode) return;
    const controller = new AbortController();
    setPreview(null); setError("");
    fetch(`/api/internal/subscription-billing?subscriptionId=${subscriptionId}${mode === "schedule" ? `&newDay=${day}` : ""}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.message); return data; })
      .then((data) => { if (!controller.signal.aborted) setPreview(data); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Falha de conexao."); });
    return () => controller.abort();
  }, [subscriptionId, mode, day]);
  const open = (action: "confirm" | "schedule") => { setMode(action); setAcknowledgeLegacy(false); setError(""); dialog.current?.showModal(); };
  const close = () => { if (busy) return; dialog.current?.close(); setMode(null); };
  async function submit() {
    if (!preview || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/internal/subscription-billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mode === "confirm" ? { action: mode, subscriptionId, operationKey: preview.operationKey, paidDate, method, acknowledgeLegacy } : { action: mode, subscriptionId, operationKey: preview.operationKey, newDay: day }) });
      const payload = await response.json();
      if (!response.ok) { setError(payload.message ?? "Nao foi possivel concluir."); return; }
      dialog.current?.close(); setMode(null); router.refresh();
    } catch { setError("Falha de conexao. Confira a previa antes de tentar novamente."); }
    finally { setBusy(false); }
  }
  const date = (value: string) => formatDatePtBr(new Date(value));
  return <>
    <div className="mt-3 flex flex-wrap gap-2">
      <Button type="button" onClick={() => open("confirm")}><CheckCircle2 size={18} />Confirmar pagamento</Button>
      <Button type="button" variant="outline" onClick={() => open("schedule")}><CalendarClock size={18} />Alterar vencimento</Button>
    </div>
    <dialog ref={dialog} onCancel={(event) => { if (busy) event.preventDefault(); else setMode(null); }} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-lg border border-primary/30 bg-card p-6 text-white backdrop:bg-black/80">
      <h2 className="text-xl font-black uppercase">{mode === "confirm" ? "Confirmar pagamento" : "Programar vencimento"}</h2>
      {mode === "schedule" ? <label className="mt-4 block text-sm">Novo dia de vencimento<input type="number" min={1} max={31} value={day} onChange={(event) => setDay(Number(event.target.value))} className="mt-2 block w-full rounded border border-primary/30 bg-black p-3" /></label> : null}
      {preview ? <dl className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 text-sm [&_dd]:break-words">
        <dt>Cliente</dt><dd>{preview.clientName}</dd><dt>Plano</dt><dd>{preview.planName}</dd><dt>Mensalidade</dt><dd>{formatCurrency(preview.amount)}</dd>
        <dt>Inicio registrado</dt><dd>{date(preview.originalStartDate)}</dd><dt>Data-base atual</dt><dd>Dia {preview.baseDay}</dd><dt>Vencimento do ciclo</dt><dd>{date(preview.currentDueDate)}</dd>
        <dt>{mode === "confirm" ? "Proximo vencimento" : "Passara a valer a partir de"}</dt><dd>{date(preview.nextDueDate)}</dd>
        {mode === "confirm" ? <><dt>Fim do periodo coberto</dt><dd>{date(preview.coverageEndDate)} (exclusivo)</dd></> : null}
        <dt>{mode === "confirm" ? "Competencia quitada" : "Obrigacao atual preservada"}</dt><dd>{preview.competenceMonth}</dd>
      </dl> : !error ? <p className="mt-4" role="status">Calculando previa...</p> : null}
      {mode === "confirm" ? <>
        <label className="mt-4 block text-sm">Data real do pagamento<input type="date" value={paidDate} max={today} onChange={(event) => setPaidDate(event.target.value)} className="mt-2 block w-full rounded border border-primary/30 bg-black p-3 [color-scheme:dark]" /></label>
        <label className="mt-4 block text-sm">Forma de pagamento<select value={method} onChange={(event) => setMethod(event.target.value)} className="mt-2 block w-full rounded border border-primary/30 bg-black p-3"><option value="">Selecionar</option><option value="PIX">Pix</option><option value="CASH">Dinheiro</option><option value="CREDIT_CARD">Cartao de credito</option><option value="DEBIT_CARD">Cartao de debito</option><option value="BANK_TRANSFER">Transferencia</option></select></label>
        {preview?.needsInitialReview ? <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={acknowledgeLegacy} onChange={(event) => setAcknowledgeLegacy(event.target.checked)} />Conferi que o inicio registrado corresponde ao inicio real da assinatura e que este e o ciclo correto. Nenhum pagamento anterior sera presumido.</label> : null}
        {preview?.stillOverdueAfterPayment ? <p className="mt-4 text-sm text-primary">Este pagamento quita somente o ciclo exibido. Outras mensalidades vencidas continuam pendentes.</p> : null}
      </> : <p className="mt-4 text-sm text-white/70">Esta alteracao nao modifica mensalidades ja vencidas ou o ciclo atual. O valor da mensalidade permanecera o mesmo, sem pro-rata. Dias 29, 30 e 31 usam o ultimo dia de meses menores sem mudar a data-base.</p>}
      {error ? <p className="mt-4 text-sm text-primary" role="alert">{error}</p> : null}
      <div className="mt-6 flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={close} disabled={busy}>Cancelar</Button><Button type="button" onClick={submit} disabled={busy || !preview || (mode === "confirm" && (!method || !paidDate || (preview.needsInitialReview && !acknowledgeLegacy)))}>{busy ? "Processando..." : mode === "confirm" ? "Confirmar pagamento" : "Programar alteracao"}</Button></div>
    </dialog>
  </>;
}
