export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { AvailabilityForm } from "@/components/internal/availability-form";
import { InternalPageHeader } from "@/components/internal/internal-page-header";
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

export default async function AdminAvailabilityPage() {
  const session = await getAuthenticatedUser();
  if (!session) redirect("/login?redirectTo=/admin/disponibilidade");
  if (session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER") redirect("/cliente");

  const barbers = await prisma.barber.findMany({
    where: { active: true, deletedAt: null },
    include: { user: true, availability: { where: { active: true, deletedAt: null }, orderBy: { weekDay: "asc" } } },
    orderBy: { user: { name: "asc" } }
  });

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-8 text-white">
      <section className="mx-auto max-w-7xl">
        <InternalPageHeader
          eyebrow="Disponibilidade"
          title="Horarios dos profissionais"
          backHref="/admin"
          backLabel="Painel administrativo"
          role={session.user.role}
          hasBarber={Boolean(session.user.barber?.id)}
        />
        <div className="mt-8 grid gap-6">
          {barbers.length === 0 ? <p className="rounded-[12px] border border-primary/20 bg-card p-6 text-white/65">Nenhum barbeiro ativo.</p> : null}
          {barbers.map((barber) => {
            const days = weekDays.map((day) => {
              const current = barber.availability.find((item) => item.weekDay === day.weekDay);
              return { ...day, active: Boolean(current), startTime: current?.startTime ?? "09:00", endTime: current?.endTime ?? "18:00" };
            });
            return (
              <section key={barber.id} className="grid gap-3">
                <h2 className="text-xl font-black uppercase text-primary">{barber.user.name}</h2>
                <AvailabilityForm barberId={barber.id} days={days} />
              </section>
            );
          })}
        </div>
      </section>
    </main>
  );
}
