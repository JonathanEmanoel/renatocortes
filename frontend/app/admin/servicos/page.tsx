export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { InternalPageHeader } from "@/components/internal/internal-page-header";
import { ServiceManagementPanel } from "@/components/internal/service-management-panel";
import { prisma } from "@/lib/prisma";
import { getDashboardPath } from "@/lib/auth-routes";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

export default async function AdminServicesPage() {
  const session = await getAuthenticatedUser();
  if (!session) redirect("/login?redirectTo=/admin/servicos");
  if (session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER") redirect(getDashboardPath(session.user.role, Boolean(session.user.barber?.id)));

  const services = await prisma.service.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-8 text-white">
      <section className="mx-auto max-w-7xl">
        <InternalPageHeader
          eyebrow="Servicos"
          title="Catalogo de servicos"
          backHref="/admin"
          backLabel="Painel administrativo"
          role={session.user.role}
          hasBarber={Boolean(session.user.barber?.id)}
        />
        <div className="mt-8">
          <ServiceManagementPanel
            services={services.map((service) => ({
              id: service.id,
              name: service.name,
              description: service.description ?? "",
              duration: service.duration,
              price: Number(service.price),
              active: service.active
            }))}
          />
        </div>
      </section>
    </main>
  );
}
