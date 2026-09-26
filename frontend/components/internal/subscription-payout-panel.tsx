"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import type { SubscriptionPayoutRow } from "@/lib/server/subscription-payouts";
import { cn } from "@/utils/cn";

type SubscriptionPayoutPanelProps = {
  competenceMonth: string;
  label: string;
  revenueBase: number;
  businessShare: number;
  poolAmount: number;
  totalAttendances: number;
  pendingTotal: number;
  paidTotal: number;
  rows: SubscriptionPayoutRow[];
};

/** Converte o status persistido do repasse em rotulo curto para os cards. */
function statusLabel(status: string) {
  if (status === "PAID") return "Pago";
  if (status === "REVIEW") return "Analise";
  return "Pendente";
}

/**
 * Painel operacional do fechamento de assinaturas.
 * Exibe a competencia e valores calculados pelo servidor, separando repasse
 * principal de ajustes. Os totais distinguem 60% da barbearia e pool de 40%;
 * atendimento nao e pagamento, e somente linhas PENDING positivas oferecem baixa.
 */
export function SubscriptionPayoutPanel({
  competenceMonth,
  label,
  revenueBase,
  businessShare,
  poolAmount,
  totalAttendances,
  pendingTotal,
  paidTotal,
  rows
}: SubscriptionPayoutPanelProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<SubscriptionPayoutRow | null>(null);
  const [confirming, setConfirming] = useState<SubscriptionPayoutRow | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const mainRows = useMemo(() => rows.filter((row) => row.type === "MAIN"), [rows]);
  const adjustmentRows = useMemo(() => rows.filter((row) => row.type === "ADJUSTMENT"), [rows]);

  /** Solicita baixa por competencia, barbeiro e indicador de ajuste, sem enviar valor ou snapshot.
   * O servidor deve resolver o valor e a persistencia financeira; isLoading so limita a interface,
   * nao garante idempotencia. paidAt exibido e a data de pagamento, nao a competencia do rateio. */
  async function pay(row: SubscriptionPayoutRow) {
    if (isLoading) return;
    setIsLoading(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/internal/subscription-payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competenceMonth,
          barberId: row.barberId,
          // Ajustes usam a mesma rota, mas geram uma baixa separada da linha principal.
          adjustment: row.type === "ADJUSTMENT",
          operationKey: row.operationKey
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setFeedback(payload?.message ?? "Nao foi possivel registrar o pagamento.");
        return;
      }
      setConfirming(null);
      setFeedback("Pagamento registrado com sucesso.");
      router.refresh();
    } catch {
      setFeedback("Falha de conexao ao registrar o pagamento.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mt-8 grid gap-6">
      <form action="/admin/equipe/repasses" className="rounded-[12px] border border-primary/20 bg-card p-5 shadow-panel">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <label className="grid min-w-0 gap-2 text-sm font-bold uppercase text-white/70">
            Competencia mensal
            <input
              name="competenceMonth"
              type="month"
              defaultValue={competenceMonth}
              className="min-h-12 rounded-[10px] border border-primary/20 bg-black/45 px-4 font-semibold text-white outline-none transition focus:border-primary"
            />
          </label>
          <Button type="submit">Ver competencia</Button>
        </div>
      </form>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          ["Competencia", label],
          ["Receita considerada", formatCurrency(revenueBase)],
          ["Barbearia 60%", formatCurrency(businessShare)],
          ["Pool barbeiros 40%", formatCurrency(poolAmount)],
          ["Atendimentos validos", String(totalAttendances)]
        ].map(([title, value]) => (
          <article key={title} className="rounded-[12px] border border-primary/20 bg-card p-5 shadow-panel">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-white/50">{title}</p>
            <strong className="mt-3 block text-xl text-primary">{value}</strong>
          </article>
        ))}
      </section>

      <section className="rounded-[12px] border border-primary/20 bg-card p-5 shadow-panel">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">Repasses de assinaturas</p>
            <h2 className="text-2xl font-black uppercase">Pagamentos mensais</h2>
          </div>
          <div className="text-sm text-white/60">
            <span className="mr-4">Pendente: <strong className="text-primary">{formatCurrency(pendingTotal)}</strong></span>
            <span>Pago: <strong className="text-white">{formatCurrency(paidTotal)}</strong></span>
          </div>
        </div>

        {totalAttendances === 0 ? (
          <p className="mt-5 rounded-[10px] border border-amber-400/35 bg-amber-400/10 p-4 text-sm font-bold text-amber-100">
            Nao ha atendimentos de assinantes nesta competencia para realizar o rateio.
          </p>
        ) : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {mainRows.map((row) => (
            <article key={row.id} className="rounded-[12px] border border-white/10 bg-black/30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words text-xl font-black uppercase">{row.barberName}</h3>
                  <p className="mt-1 text-sm text-white/55">{row.subscriberAttendances} atendimento(s) de assinantes</p>
                </div>
                <span className={cn("rounded-full border px-3 py-1 text-xs font-black uppercase", row.status === "PAID" ? "border-emerald-400/40 text-emerald-200" : "border-primary/40 text-primary")}>
                  {statusLabel(row.status)}
                </span>
              </div>
              <div className="mt-4 grid gap-2 text-sm text-white/65">
                <p>Participacao: <strong className="text-white">{row.sharePercent.toFixed(2)}%</strong></p>
                <p>{row.status === "PAID" ? "Valor pago" : "Valor devido"}: <strong className="text-primary">{formatCurrency(row.status === "PAID" ? row.paidAmount : row.calculatedAmount)}</strong></p>
                {row.paidAt ? <p>Pago em: <strong className="text-white">{new Date(row.paidAt).toLocaleDateString("pt-BR")}</strong></p> : null}
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => setSelected(row)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-primary/40 px-4 text-sm font-black uppercase text-primary transition hover:bg-primary hover:text-black">
                  <Eye className="h-4 w-4" />
                  Ver detalhes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(row)}
                  disabled={row.status !== "PENDING" || row.calculatedAmount <= 0}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-black uppercase text-black transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-45"
                >
                  <Wallet className="h-4 w-4" />
                  Marcar pago
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {adjustmentRows.length > 0 ? (
        <section className="rounded-[12px] border border-primary/20 bg-card p-5 shadow-panel">
          <h2 className="text-xl font-black uppercase">Ajustes complementares</h2>
          <div className="mt-4 grid gap-3">
            {adjustmentRows.map((row) => (
              <article key={row.id} className="rounded-[10px] border border-white/10 bg-black/30 p-4">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                  <div>
                    <p className="font-black uppercase">{row.barberName}</p>
                    <p className="text-sm text-white/60">{row.status === "PAID" ? "Ajuste pago." : row.status === "REVIEW" ? "Diferenca negativa pendente de analise manual." : "Diferenca positiva pendente de pagamento."}</p>
                  </div>
                  <strong className={cn("text-xl", row.calculatedAmount >= 0 ? "text-primary" : "text-red-200")}>{formatCurrency(row.calculatedAmount)}</strong>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setSelected(row)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-primary/40 px-4 text-xs font-black uppercase text-primary transition hover:bg-primary hover:text-black">
                    <Eye className="h-4 w-4" />
                    Ver detalhes
                  </button>
                  {row.status === "PENDING" && row.calculatedAmount > 0 ? (
                    <button type="button" onClick={() => setConfirming(row)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] bg-primary px-4 text-xs font-black uppercase text-black transition hover:brightness-110">
                      <CheckCircle2 className="h-4 w-4" />
                      Pagar ajuste
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {feedback ? <p className="rounded-[10px] border border-primary/50 p-3 text-sm font-bold text-primary">{feedback}</p> : null}

      {selected ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4">
          <section className="w-full max-w-lg rounded-[12px] border border-primary/30 bg-[#101010] p-5 shadow-panel">
            <h2 className="text-xl font-black uppercase">Detalhes do rateio</h2>
            <div className="mt-4 grid gap-2 text-sm text-white/70">
              <p>Barbeiro: <strong className="text-white">{selected.barberName}</strong></p>
              <p>Competencia: <strong className="text-white">{label}</strong></p>
              {selected.detailLines.map((line) => <p key={line}>{line}</p>)}
              <p>Participacao: <strong className="text-primary">{selected.sharePercent.toFixed(2)}%</strong></p>
              <p>{selected.status === "PAID" ? "Valor pago" : "Valor"}: <strong className="text-primary">{formatCurrency(selected.status === "PAID" ? selected.paidAmount : selected.calculatedAmount)}</strong></p>
            </div>
            <Button type="button" className="mt-5 w-full" variant="outline" onClick={() => setSelected(null)}>
              Fechar
            </Button>
          </section>
        </div>
      ) : null}

      {confirming ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4">
          <section className="w-full max-w-lg rounded-[12px] border border-primary/30 bg-[#101010] p-5 shadow-panel">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">Confirmar pagamento</p>
            <h2 className="mt-2 text-2xl font-black uppercase">{confirming.barberName}</h2>
            <div className="mt-4 grid gap-2 text-sm text-white/70">
              <p>Competencia: <strong className="text-white">{label}</strong></p>
              <p>Atendimentos de assinantes: <strong className="text-white">{confirming.subscriberAttendances}</strong></p>
              <p>Participacao: <strong className="text-white">{confirming.sharePercent.toFixed(2)}%</strong></p>
              <p>Valor: <strong className="text-primary">{formatCurrency(confirming.calculatedAmount)}</strong></p>
              <p>Ao confirmar, este valor sera registrado como ganho do barbeiro e despesa paga da barbearia.</p>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" onClick={() => setConfirming(null)} disabled={isLoading}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => pay(confirming)} disabled={isLoading}>
                {isLoading ? "Pagando..." : "Confirmar pagamento"}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
