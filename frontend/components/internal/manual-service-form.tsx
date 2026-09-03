"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CalendarDays, Search, Scissors, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format";
import { todayDateInput } from "@/lib/server/date-periods";
import { cn } from "@/utils/cn";

export type ServiceOption = {
  id: string;
  name: string;
  price: number;
};

export type BarberOption = {
  id: string;
  name: string;
};

export type SubscriberOption = {
  id: string;
  clientId: string;
  name: string;
  phone: string;
  plan: string;
  coveredServiceIds: string[];
};

type ManualServiceFormProps = {
  services: ServiceOption[];
  barbers: BarberOption[];
  subscribers?: SubscriberOption[];
  defaultBarberId?: string;
  canChooseBarber?: boolean;
  mode?: "create" | "edit";
  endpoint?: string;
  method?: "POST" | "PATCH";
  initialValues?: {
    serviceDate?: string;
    barberId?: string;
    customerName?: string;
    notes?: string;
    subscriptionId?: string | null;
    items?: { serviceId: string; quantity: number }[];
  };
  submitLabel?: string;
  onSaved?: () => void;
};

function initialQuantities(items?: { serviceId: string; quantity: number }[]) {
  return Object.fromEntries((items ?? []).map((item) => [item.serviceId, String(item.quantity)]));
}

function parseQuantity(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity >= 1 ? quantity : null;
}

