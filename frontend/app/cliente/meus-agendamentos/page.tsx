"use client";

import { useState } from "react";
import { AppointmentCard } from "@/components/client/appointment-card";
import { ClientShell } from "@/components/client/client-shell";
import { SectionTitle } from "@/components/client/section-title";
import { Button } from "@/components/ui/button";
import { appointments } from "@/utils/client-mocks";
import { cn } from "@/utils/cn";

export default function MyAppointmentsPage() {
  const [tab, setTab] = useState<"upcoming" | "history">("upcoming");
  const visible =
    tab === "upcoming"
      ? appointments.filter((appointment) => appointment.status === "Confirmado")
      : appointments.filter((appointment) => appointment.status !== "Confirmado");

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
        <div className="grid gap-5 md:grid-cols-2">
          {visible.map((appointment) => (
            <div key={appointment.id}>
              <AppointmentCard appointment={appointment} />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-11 px-2 text-xs">Cancelar</Button>
                <Button className="h-11 px-2 text-xs">Reagendar</Button>
              </div>
            </div>
          ))}
        </div>
      </section>
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
