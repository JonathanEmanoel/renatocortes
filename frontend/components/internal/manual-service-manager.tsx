"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Trash2 } from "lucide-react";
import { ManualServiceForm, type BarberOption, type ServiceOption, type SubscriberOption } from "@/components/internal/manual-service-form";
import { formatCurrency } from "@/lib/format";

export type ManualServiceRecord = {
  id: string;
  source?: "current" | "legacy";
  serviceDate: string;
  customerName: string;
  notes: string;
  subscriptionId: string | null;
  pendingChange: string | null;
  items: { serviceId: string; name: string; quantity: number; price: number; chargedPrice: number; covered: boolean }[];
};

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function ManualServiceManager({
  records,
  services,
  barbers,
  subscribers,
  barberId
}: {
  records: ManualServiceRecord[];
  services: ServiceOption[];
  barbers: BarberOption[];
  subscribers: SubscriberOption[];
  barberId: string;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const searchText = normalizeSearch(search);
    return records.filter((record) => {
      if (date && record.serviceDate !== date) return false;
      if (!searchText) return true;
      return (
        normalizeSearch(record.customerName).includes(searchText) ||
        record.items.some((item) => normalizeSearch(item.name).includes(searchText))
      );
    });
  }, [records, date, search]);

  const hasFilters = Boolean(date || search.trim());

  async function removeRecord(id: string) {
    setFeedback(null);
    setDeletingId(id);
    try {
      const response = await fetch(`/api/internal/manual-services/${id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setFeedback(payload?.message ?? "Nao foi possivel excluir.");
        return;
      }
      router.refresh();
    } catch {
      setFeedback("Falha de conexao.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="rounded-[12px] border border-primary/20 bg-card p-5 shadow-panel">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">Minha producao manual</p>
          <h2 className="text-2xl font-black uppercase">Meus atendimentos avulsos</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="min-h-11 rounded-[10px] border border-primary/20 bg-black/45 px-4 font-semibold text-white outline-none"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cliente ou servico"
            className="min-h-11 rounded-[10px] border border-primary/20 bg-black/45 px-4 font-semibold text-white outline-none"
          />
          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setDate("");
                setSearch("");
              }}
              className="min-h-11 rounded-[10px] border border-primary/40 px-4 text-sm font-black uppercase text-primary transition hover:bg-primary hover:text-black sm:col-span-2"
            >
              Limpar filtros
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {filtered.length === 0 ? (
          <p className="rounded-[10px] border border-white/10 bg-black/30 p-4 text-sm text-white/60">
            {records.length === 0
              ? "Voce ainda nao possui atendimentos avulsos registrados."
              : hasFilters
                ? "Nenhum atendimento corresponde aos filtros informados."
                : "Nenhum atendimento encontrado."}
          </p>
        ) : null}
        {filtered.map((record) => {
          const charged = record.items.reduce((sum, item) => sum + item.chargedPrice * item.quantity, 0);
          const editing = editingId === record.id;
          return (
            <article key={record.id} className="rounded-[10px] border border-white/10 bg-black/30 p-4">
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">{record.serviceDate.split("-").reverse().join("/")}</p>
                  <h3 className="mt-1 font-black uppercase">{record.customerName}</h3>
                  <p className="mt-1 text-sm text-white/60">
                    {record.items.map((item) => `${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ""}${item.covered ? " (plano)" : ""}`).join(" + ")}
                  </p>
                  {record.pendingChange ? <p className="mt-2 text-xs font-black uppercase text-amber-200">Alteracao pendente de aprovacao</p> : null}
                </div>
                <div className="flex flex-col gap-2 md:items-end">
                  <strong className="text-xl text-primary">{formatCurrency(charged)}</strong>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditingId(editing ? null : record.id)} disabled={Boolean(record.pendingChange)} className="inline-flex min-h-10 items-center gap-2 rounded-[8px] border border-primary/40 px-3 text-xs font-black uppercase text-primary disabled:opacity-45">
                      <Edit3 className="h-4 w-4" />
                      Editar
                    </button>
                    <button type="button" onClick={() => removeRecord(record.id)} disabled={deletingId === record.id || Boolean(record.pendingChange)} className="inline-flex min-h-10 items-center gap-2 rounded-[8px] border border-red-400/50 px-3 text-xs font-black uppercase text-red-200 disabled:opacity-50">
                      <Trash2 className="h-4 w-4" />
                      {deletingId === record.id ? "Excluindo..." : "Excluir"}
                    </button>
                  </div>
                </div>
              </div>
              {editing ? (
                <div className="mt-4">
                  <ManualServiceForm
                    mode="edit"
                    endpoint={`/api/internal/manual-services/${record.source === "legacy" ? `legacy-${record.id}` : record.id}`}
                    method="PATCH"
                    services={services}
                    barbers={barbers}
                    subscribers={subscribers}
                    defaultBarberId={barberId}
                    submitLabel="Salvar alteracao"
                    initialValues={{
                      barberId,
                      serviceDate: record.serviceDate,
                      customerName: record.subscriptionId ? "" : record.customerName,
                      notes: record.notes,
                      subscriptionId: record.subscriptionId,
                      items: record.items.map((item) => ({ serviceId: item.serviceId, quantity: item.quantity }))
                    }}
                    onSaved={() => setEditingId(null)}
                  />
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      {feedback ? <p className="mt-4 rounded-[8px] border border-primary/50 p-3 text-sm text-primary">{feedback}</p> : null}
    </section>
  );
}
