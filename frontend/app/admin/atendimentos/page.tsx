export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { InternalPageHeader } from "@/components/internal/internal-page-header";
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
        <InternalPageHeader
          eyebrow="Atendimentos"
          title="Atendimento avulso"
          backHref="/admin"
          backLabel="Painel administrativo"
          role={session.user.role}
          hasBarber={Boolean(session.user.barber?.id)}
        />
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
