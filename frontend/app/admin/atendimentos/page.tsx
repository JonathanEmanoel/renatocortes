export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { ManualServiceForm } from "@/components/internal/manual-service-form";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

export default async function AdminManualServicesPage() {
  const session = await getAuthenticatedUser();
  if (!session) redirect("/login?redirectTo=/admin/atendimentos");
  if (session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER") redirect("/cliente");

  const [services, barbers] = await Promise.all([
    prisma.service.findMany({ where: { active: true, deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.barber.findMany({ where: { active: true, deletedAt: null }, include: { user: true }, orderBy: { user: { name: "asc" } } })
  ]);

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-8 text-white">
      <section className="mx-auto max-w-7xl">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary">Atendimentos</p>
        <h1 className="mt-3 text-3xl font-black uppercase md:text-5xl">Atendimento avulso</h1>
        <div className="mt-8">
          <ManualServiceForm
            services={services.map((service) => ({ id: service.id, name: service.name, price: Number(service.price) }))}
            barbers={barbers.map((barber) => ({ id: barber.id, name: barber.user.name }))}
            canChooseBarber
          />
        </div>
      </section>
    </main>
  );
}
