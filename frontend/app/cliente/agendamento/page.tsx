export const dynamic = "force-dynamic";
export const revalidate = 0;

import { prisma } from "@/lib/prisma";
import { formatCurrency, formatShortDatePtBr } from "@/lib/format";
import { addDaysInput, startOfSaoPauloDay, todayDateInput } from "@/lib/server/date-periods";
import { SchedulingForm } from "./scheduling-form";
import type { Barber } from "@/types/client-area";
import { getAuthenticatedClient } from "@/lib/server/auth";

const serviceOrder = [
  "Corte Normal",
  "Corte Degradê",
  "Corte Degradê Navalhado",
  "Corte de Criança (1 a 10 anos)",
  "Corte Todo na Tesoura",
  "Barba",
  "Só os Cantinhos",
  "Sobrancelha",
  "Alisamento",
  "Luzes",
  "Platinado"
];

function buildDates() {
  const formatter = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
  const weekDayFormatter = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });
  const today = todayDateInput();
  return Array.from({ length: 7 }, (_, index) => {
    const value = addDaysInput(today, index + 1);
    const date = startOfSaoPauloDay(value);
    const weekDay = weekDayFormatter.format(date).replace(".", "").toUpperCase();
    return {
      value,
      label: `${weekDay} ${formatShortDatePtBr(date).replace(".", "")}`,
      monthLabel: formatter.format(date)
    };
  });
}

export default async function SchedulingPage() {
  const session = await getAuthenticatedClient();
  const [serviceRecords, barberRecords, subscriptionRecords] = await Promise.all([
    prisma.service.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { name: "asc" }
    }),
    prisma.barber.findMany({
      where: { active: true, deletedAt: null },
      include: { user: true, availability: { where: { active: true, deletedAt: null }, orderBy: { weekDay: "asc" } } },
      orderBy: { createdAt: "asc" }
    }),
    session
      ? prisma.subscription.findMany({
          where: {
            clientId: session.client.id,
            active: true,
            deletedAt: null,
            OR: [{ endDate: null }, { endDate: { gte: new Date() } }]
          },
          include: { subscriptionPlan: { include: { services: true } } }
        })
      : []
  ]);

  const coveredServiceIds = new Set(
    subscriptionRecords.flatMap((subscription) => subscription.subscriptionPlan.services.map((item) => item.serviceId))
  );

  const services = serviceRecords
    .sort((a, b) => {
      const aIndex = serviceOrder.indexOf(a.name);
      const bIndex = serviceOrder.indexOf(b.name);
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    })
    .map((service) => ({
      id: service.id,
      name: service.name,
      duration: `${service.duration} min`,
      durationMinutes: service.duration,
      price: service.name === "Luzes" || service.name === "Platinado" ? `A partir de ${formatCurrency(Number(service.price))}` : formatCurrency(Number(service.price)),
      priceValue: Number(service.price),
      coveredBySubscription: coveredServiceIds.has(service.id)
    }));

  const barbers: Barber[] = barberRecords.map((barber) => ({
    id: barber.id,
    name: barber.user.name,
    specialty: barber.specialty ?? "Barbeiro Renato Cortes"
  }));

  const availableTimes = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00"];
  const availabilityByBarber = Object.fromEntries(
    barberRecords.map((barber) => [
      barber.id,
      barber.availability.map((item) => ({
        weekDay: item.weekDay,
        startTime: item.startTime,
        endTime: item.endTime
      }))
    ])
  );

  return <SchedulingForm services={services} barbers={barbers} dates={buildDates()} availableTimes={availableTimes} availabilityByBarber={availabilityByBarber} />;
}
