"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppointmentCard } from "@/components/client/appointment-card";
import { ClientShell } from "@/components/client/client-shell";
import { SectionTitle } from "@/components/client/section-title";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import type { Appointment } from "@/types/client-area";

type AppointmentItem = Appointment & {
  isUpcoming: boolean;
  duration: string;
  serviceId: string;
  barberId: string;
};

type SchedulingDate = {
  value: string;
  label: string;
};

const availableTimes = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

function buildDates(): SchedulingDate[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return {
      value: date.toISOString().slice(0, 10),
      label: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date).replace(".", "")
    };
  });
}

export function AppointmentsContent({ appointments }: { appointments: AppointmentItem[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"upcoming" | "history">("upcoming");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<AppointmentItem | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(buildDates()[0].value);
  const [rescheduleTime, setRescheduleTime] = useState(availableTimes[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dates = useMemo(() => buildDates(), []);
  const visible = tab === "upcoming" ? appointments.filter((appointment) => appointment.isUpcoming) : appointments.filter((appointment) => !appointment.isUpcoming);

  async function cancelAppointment(appointmentId: string) {
    const confirmed = window.confirm("Deseja cancelar este agendamento?");
    if (!confirmed) return;

    setFeedback(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", appointmentId })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setFeedback(payload?.message ?? "Erro ao cancelar agendamento.");
        return;
      }

      setFeedback("Agendamento cancelado.");
      router.refresh();
    } catch {
      setFeedback("Falha de conexão ao cancelar agendamento.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function confirmReschedule() {
    if (!rescheduling) return;

    setFeedback(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reschedule",
          appointmentId: rescheduling.id,
          date: rescheduleDate,
          time: rescheduleTime
        })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setFeedback(payload?.message ?? "Erro ao reagendar.");
        return;
      }

      setFeedback("Agendamento reagendado.");
      setRescheduling(null);
      router.refresh();
    } catch {
      setFeedback("Falha de conexão ao reagendar.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ClientShell>
      <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary">Agenda</p>
      <h1 className="mt-3 text-3xl font-black uppercase md:text-5xl">Meus Agendamentos</h1>

      <div className="mt-8 grid grid-cols-2 gap-3 rounded-[8px] border border-white/14 bg-card p-2">
        <TabButton active={tab === "upcoming"} onClick={() => setTab("upcoming")}>Próximos</TabButton>
        <TabButton active={tab === "history"} onClick={() => setTab("history")}>Histórico</TabButton>
      </div>

      <section className="mt-9">
        <SectionTitle title={tab === "upcoming" ? "Próximos" : "Histórico"} />
        {feedback ? <p className="mb-5 rounded-[8px] border border-primary/50 p-4 text-primary">{feedback}</p> : null}
        <div className="grid gap-5 md:grid-cols-2">
          {visible.map((appointment) => (
            <div key={appointment.id}>
              <AppointmentCard appointment={appointment} />
              {appointment.isUpcoming ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button variant="outline" className="h-11 px-2 text-xs" disabled={isSubmitting} onClick={() => cancelAppointment(appointment.id)}>
                    Cancelar
                  </Button>
                  <Button className="h-11 px-2 text-xs" disabled={isSubmitting} onClick={() => setRescheduling(appointment)}>
                    Reagendar
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {rescheduling ? (
        <div className="fixed inset-0 z-[75] grid place-items-end bg-black/78 px-4 py-4 backdrop-blur-sm md:place-items-center">
          <section className="w-full max-w-xl rounded-[8px] border border-white/16 bg-[#070707] p-5 shadow-panel">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Reagendar</p>
            <h2 className="mt-2 text-xl font-black uppercase">{rescheduling.service}</h2>
            <p className="mt-2 text-white/60">Barbeiro: {rescheduling.barber}</p>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {dates.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setRescheduleDate(item.value)}
                  className={cn(
                    "rounded-[8px] border px-4 py-4 text-center font-black uppercase transition",
                    rescheduleDate === item.value ? "border-primary bg-primary text-white" : "border-white/14 bg-black/40 text-white"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {availableTimes.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setRescheduleTime(item)}
                  className={cn(
                    "rounded-[8px] border px-4 py-4 font-black transition",
                    rescheduleTime === item ? "border-primary bg-primary text-white" : "border-white/14 bg-card text-white"
                  )}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <Button variant="outline" onClick={() => setRescheduling(null)} disabled={isSubmitting}>
                Fechar
              </Button>
              <Button onClick={confirmReschedule} disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : "Confirmar"}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </ClientShell>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[8px] px-4 py-3 text-sm font-black uppercase transition",
        active ? "bg-primary text-white" : "text-white/60 hover:text-white"
      )}
    >
      {children}
    </button>
  );
}
