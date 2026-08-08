export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { AvailabilityForm } from "@/components/internal/availability-form";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

const weekDays = [
  { weekDay: 0, label: "Domingo" },
  { weekDay: 1, label: "Segunda" },
  { weekDay: 2, label: "Terca" },
  { weekDay: 3, label: "Quarta" },
  { weekDay: 4, label: "Quinta" },
  { weekDay: 5, label: "Sexta" },
  { weekDay: 6, label: "Sabado" }
];

export default async function BarberAvailabilityPage() {
  const session = await getAuthenticatedUser();
  if (!session) redirect("/login?redirectTo=/funcionario/disponibilidade");
  if (session.user.role === "CLIENT") redirect("/cliente");
  if (!session.user.barber?.id) redirect("/admin");

  const availability = await prisma.barberAvailability.findMany({
    where: { barberId: session.user.barber.id, active: true, deletedAt: null },
    orderBy: { weekDay: "asc" }
  });

  const days = weekDays.map((day) => {
    const current = availability.find((item) => item.weekDay === day.weekDay);
    return {
      ...day,
      active: Boolean(current),
      startTime: current?.startTime ?? "09:00",
      endTime: current?.endTime ?? "18:00"
    };
  });

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-8 text-white">
      <section className="mx-auto max-w-4xl">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary">Agenda</p>
        <h1 className="mt-3 text-3xl font-black uppercase md:text-5xl">Minha disponibilidade</h1>
        <div className="mt-8">
          <AvailabilityForm barberId={session.user.barber.id} days={days} />
        </div>
      </section>
    </main>
  );
}
