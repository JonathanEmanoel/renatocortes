export const dynamic = "force-dynamic";
export const revalidate = 0;

import { prisma } from "@/lib/prisma";
import { formatCurrency, formatShortDatePtBr } from "@/lib/format";
import { SchedulingForm } from "./scheduling-form";
import type { Barber } from "@/types/client-area";

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
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    const value = date.toISOString().slice(0, 10);
    return {
      value,
      label: formatShortDatePtBr(date).replace(".", ""),
      monthLabel: formatter.format(date)
    };
  });
}

export default async function SchedulingPage() {
  const [serviceRecords, barberRecords] = await Promise.all([
    prisma.service.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { name: "asc" }
    }),
    prisma.barber.findMany({
      where: { active: true, deletedAt: null },
      include: { user: true },
      orderBy: { createdAt: "asc" }
    })
  ]);

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
      price: service.name === "Luzes" || service.name === "Platinado" ? `A partir de ${formatCurrency(Number(service.price))}` : formatCurrency(Number(service.price))
    }));

  const barbers: Barber[] = barberRecords.map((barber) => ({
    id: barber.id,
    name: barber.user.name,
    specialty: barber.specialty ?? "Barbeiro Renato Cortes",
    rating: "5.0"
  }));

  const availableTimes = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

  return <SchedulingForm services={services} barbers={barbers} dates={buildDates()} availableTimes={availableTimes} />;
}
