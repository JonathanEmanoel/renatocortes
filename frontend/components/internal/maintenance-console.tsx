"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, EyeOff, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import type { MaintenanceCategory, MaintenanceMode, MaintenancePreview, MaintenanceRow } from "@/lib/server/maintenance";

type MaintenanceConsoleProps = {
  category: MaintenanceCategory;
  rows: MaintenanceRow[];
  hiddenView?: boolean;
};

/** Conduz selecao, previa e confirmacao de manutencao usando linhas fornecidas pelo servidor.
 * Na vista de ocultos a exclusao e definitiva; restauracao usa uma chamada separada.
 * Restricao a desenvolvedor, protecao de registros e atomicidade precisam ser impostas pela API. */
export function MaintenanceConsole({ category, rows, hiddenView = false }: MaintenanceConsoleProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mode, setMode] = useState<MaintenanceMode>("hide");
  const [restoreStock, setRestoreStock] = useState(true);
  const [confirmation, setConfirmation] = useState("");
  const [preview, setPreview] = useState<MaintenancePreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectableRows = useMemo(() => rows.filter((row) => !row.protected), [rows]);
  const effectiveMode: MaintenanceMode = hiddenView ? "delete" : mode;

  /** Invalida a previa ao mudar os IDs para nao confirmar o resumo de outra selecao. */
  function toggle(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setPreview(null);
    setMessage(null);
  }

  /** Seleciona apenas as linhas recebidas que nao estao protegidas, e descarta a previa anterior. */
  function selectAll() {
    setSelectedIds(selectableRows.map((row) => row.id));
    setPreview(null);
    setMessage(null);
  }

  /** Descarta selecao, previa e texto de confirmacao para iniciar outra operacao. */
  function clearSelection() {
    setSelectedIds([]);
    setPreview(null);
    setMessage(null);
    setConfirmation("");
  }

  /** Envia o estado atual: POST solicita previa, PATCH restaura e DELETE executa o modo escolhido.
   * restoreStock expressa uma opcao, nao garante reposicao; nao ha token de previa neste payload. */
  async function callMaintenance(method: "POST" | "DELETE" | "PATCH") {
    const response = await fetch("/api/internal/maintenance", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, ids: selectedIds, mode: effectiveMode, restoreStock, confirmation, includeHidden: hiddenView })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Nao foi possivel executar a manutencao.");
    return data;
  }

  /** Busca impactos sem executar a exclusao; o resumo recebido fica no estado local ate ser invalidado. */
  function handlePreview() {
    setMessage(null);
    startTransition(async () => {
      try {
        const data = await callMaintenance("POST");
        setPreview(data.preview);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Nao foi possivel gerar o preview.");
      }
    });
  }

  /** Pede confirmacao simples e solicita restauracao dos IDs; recarrega a pagina apos sucesso. */
  function handleRestore() {
    if (!window.confirm("Restaurar os registros selecionados para as telas e relatorios do sistema?")) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const data = await callMaintenance("PATCH");
        setMessage(data.message);
        setPreview(null);
        setSelectedIds([]);
        setConfirmation("");
        window.location.reload();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Nao foi possivel restaurar os registros.");
      }
    });
  }

  /** Solicita ocultacao ou exclusao com o estado atual, apos o fluxo visual de previa e EXCLUIR.
   * A API precisa revalidar impactos e confirmacao; o modal nao constitui garantia transacional. */
  function handleExecute() {
    setMessage(null);
    startTransition(async () => {
      try {
        const data = await callMaintenance("DELETE");
        setMessage(data.message);
        setPreview(null);
        setSelectedIds([]);
        setConfirmation("");
        window.location.reload();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Nao foi possivel concluir a operacao.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[12px] border border-red-500/30 bg-red-500/10 p-4 text-red-100">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-1 h-5 w-5 shrink-0" />
          <p className="text-sm font-bold">
            {hiddenView
              ? "Area restrita ao desenvolvedor. Esta aba mostra o que foi ocultado. Voce pode restaurar registros ou excluir definitivamente com pre-visualizacao."
              : "Area restrita ao desenvolvedor. Use primeiro a pre-visualizacao. Ocultar preserva dados com deletedAt; excluir remove registros selecionados quando permitido."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-primary/20 bg-card p-4">
        {hiddenView ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-primary bg-primary px-4 text-sm font-black uppercase text-black">
              <EyeOff className="h-4 w-4" />
              Visualizando ocultos
            </span>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                setMode("hide");
                setPreview(null);
              }}
              className={`inline-flex min-h-11 items-center gap-2 rounded-[10px] border px-4 text-sm font-black uppercase transition ${mode === "hide" ? "border-primary bg-primary text-black" : "border-primary/35 text-primary hover:bg-primary/10"}`}
            >
              <EyeOff className="h-4 w-4" />
              Modo ocultar
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("delete");
                setPreview(null);
              }}
              className={`inline-flex min-h-11 items-center gap-2 rounded-[10px] border px-4 text-sm font-black uppercase transition ${mode === "delete" ? "border-red-500 bg-red-500 text-white" : "border-red-500/50 text-red-200 hover:bg-red-500/10"}`}
            >
              <Trash2 className="h-4 w-4" />
              Modo excluir
            </button>
          </>
        )}
        {(category === "in-person-sales" || category === "store-orders" || category === "accounts") ? (
          <label className="ml-auto flex items-center gap-2 text-sm font-bold uppercase text-white/70">
            <input type="checkbox" checked={restoreStock} onChange={(event) => setRestoreStock(event.target.checked)} className="h-4 w-4 accent-primary" />
            Restaurar estoque quando aplicavel
          </label>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="outline" onClick={selectAll} disabled={selectableRows.length === 0}>Selecionar todos filtrados</Button>
        <Button type="button" variant="ghost" onClick={clearSelection}>Limpar selecao</Button>
        {hiddenView ? (
          <Button type="button" onClick={handleRestore} disabled={selectedIds.length === 0 || isPending} variant="outline">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Restaurar selecionados
          </Button>
        ) : null}
        <Button type="button" onClick={handlePreview} disabled={selectedIds.length === 0 || isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {hiddenView ? "Pre-visualizar exclusao definitiva" : mode === "hide" ? "Pre-visualizar ocultacao" : "Pre-visualizar exclusao"}
        </Button>
      </div>

      <p className="text-sm font-bold uppercase tracking-[0.14em] text-white/55">{selectedIds.length} registro(s) selecionado(s)</p>
      {message ? <p className="rounded-[10px] border border-primary/30 bg-primary/10 p-3 text-sm font-bold text-primary">{message}</p> : null}

      <div className="grid gap-3">
        {rows.length === 0 ? <p className="rounded-[12px] border border-white/10 bg-black/30 p-5 text-white/60">Nenhum registro encontrado para os filtros.</p> : null}
        {rows.map((row) => (
          <label key={row.id} className={`block rounded-[12px] border p-4 transition ${selectedIds.includes(row.id) ? "border-primary bg-primary/10" : "border-white/10 bg-black/30"} ${row.protected ? "opacity-60" : "cursor-pointer hover:border-primary/40"}`}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="flex gap-3">
                <input
                  type="checkbox"
                  disabled={row.protected}
                  checked={selectedIds.includes(row.id)}
                  onChange={() => toggle(row.id)}
                  className="mt-1 h-4 w-4 accent-primary"
                />
                <div>
                  <p className="font-black uppercase">{row.title}</p>
                  <p className="mt-1 text-sm text-white/60">{row.subtitle}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {row.meta.map((item) => (
                      <span key={item} className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-bold text-white/60">{item}</span>
                    ))}
                  </div>
                  {row.protected ? <p className="mt-3 text-sm font-bold text-red-200">{row.protectedReason}</p> : null}
                </div>
              </div>
              <div className="text-left md:text-right">
                <p className="text-sm uppercase text-white/55">Impacto</p>
                <strong className="block text-primary">{formatCurrency(row.amount)}</strong>
                <p className="mt-2 text-sm uppercase text-white/55">Comissao</p>
                <strong className="block text-white">{formatCurrency(row.commission)}</strong>
              </div>
            </div>
          </label>
        ))}
      </div>

      {preview ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[16px] border border-primary/30 bg-[#0f0f0f] p-6 shadow-panel">
            <div className="flex items-start gap-3">
              <AlertTriangle className={`h-8 w-8 ${effectiveMode === "delete" ? "text-red-400" : "text-primary"}`} />
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">Preview obrigatorio</p>
                <h2 className="mt-2 text-2xl font-black uppercase">{effectiveMode === "hide" ? "Ocultar registros" : hiddenView ? "Excluir definitivamente" : "Excluir registros"}</h2>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <Summary label="Registros" value={String(preview.count)} />
              <Summary label="Receita" value={formatCurrency(preview.revenueImpact)} />
              <Summary label="Comissoes" value={formatCurrency(preview.commissionImpact)} />
              <Summary label="Estoque" value={String(preview.stockRestoreCount)} />
            </div>

            {preview.warnings.length ? (
              <div className="mt-5 rounded-[12px] border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-100">
                {preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}
              </div>
            ) : null}

            <div className="mt-5 grid gap-2">
              {preview.rows.map((row) => (
                <div key={row.id} className="rounded-[10px] border border-white/10 bg-black/30 p-3">
                  <p className="font-black uppercase">{row.title}</p>
                  <p className="text-sm text-white/60">{row.subtitle}</p>
                </div>
              ))}
            </div>

            <label className="mt-5 grid gap-2 text-sm font-bold uppercase text-white/70">
              Digite EXCLUIR para confirmar
              <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="min-h-12 rounded-[10px] border border-primary/20 bg-black/45 px-4 text-white outline-none focus:border-primary" />
            </label>

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setPreview(null)}>Cancelar</Button>
              <Button type="button" onClick={handleExecute} disabled={confirmation !== "EXCLUIR" || isPending} className={effectiveMode === "delete" ? "bg-red-500 text-white hover:brightness-110" : undefined}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {effectiveMode === "hide" ? "Ocultar selecionados" : hiddenView ? "Excluir definitivamente" : "Excluir selecionados"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-white/10 bg-black/30 p-3">
      <p className="text-xs uppercase tracking-[0.12em] text-white/50">{label}</p>
      <strong className="mt-1 block text-primary">{value}</strong>
    </div>
  );
}
