"use client";

import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock } from "lucide-react";
import { BarberCard } from "@/components/client/barber-card";
import { ClientShell } from "@/components/client/client-shell";
import { SectionTitle } from "@/components/client/section-title";
import { ServiceCard } from "@/components/client/service-card";
import { Button } from "@/components/ui/button";
import { availableTimes, barbers, services } from "@/utils/client-mocks";
import { cn } from "@/utils/cn";

const dates = ["16 Jul", "17 Jul", "18 Jul", "19 Jul", "20 Jul", "21 Jul", "22 Jul"];
const steps = ["Serviço", "Barbeiro", "Data", "Horário", "Resumo"];

export default function SchedulingPage() {
  const [step, setStep] = useState(0);
  const [serviceId, setServiceId] = useState(services[0].id);
  const [barberId, setBarberId] = useState(barbers[0].id);
  const [date, setDate] = useState(dates[2]);
  const [time, setTime] = useState(availableTimes[2]);

  const selected = useMemo(
    () => ({
      service: services.find((service) => service.id === serviceId) ?? services[0],
      barber: barbers.find((barber) => barber.id === barberId) ?? barbers[0]
    }),
    [serviceId, barberId]
  );

  return (
    <ClientShell>
      <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary">Agendamento</p>
      <h1 className="mt-3 text-3xl font-black uppercase md:text-5xl">Agendar horário</h1>

      <div className="mt-8 grid grid-cols-5 gap-2">
        {steps.map((item, index) => (
          <button
            key={item}
            type="button"
            onClick={() => setStep(index)}
            className={cn(
              "rounded-[8px] border px-2 py-3 text-[10px] font-black uppercase transition md:text-sm",
              step === index ? "border-primary bg-primary text-white" : "border-white/14 bg-card text-white/62"
            )}
          >
            {item}
          </button>
        ))}
      </div>

      <section className="mt-9">
        {step === 0 ? (
          <>
            <SectionTitle title="Selecionar Serviço" />
            <div className="grid gap-4 md:grid-cols-3">
              {services.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  selected={service.id === serviceId}
                  onClick={() => setServiceId(service.id)}
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
                <p className="font-black uppercase">Julho 2026</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-7">
                {dates.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setDate(item)}
                    className={cn(
                      "rounded-[8px] border px-4 py-5 text-center font-black uppercase transition",
                      date === item ? "border-primary bg-primary text-white" : "border-white/14 bg-black/40 text-white"
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <SectionTitle title="Selecionar Horário" />
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {availableTimes.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTime(item)}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-[8px] border px-4 py-4 font-black transition",
                    time === item ? "border-primary bg-primary text-white" : "border-white/14 bg-card text-white"
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
                <SummaryRow label="Serviço" value={selected.service.name} />
                <SummaryRow label="Barbeiro" value={selected.barber.name} />
                <SummaryRow label="Data" value={date} />
                <SummaryRow label="Horário" value={time} />
              </div>
              <Button className="mt-8 w-full">Confirmar Agendamento</Button>
            </div>
          </>
        ) : null}
      </section>

      <div className="mt-8 flex justify-between gap-4">
        <Button variant="outline" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>
          Voltar
        </Button>
        <Button disabled={step === steps.length - 1} onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))}>
          Próximo
        </Button>
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
