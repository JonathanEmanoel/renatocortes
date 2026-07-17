import { redirect } from "next/navigation";
import { formatDatePtBr, formatTimePtBr } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedClient } from "@/lib/server/auth";
import { AppointmentsContent } from "./appointments-content";
import type { Appointment } from "@/types/client-area";

const statusLabel: Record<string, Appointment["status"]> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  COMPLETED: "Concluido",
  CANCELED: "Cancelado",
  NO_SHOW: "Cancelado"
};

export default async function MyAppointmentsPage() {
  const session = await getAuthenticatedClient();

  if (!session) {
    redirect("/login");
  }

  const records = await prisma.appointment.findMany({
    where: {
      clientId: session.client.id,
      deletedAt: null
    },
    include: {
      barber: { include: { user: true } },
      service: true
    },
    orderBy: [{ dataHora: "asc" }]
  });

  const now = new Date();
  const appointments = records
    .map((appointment) => ({
      id: appointment.id,
      date: formatDatePtBr(appointment.dataHora),
      time: formatTimePtBr(appointment.dataHora),
      barber: appointment.barber.user.name,
      service: appointment.service.name,
      status: statusLabel[appointment.status] ?? "Pendente",
      observations: appointment.observacoes ?? undefined,
      isUpcoming: appointment.dataHora >= now && ["PENDING", "CONFIRMED"].includes(appointment.status),
      duration: `${appointment.service.duration} min`,
      serviceId: appointment.serviceId,
      barberId: appointment.barberId
    }))
    .sort((a, b) => Number(b.isUpcoming) - Number(a.isUpcoming));

  return <AppointmentsContent appointments={appointments} />;
}
