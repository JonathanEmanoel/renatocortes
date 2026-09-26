export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { formatDatePtBr, formatTimePtBr } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedClient } from "@/lib/server/auth";
import { AppointmentsContent } from "./appointments-content";
import type { Appointment } from "@/types/client-area";

const statusLabel: Record<string, Appointment["status"]> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  REJECTED: "Recusado",
  COMPLETED: "Concluido",
  CANCELED: "Cancelado",
  NO_SHOW: "Cancelado"
};

export default async function MyAppointmentsPage() {
  const session = await getAuthenticatedClient();

  if (!session) {
    redirect("/login");
  }

  const [records, manualRecords] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        clientId: session.client.id,
        deletedAt: null
      },
      select: {
        id: true,
        serviceId: true,
        barberId: true,
        dataHora: true,
        status: true,
        observacoes: true,
        barber: { select: { user: { select: { name: true } } } },
        service: { select: { name: true, duration: true } },
        services: { select: { duration: true, service: { select: { name: true } } } }
      },
      orderBy: [{ dataHora: "asc" }]
    }),
    prisma.manualService.findMany({
      where: {
        clientId: session.client.id,
        deletedAt: null
      },
      include: {
        barber: { include: { user: true } },
        items: { include: { service: true } }
      },
      orderBy: [{ serviceDate: "asc" }]
    })
  ]);

  const now = new Date();
  const siteAppointments = records
    .map((appointment) => ({
      id: appointment.id,
      date: formatDatePtBr(appointment.dataHora),
      time: formatTimePtBr(appointment.dataHora),
      barber: appointment.barber.user.name,
      service: appointment.services.length
        ? appointment.services.map((item) => item.service.name).join(" + ")
        : appointment.service.name,
      status: statusLabel[appointment.status] ?? "Pendente",
      observations: appointment.observacoes ?? undefined,
      isUpcoming: appointment.dataHora >= now && ["PENDING", "CONFIRMED"].includes(appointment.status),
      duration: `${
        appointment.services.length
          ? appointment.services.reduce((sum, item) => sum + item.duration, 0)
          : appointment.service.duration
      } min`,
      serviceId: appointment.serviceId,
      barberId: appointment.barberId
    }));

  const manualAppointments = manualRecords.map((appointment) => ({
    id: `manual-${appointment.id}`,
    date: formatDatePtBr(appointment.serviceDate),
    time: formatTimePtBr(appointment.serviceDate),
    barber: appointment.barber.user.name,
    service: appointment.items.map((item) => `${item.service.name}${item.coveredBySubscription ? " (plano)" : ""}`).join(" + "),
    status: "Concluido" as Appointment["status"],
    observations: appointment.notes ?? undefined,
    isUpcoming: false,
    duration: `${appointment.items.reduce((sum, item) => sum + item.duration * item.quantity, 0)} min`,
    serviceId: appointment.items[0]?.serviceId ?? "",
    barberId: appointment.barberId
  }));

  const appointments = [...siteAppointments, ...manualAppointments]
    .sort((a, b) => Number(b.isUpcoming) - Number(a.isUpcoming));

  return <AppointmentsContent appointments={appointments} />;
}
