"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format";

type ServiceOption = {
  id: string;
  name: string;
  price: number;
};

type BarberOption = {
  id: string;
  name: string;
};

export function ManualServiceForm({ services, barbers, defaultBarberId, canChooseBarber }: { services: ServiceOption[]; barbers: BarberOption[]; defaultBarberId?: string; canChooseBarber?: boolean }) {
  const router = useRouter();
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [barberId, setBarberId] = useState(defaultBarberId ?? barbers[0]?.id ?? "");
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const total = useMemo(
    () => serviceIds.reduce((sum, id) => sum + (services.find((service) => service.id === id)?.price ?? 0), 0),
    [serviceIds, services]
  );

  function toggleService(id: string) {
    setServiceIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function submit() {
    setFeedback(null);
    if (serviceIds.length === 0) {
      setFeedback("Selecione pelo menos um servico.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/internal/manual-services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barberId, serviceIds, customerName: customerName || undefined, notes: notes || undefined })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setFeedback(payload?.message ?? "Nao foi possivel registrar.");
        return;
      }
      setServiceIds([]);
      setCustomerName("");
      setNotes("");
      setFeedback("Atendimento registrado com sucesso.");
      router.refresh();
    } catch {
      setFeedback("Falha de conexao.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
      <h2 className="text-xl font-black uppercase">Atendimento avulso</h2>
      <div className="mt-5 grid gap-5">
        {canChooseBarber ? (
          <label className="grid gap-2">
            <span className="font-bold uppercase text-white/70">Barbeiro</span>
            <select className="min-h-12 rounded-[10px] border border-primary/20 bg-black/45 px-4 font-semibold text-white outline-none" value={barberId} onChange={(event) => setBarberId(event.target.value)}>
              {barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.name}</option>)}
            </select>
          </label>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <button
              key={service.id}
              type="button"
              onClick={() => toggleService(service.id)}
              className={`rounded-[10px] border p-4 text-left transition ${serviceIds.includes(service.id) ? "border-primary bg-primary text-black" : "border-white/10 bg-black/30 text-white"}`}
            >
              <p className="font-black uppercase">{service.name}</p>
              <p className="mt-1 text-sm font-bold">{formatCurrency(service.price)}</p>
            </button>
          ))}
        </div>

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

        <div className="flex flex-col justify-between gap-3 rounded-[10px] border border-white/10 bg-black/30 p-4 sm:flex-row sm:items-center">
          <p className="text-sm uppercase text-white/55">Total <strong className="ml-2 text-xl text-primary">{formatCurrency(total)}</strong></p>
          <Button type="button" onClick={submit} disabled={isLoading}>{isLoading ? "Registrando..." : "Registrar atendimento"}</Button>
        </div>
        {feedback ? <p className="rounded-[8px] border border-primary/50 p-3 text-sm text-primary">{feedback}</p> : null}
      </div>
    </section>
  );
}
