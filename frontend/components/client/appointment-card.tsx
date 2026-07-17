"use client";

import { useState } from "react";
import { CalendarDays, Clock, MessageSquare, Scissors, User, X } from "lucide-react";
import { Badge } from "@/components/client/badge";
import { Button } from "@/components/ui/button";
import type { Appointment } from "@/types/client-area";

type AppointmentCardProps = {
  appointment: Appointment;
  detailed?: boolean;
};

export function AppointmentCard({ appointment, detailed = false }: AppointmentCardProps) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  return (
    <>
      <article className="overflow-hidden rounded-[8px] border border-white/14 bg-card">
        {detailed ? (
          <div className="grid aspect-[16/7] place-items-center bg-gradient-to-br from-[#1b120d] via-black to-[#090909]">
            <Scissors className="h-14 w-14 text-primary" />
          </div>
        ) : null}
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

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <Button variant="outline">Cancelar Agendamento</Button>
                <Button>Reagendar</Button>
                <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>
                  Fechar
                </Button>
              </div>
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
