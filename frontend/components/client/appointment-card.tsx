"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Clock, MessageSquare, Scissors, User, X } from "lucide-react";
import { Badge } from "@/components/client/badge";
import { Button } from "@/components/ui/button";
import type { Appointment } from "@/types/client-area";
import { cn } from "@/utils/cn";

type AppointmentCardProps = {
  appointment: Appointment;
  canManage?: boolean;
};

const availableTimes = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

function buildDates() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return {
      value: date.toISOString().slice(0, 10),
      label: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date).replace(".", "")
    };
  });
}

export function AppointmentCard({ appointment, canManage = true }: AppointmentCardProps) {
  const router = useRouter();
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(() => buildDates()[0].value);
  const [rescheduleTime, setRescheduleTime] = useState(availableTimes[0]);
  const dates = buildDates();

  async function cancelAppointment() {
    if (!window.confirm("Deseja cancelar este agendamento?")) return;

    setActionError(null);
    setIsCancelling(true);
    try {
      const response = await fetch("/api/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", appointmentId: appointment.id })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setActionError(payload?.message ?? "Não foi possível cancelar o agendamento.");
        return;
      }

      setIsDetailsOpen(false);
      router.refresh();
    } catch {
      setActionError("Falha de conexão ao cancelar o agendamento.");
    } finally {
      setIsCancelling(false);
    }
  }

  function rescheduleAppointment() {
    setActionError(null);
    setIsDetailsOpen(false);
    setIsRescheduleOpen(true);
  }

  async function confirmReschedule() {
    setActionError(null);
    setIsRescheduling(true);
    try {
      const response = await fetch("/api/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reschedule",
          appointmentId: appointment.id,
          date: rescheduleDate,
          time: rescheduleTime
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setActionError(payload?.message ?? "Não foi possível reagendar o atendimento.");
        return;
      }

      setIsRescheduleOpen(false);
      router.refresh();
    } catch {
      setActionError("Falha de conexão ao reagendar o atendimento.");
    } finally {
      setIsRescheduling(false);
    }
  }

  return (
    <>
      <article className="overflow-hidden rounded-[8px] border border-white/14 bg-card">
        <div className="p-5">
          <div className="mb-5 flex items-center justify-between gap-4">
            <Badge tone={appointment.status === "Confirmado" ? "green" : "white"}>{appointment.status}</Badge>
            <Button variant="ghost" className="h-10 px-3 text-xs" onClick={() => setIsDetailsOpen(true)}>
              Ver detalhes
            </Button>
          </div>
          <div className="grid gap-3 text-sm text-white/72">
            <p className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-primary" />
              {appointment.date}
            </p>
            <p className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-primary" />
              {appointment.time}
            </p>
            <p className="flex items-center gap-3">
              <User className="h-5 w-5 text-primary" />
              {appointment.barber}
            </p>
            <p className="flex items-center gap-3">
              <Scissors className="h-5 w-5 text-primary" />
              {appointment.service}
            </p>
          </div>
        </div>
      </article>

      {isDetailsOpen ? (
        <div className="fixed inset-0 z-[70] grid place-items-end bg-black/78 px-4 py-4 backdrop-blur-sm md:place-items-center">
          <section className="w-full max-w-[580px] overflow-hidden rounded-[8px] border border-white/16 bg-[#070707] shadow-panel">
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Detalhes do agendamento</p>
                <h2 className="mt-1 text-lg font-black uppercase">Reserva #{appointment.id.slice(0, 8)}</h2>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsDetailsOpen(false)} aria-label="Fechar detalhes">
                <X className="h-6 w-6" />
              </Button>
            </div>

            <div className="max-h-[76vh] overflow-y-auto p-4">
              <div className="mb-4 flex items-center justify-between gap-4 rounded-[8px] border border-white/10 bg-white/[0.035] p-3">
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-white/45">Status</span>
                <Badge tone={appointment.status === "Confirmado" ? "green" : "white"}>{appointment.status}</Badge>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <DetailRow icon={User} label="Barbeiro" value={appointment.barber} />
                <DetailRow icon={Scissors} label="Serviço" value={appointment.service} />
                <DetailRow icon={CalendarDays} label="Data" value={appointment.date} />
                <DetailRow icon={Clock} label="Horário" value={appointment.time} />
                <DetailRow icon={Clock} label="Duração" value={appointment.duration || "Não informado"} />
              </div>

              {appointment.observations ? (
                <div className="mt-4 rounded-[8px] border border-white/10 bg-white/[0.035] p-4">
                  <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.12em] text-white/45">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    Observações
                  </p>
                  <p className="mt-2 font-bold text-white">{appointment.observations}</p>
                </div>
              ) : null}

              {actionError ? <p className="mt-5 rounded-[8px] border border-primary/50 p-3 text-sm text-primary">{actionError}</p> : null}
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {canManage ? <Button variant="outline" onClick={cancelAppointment} disabled={isCancelling}>{isCancelling ? "Cancelando..." : "Cancelar Agendamento"}</Button> : null}
                {canManage ? <Button onClick={rescheduleAppointment}>Reagendar</Button> : null}
                <Button variant="outline" onClick={() => setIsDetailsOpen(false)} disabled={isCancelling} className={canManage ? "" : "sm:col-span-3"}>
                  Fechar
                </Button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {isRescheduleOpen ? (
        <div className="fixed inset-0 z-[75] grid place-items-end bg-black/78 px-4 py-4 backdrop-blur-sm md:place-items-center">
          <section className="w-full max-w-xl rounded-[8px] border border-white/16 bg-[#070707] p-5 shadow-panel">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Reagendar</p>
            <h2 className="mt-2 text-xl font-black uppercase">{appointment.service}</h2>
            <p className="mt-2 text-white/60">Barbeiro: {appointment.barber}</p>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {dates.map((item) => (
                <button key={item.value} type="button" onClick={() => setRescheduleDate(item.value)} className={cn("rounded-[8px] border px-4 py-4 text-center font-black uppercase transition", rescheduleDate === item.value ? "border-primary bg-primary text-black" : "border-white/14 bg-black/40 text-white")}>
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {availableTimes.map((item) => (
                <button key={item} type="button" onClick={() => setRescheduleTime(item)} className={cn("rounded-[8px] border px-4 py-4 font-black transition", rescheduleTime === item ? "border-primary bg-primary text-black" : "border-white/14 bg-card text-white")}>
                  {item}
                </button>
              ))}
            </div>

            {actionError ? <p className="mt-5 rounded-[8px] border border-primary/50 p-3 text-sm text-primary">{actionError}</p> : null}
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <Button variant="outline" onClick={() => setIsRescheduleOpen(false)} disabled={isRescheduling}>Fechar</Button>
              <Button onClick={confirmReschedule} disabled={isRescheduling}>{isRescheduling ? "Salvando..." : "Confirmar"}</Button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-white/[0.035] p-3">
      <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.12em] text-white/45">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </p>
      <p className="mt-2 font-bold text-white">{value}</p>
    </div>
  );
}
