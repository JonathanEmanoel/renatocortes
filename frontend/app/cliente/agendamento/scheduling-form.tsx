"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, CheckCircle2, Clock, Scissors } from "lucide-react";
import { BarberCard } from "@/components/client/barber-card";
import { ClientShell } from "@/components/client/client-shell";
import { SectionTitle } from "@/components/client/section-title";
import { ServiceCard } from "@/components/client/service-card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/utils/cn";
import type { Barber, Service } from "@/types/client-area";

type SchedulingDate = {
  value: string;
  label: string;
  monthLabel: string;
};

type SchedulingFormProps = {
  services: Omit<Service, "icon">[];
  barbers: Barber[];
  dates: SchedulingDate[];
  availableTimes: string[];
  availabilityByBarber: Record<string, { weekDay: number; startTime: string; endTime: string }[]>;
};

const steps = ["Servico", "Barbeiro", "Data", "Horario", "Resumo"];

function minutesFromTime(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function weekDayFromDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

export function SchedulingForm({ services, barbers, dates, availableTimes, availabilityByBarber }: SchedulingFormProps) {
  const [step, setStep] = useState(0);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [barberId, setBarberId] = useState(barbers[0]?.id ?? "");
  const [date, setDate] = useState(dates[0]?.value ?? "");
  const [time, setTime] = useState(availableTimes[0] ?? "");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selected = useMemo(() => {
    const selectedServices = serviceIds
      .map((id) => services.find((service) => service.id === id))
      .filter((service): service is Omit<Service, "icon"> => Boolean(service));
    return {
      services: selectedServices,
      barber: barbers.find((barber) => barber.id === barberId) ?? barbers[0],
      date: dates.find((item) => item.value === date) ?? dates[0],
      totalDuration: selectedServices.reduce((sum, service) => sum + (service.durationMinutes ?? 0), 0),
      totalPrice: selectedServices.reduce((sum, service) => sum + (service.coveredBySubscription ? 0 : service.priceValue ?? 0), 0),
      coveredCount: selectedServices.filter((service) => service.coveredBySubscription).length
    };
  }, [services, serviceIds, barbers, barberId, dates, date]);
  const selectedAvailability = useMemo(() => availabilityByBarber[barberId] ?? [], [availabilityByBarber, barberId]);
  const availableDates = useMemo(() => new Set(selectedAvailability.map((item) => item.weekDay)), [selectedAvailability]);
  const filteredTimes = useMemo(() => {
    const dayAvailability = selectedAvailability.find((item) => item.weekDay === weekDayFromDate(date));
    if (!dayAvailability) return [];
    const totalDuration = Math.max(selected.totalDuration, 30);
    const start = minutesFromTime(dayAvailability.startTime);
    const end = minutesFromTime(dayAvailability.endTime);
    return availableTimes.filter((item) => {
      const timeStart = minutesFromTime(item);
      return timeStart >= start && timeStart + totalDuration <= end;
    });
  }, [availableTimes, date, selected.totalDuration, selectedAvailability]);

  useEffect(() => {
    if (!availableDates.has(weekDayFromDate(date))) {
      const nextDate = dates.find((item) => availableDates.has(weekDayFromDate(item.value)));
      if (nextDate) setDate(nextDate.value);
    }
  }, [availableDates, date, dates]);

  useEffect(() => {
    if (filteredTimes.length > 0 && !filteredTimes.includes(time)) {
      setTime(filteredTimes[0]);
    }
  }, [filteredTimes, time]);

  function toggleService(serviceId: string) {
    setServiceIds((current) => {
      if (current.includes(serviceId)) {
        return current.filter((id) => id !== serviceId);
      }

      return [...current, serviceId];
    });
  }

  async function confirmAppointment() {
    if (selected.services.length === 0) {
      setFeedback("Selecione pelo menos um servico.");
      setStep(0);
      return;
    }
    if (!filteredTimes.includes(time)) {
      setFeedback("Escolha um horario disponivel para este barbeiro.");
      setStep(3);
      return;
    }

    setFeedback(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceIds,
          barberId,
          date,
          time
        })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setFeedback(payload?.message ?? "Nao foi possivel criar o agendamento.");
        return;
      }

      if (payload?.whatsAppUrl) {
        window.open(payload.whatsAppUrl, "_blank", "noopener,noreferrer");
      } else {
        setFeedback("O agendamento foi criado, mas nao foi possivel abrir o WhatsApp.");
      }

      if (payload?.googleCalendarAuthUrl) {
        window.open(payload.googleCalendarAuthUrl, "_blank", "noopener,noreferrer");
      }

      setFeedback("Agendamento criado. Confirme os detalhes pelo WhatsApp.");
    } catch {
      setFeedback("Nao foi possivel criar o agendamento agora.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ClientShell>
      <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary">Agendamento</p>
      <div className="mt-3 flex items-center gap-3">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            className="grid h-11 w-11 place-items-center rounded-full border border-primary/30 bg-black/35 text-primary transition hover:bg-primary hover:text-black"
            aria-label="Voltar etapa"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : null}
        <h1 className="text-3xl font-black uppercase md:text-5xl">Agendar horario</h1>
      </div>

      <div className="mt-8 grid grid-cols-5 gap-2">
        {steps.map((item, index) => (
          <button
            key={item}
            type="button"
            onClick={() => setStep(index)}
            className={cn(
              "rounded-[8px] border px-2 py-3 text-[10px] font-black uppercase transition md:text-sm",
              step === index ? "border-primary bg-primary text-black" : "border-white/14 bg-card text-white/62"
            )}
          >
            {item}
          </button>
        ))}
      </div>

      <section className="mt-9 pb-28 md:pb-8">
        {step === 0 ? (
          <>
            <SectionTitle title="Selecionar Servicos" />
            <div className="grid max-h-[62vh] gap-4 overflow-y-auto pr-1 md:max-h-none md:grid-cols-3 md:overflow-visible md:pr-0">
              {services.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={{ ...service, icon: Scissors }}
                  selected={serviceIds.includes(service.id)}
                  onClick={() => toggleService(service.id)}
                />
              ))}
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <SectionTitle title="Selecionar Barbeiro" />
            <div className="grid gap-4 md:grid-cols-3">
              {barbers.map((barber) => (
                <BarberCard
                  key={barber.id}
                  barber={barber}
                  selected={barber.id === barberId}
                  onClick={() => setBarberId(barber.id)}
                />
              ))}
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <SectionTitle title="Selecionar Data" />
            <div className="rounded-[8px] border border-white/14 bg-card p-5">
              <div className="mb-5 flex items-center gap-3">
                <CalendarDays className="h-6 w-6 text-primary" />
                <p className="font-black uppercase">{selected.date?.monthLabel ?? "Datas disponiveis"}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-7">
                {dates.map((item) => {
                  const isAvailable = availableDates.has(weekDayFromDate(item.value));
                  return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => isAvailable && setDate(item.value)}
                    disabled={!isAvailable}
                    className={cn(
                      "rounded-[8px] border px-4 py-5 text-center font-black uppercase transition",
                      date === item.value
                        ? "border-primary bg-primary text-black"
                        : isAvailable
                          ? "border-white/14 bg-black/40 text-white"
                          : "cursor-not-allowed border-white/10 bg-black/20 text-white/25"
                    )}
                  >
                    {item.label}
                  </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <SectionTitle title="Selecionar Horario" />
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {filteredTimes.length === 0 ? (
                <p className="col-span-full rounded-[8px] border border-primary/30 bg-primary/10 p-4 text-sm font-bold text-primary">
                  O barbeiro nao atende nesta data ou nao ha horario disponivel para a duracao selecionada.
                </p>
              ) : null}
              {filteredTimes.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTime(item)}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-[8px] border px-4 py-4 font-black transition",
                    time === item ? "border-primary bg-primary text-black" : "border-white/14 bg-card text-white"
                  )}
                >
                  <Clock className="h-4 w-4" />
                  {item}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <SectionTitle title="Resumo" />
            <div className="rounded-[8px] border border-white/14 bg-card p-6">
              <CheckCircle2 className="h-10 w-10 text-primary" />
              <div className="mt-6 grid gap-4 text-white/75">
                <SummaryRow
                  label="Servicos"
                  value={selected.services.length ? selected.services.map((service) => service.name).join(" + ") : "Nao informado"}
                />
                <SummaryRow label="Duracao" value={`${selected.totalDuration} min`} />
                <SummaryRow
                  label="Valor"
                  value={
                    selected.coveredCount === selected.services.length && selected.services.length > 0
                      ? "Coberto pelo plano"
                      : selected.coveredCount > 0
                        ? `${formatCurrency(selected.totalPrice)} + plano`
                        : formatCurrency(selected.totalPrice)
                  }
                />
                <SummaryRow label="Barbeiro" value={selected.barber?.name ?? "Nao informado"} />
                <SummaryRow label="Data" value={selected.date?.label ?? "Nao informado"} />
                <SummaryRow label="Horario" value={time} />
              </div>
              {feedback ? <p className="mt-6 rounded-[8px] border border-primary/50 p-4 text-primary">{feedback}</p> : null}
              <Button className="mt-8 w-full" onClick={confirmAppointment} disabled={isSubmitting}>
                {isSubmitting ? "Confirmando..." : "Confirmar Agendamento"}
              </Button>
            </div>
          </>
        ) : null}
      </section>

      <div className="fixed inset-x-0 bottom-20 z-30 border-t border-primary/20 bg-[#0F0F0F]/94 px-5 py-4 shadow-[0_-14px_34px_rgba(0,0,0,0.38)] backdrop-blur md:sticky md:bottom-4 md:mt-8 md:rounded-[12px] md:border md:bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="min-w-0 text-xs font-bold uppercase tracking-[0.1em] text-white/55">
            <span className="block truncate text-white">{selected.services.length} servico(s)</span>
            <span>{selected.totalDuration} min - {formatCurrency(selected.totalPrice)}</span>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>
              Voltar
            </Button>
            <Button disabled={step === steps.length - 1 || selected.services.length === 0} onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))}>
              Proximo
            </Button>
          </div>
        </div>
      </div>
    </ClientShell>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
      <span className="text-white/55">{label}</span>
      <strong className="text-right text-white">{value}</strong>
    </div>
  );
}