export function ManualServiceForm({
  services,
  barbers,
  subscribers = [],
  defaultBarberId,
  canChooseBarber,
  mode = "create",
  endpoint = "/api/internal/manual-services",
  method = "POST",
  initialValues,
  submitLabel,
  onSaved
}: ManualServiceFormProps) {
  const router = useRouter();
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(initialValues?.items?.map((item) => item.serviceId) ?? []);
  const [quantities, setQuantities] = useState<Record<string, string>>(initialQuantities(initialValues?.items));
  const [barberId, setBarberId] = useState(initialValues?.barberId ?? defaultBarberId ?? barbers[0]?.id ?? "");
  const [serviceDate, setServiceDate] = useState(initialValues?.serviceDate ?? todayDateInput());
  const [customerName, setCustomerName] = useState(initialValues?.customerName ?? "");
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [subscriberMode, setSubscriberMode] = useState(Boolean(initialValues?.subscriptionId));
  const [subscriberSearch, setSubscriberSearch] = useState("");
  const [subscriptionId, setSubscriptionId] = useState(initialValues?.subscriptionId ?? "");
  const [highQuantityConfirmed, setHighQuantityConfirmed] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const selectedSubscriber = subscribers.find((subscriber) => subscriber.id === subscriptionId) ?? null;
  const coveredIds = useMemo(() => new Set(selectedSubscriber?.coveredServiceIds ?? []), [selectedSubscriber]);
  const filteredSubscribers = subscribers.filter((subscriber) => {
    const search = subscriberSearch.trim().toLowerCase();
    if (!search) return true;
    return subscriber.name.toLowerCase().includes(search) || subscriber.phone.toLowerCase().includes(search);
  });

  const selectedItems = useMemo(
    () =>
      selectedServiceIds.map((id) => {
        const service = services.find((item) => item.id === id);
        const quantity = subscriberMode ? 1 : parseQuantity(quantities[id] ?? "1") ?? 0;
        const covered = subscriberMode && coveredIds.has(id);
        return { service, quantity, covered };
      }),
    [selectedServiceIds, services, quantities, subscriberMode, coveredIds]
  );

  const totals = useMemo(() => {
    const charged = selectedItems.reduce((sum, item) => sum + (item.service && !item.covered ? item.service.price * item.quantity : 0), 0);
    const list = selectedItems.reduce((sum, item) => sum + (item.service ? item.service.price * item.quantity : 0), 0);
    return { charged, list, commission: charged * 0.5, highQuantity: selectedItems.some((item) => item.quantity > 50) };
  }, [selectedItems]);

  function toggleService(id: string) {
    setSelectedServiceIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
    setQuantities((current) => ({ ...current, [id]: current[id] ?? "1" }));
  }

  function updateQuantity(id: string, value: string) {
    if (value === "" || /^\d+$/.test(value)) {
      setQuantities((current) => ({ ...current, [id]: value }));
    }
  }

  async function submit() {
    if (isLoading) return;
    setFeedback(null);
    if (selectedServiceIds.length === 0) {
      setFeedback("Selecione pelo menos um servico.");
      return;
    }
    if (subscriberMode && !selectedSubscriber) {
      setFeedback("Selecione um assinante ativo.");
      return;
    }
    const invalidQuantity = !subscriberMode && selectedServiceIds.some((serviceId) => !parseQuantity(quantities[serviceId] ?? "1"));
    if (invalidQuantity) {
      setFeedback("Informe multiplicadores inteiros maiores que zero.");
      return;
    }
    if (totals.highQuantity && !highQuantityConfirmed) {
      setFeedback("Confirme a quantidade alta antes de continuar.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barberId,
          serviceDate,
          customerName: subscriberMode ? undefined : customerName || undefined,
          notes: notes || undefined,
          subscriptionId: subscriberMode ? selectedSubscriber?.id : null,
          clientId: subscriberMode ? selectedSubscriber?.clientId : null,
          items: selectedServiceIds.map((serviceId) => ({ serviceId, quantity: subscriberMode ? 1 : parseQuantity(quantities[serviceId] ?? "1") ?? 1 })),
          highQuantityConfirmed
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setFeedback(payload?.message ?? "Nao foi possivel registrar.");
        return;
      }
      if (mode === "create") {
        setSelectedServiceIds([]);
        setQuantities({});
        setCustomerName("");
        setNotes("");
        setHighQuantityConfirmed(false);
      }
      setFeedback(mode === "edit" ? "Atendimento salvo. Se foi alterado por barbeiro, aguardara aprovacao." : "Atendimento registrado com sucesso.");
      onSaved?.();
      router.refresh();
    } catch {
      setFeedback("Falha de conexao.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-black uppercase">{mode === "edit" ? "Editar atendimento avulso" : "Atendimento avulso"}</h2>
          <p className="mt-1 text-sm text-white/55">Servicos de assinante cobertos pelo plano entram como R$0,00 e contam para o rateio da assinatura.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setSubscriberMode(false)}
            className={cn("rounded-[10px] border px-4 py-2 text-xs font-black uppercase", !subscriberMode ? "border-primary bg-primary text-black" : "border-white/15 bg-black/30 text-white")}
          >
            Cliente avulso
          </button>
          <button
            type="button"
            onClick={() => setSubscriberMode(true)}
            className={cn("rounded-[10px] border px-4 py-2 text-xs font-black uppercase", subscriberMode ? "border-primary bg-primary text-black" : "border-white/15 bg-black/30 text-white")}
          >
            Assinante
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-5">
        <div className="grid gap-4 md:grid-cols-2">
          {canChooseBarber ? (
            <label className="grid gap-2">
              <span className="font-bold uppercase text-white/70">Barbeiro</span>
              <select className="min-h-12 rounded-[10px] border border-primary/20 bg-black/45 px-4 font-semibold text-white outline-none" value={barberId} onChange={(event) => setBarberId(event.target.value)}>
                {barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.name}</option>)}
              </select>
            </label>
          ) : null}
          <label className="grid gap-2">
            <span className="font-bold uppercase text-white/70">Data do atendimento</span>
            <span className="flex min-h-12 items-center gap-2 rounded-[10px] border border-primary/20 bg-black/45 px-4">
              <CalendarDays className="h-4 w-4 text-primary" />
              <input className="w-full bg-transparent font-semibold text-white outline-none" type="date" max={todayDateInput()} value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} />
            </span>
          </label>
        </div>

        {subscriberMode ? (
          <div className="grid gap-3 rounded-[12px] border border-primary/20 bg-black/25 p-4">
            <label className="grid gap-2">
              <span className="font-bold uppercase text-white/70">Buscar assinante ativo</span>
              <span className="flex min-h-12 items-center gap-2 rounded-[10px] border border-primary/20 bg-black/45 px-4">
                <Search className="h-4 w-4 text-primary" />
                <Input value={subscriberSearch} onChange={(event) => setSubscriberSearch(event.target.value)} placeholder="Nome ou telefone" className="border-0 bg-transparent p-0" />
              </span>
            </label>
            <div className="grid max-h-56 gap-2 overflow-y-auto pr-1">
              {filteredSubscribers.map((subscriber) => (
                <button key={subscriber.id} type="button" onClick={() => setSubscriptionId(subscriber.id)} className={cn("rounded-[10px] border p-3 text-left transition", subscriptionId === subscriber.id ? "border-primary bg-primary text-black" : "border-white/10 bg-black/30 text-white hover:border-primary/50")}>
                  <p className="font-black uppercase">{subscriber.name}</p>
                  <p className="text-xs opacity-70">{subscriber.plan} - {subscriber.phone}</p>
                </button>
              ))}
              {filteredSubscribers.length === 0 ? <p className="rounded-[10px] border border-white/10 bg-black/30 p-3 text-sm text-white/55">Nenhum assinante ativo encontrado.</p> : null}
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="font-bold uppercase text-white/70">Cliente</span>
              <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Opcional" />
            </label>
            <label className="grid gap-2">
              <span className="font-bold uppercase text-white/70">Observacoes</span>
              <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Opcional" />
            </label>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => {
            const selected = selectedServiceIds.includes(service.id);
            const covered = subscriberMode && coveredIds.has(service.id);
            return (
              <div key={service.id} className={cn("rounded-[10px] border p-4 transition", selected ? "border-primary bg-primary/10" : "border-white/10 bg-black/30")}>
                <button type="button" onClick={() => toggleService(service.id)} className="flex w-full items-start gap-3 text-left">
                  <Scissors className={cn("mt-1 h-4 w-4", selected ? "text-primary" : "text-white/45")} />
                  <span className="min-w-0">
                    <span className="block font-black uppercase">{service.name}</span>
                    <span className="mt-1 block text-sm font-bold text-primary">{covered ? "Coberto pelo plano" : formatCurrency(service.price)}</span>
                  </span>
                </button>
                {selected && !subscriberMode ? (
                  <label className="mt-3 grid gap-1 text-xs font-bold uppercase text-white/60">
                    Multiplicador
                    <input
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={quantities[service.id] ?? "1"}
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) => updateQuantity(service.id, event.target.value)}
                      className="min-h-10 rounded-[8px] border border-primary/20 bg-black/45 px-3 font-black text-white outline-none"
                    />
                  </label>
                ) : null}
              </div>
            );
          })}
        </div>

        {totals.highQuantity ? (
          <label className="flex items-start gap-3 rounded-[10px] border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">
            <input type="checkbox" className="mt-1" checked={highQuantityConfirmed} onChange={(event) => setHighQuantityConfirmed(event.target.checked)} />
            Confirmo que a quantidade acima de 50 esta correta.
          </label>
        ) : null}

        <div className="flex flex-col justify-between gap-3 rounded-[10px] border border-white/10 bg-black/30 p-4 sm:flex-row sm:items-center">
          <div className="grid gap-1 text-sm uppercase text-white/55">
            <span>Valor de tabela <strong className="ml-2 text-white">{formatCurrency(totals.list)}</strong></span>
            <span>Total cobrado <strong className="ml-2 text-xl text-primary">{formatCurrency(totals.charged)}</strong></span>
            <span>Comissao estimada <strong className="ml-2 text-primary">{formatCurrency(totals.commission)}</strong></span>
          </div>
          <Button type="button" onClick={submit} disabled={isLoading}>
            <UserCheck className="h-4 w-4" />
            {isLoading ? "Salvando..." : submitLabel ?? (mode === "edit" ? "Salvar atendimento" : "Registrar atendimento")}
          </Button>
        </div>
        {feedback ? <p className="rounded-[8px] border border-primary/50 p-3 text-sm text-primary">{feedback}</p> : null}
      </div>
    </section>
  );
}
