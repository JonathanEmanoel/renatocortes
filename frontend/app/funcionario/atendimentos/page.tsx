export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { InternalPageHeader } from "@/components/internal/internal-page-header";
import { ManualServiceManager, type ManualServiceRecord } from "@/components/internal/manual-service-manager";
import { prisma } from "@/lib/prisma";
import { dateInputFromDate } from "@/lib/server/date-periods";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";
import { activeSubscribersForManualService } from "@/lib/server/manual-services";
import type { Prisma } from "@prisma/client";

function parseAuditMetadata(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, Prisma.JsonValue>;
}

export default async function BarberManualServicesPage() {
  const session = await getAuthenticatedUser();
  if (!session) redirect("/login?redirectTo=/funcionario/atendimentos");
  if (session.user.role !== "BARBER" && session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER") redirect("/cliente");

  const barberId = session.user.barber?.id;
  if (!barberId) redirect("/admin");

  const [services, subscribers, records, legacyCommissions, legacyAudits] = await Promise.all([
    prisma.service.findMany({ where: { active: true, deletedAt: null }, orderBy: { name: "asc" } }),
    activeSubscribersForManualService(),
    prisma.manualService.findMany({
      where: { barberId, deletedAt: null },
      include: {
        items: { include: { service: true } },
        client: { include: { user: true } },
        changeRequests: { where: { status: "PENDING" }, take: 1 }
      },
      orderBy: { serviceDate: "desc" },
      take: 150
    }),
    prisma.employeeCommission.findMany({
      where: { barberId, appointmentId: null, saleId: null },
      orderBy: { createdAt: "desc" },
      take: 150
    }),
    prisma.auditLog.findMany({
      where: { action: "MANUAL_SERVICE_CREATE" },
      orderBy: { createdAt: "desc" },
      take: 300
    })
  ]);

  const servicesById = new Map(services.map((service) => [service.id, service]));
  const legacyRows: ManualServiceRecord[] = legacyCommissions
    .map((commission) => {
      const audit = legacyAudits.find((item) => {
        const metadata = parseAuditMetadata(item.metadata);
        if (metadata.manualServiceId) return false;
        if (metadata.barberId !== barberId) return false;
        const delta = Math.abs(item.createdAt.getTime() - commission.createdAt.getTime());
        return delta <= 10 * 60 * 1000;
      });
      if (!audit) return null;
      const metadata = parseAuditMetadata(audit.metadata);
      if (typeof metadata.maintenanceHiddenAt === "string") return null;
      const rawItems = Array.isArray(metadata.items)
        ? metadata.items
        : Array.isArray(metadata.serviceIds)
          ? metadata.serviceIds.map((serviceId) => ({ serviceId, quantity: 1 }))
          : [];
      const items = rawItems
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          const record = item as Record<string, Prisma.JsonValue>;
          const serviceId = typeof record.serviceId === "string" ? record.serviceId : "";
          const service = servicesById.get(serviceId);
          if (!service) return null;
          const quantity = typeof record.quantity === "number" && Number.isInteger(record.quantity) && record.quantity > 0 ? record.quantity : 1;
          return {
            serviceId,
            name: service.name,
            quantity,
            price: Number(service.price),
            chargedPrice: Number(service.price),
            covered: false
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      return {
        id: commission.id,
        source: "legacy" as const,
        serviceDate: dateInputFromDate(commission.createdAt),
        customerName: typeof metadata.customerName === "string" ? metadata.customerName : "Nao informado",
        notes: "",
        subscriptionId: null,
        pendingChange: null,
        items
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-8 text-white">
      <section className="mx-auto max-w-7xl">
        <InternalPageHeader
          eyebrow="Atendimentos avulsos"
          title="Gerenciar meus atendimentos"
          backHref="/funcionario"
          backLabel="Painel do barbeiro"
          role={session.user.role}
          hasBarber={Boolean(session.user.barber?.id)}
        />

        <div className="mt-8">
          <ManualServiceManager
            records={(records.map((record): ManualServiceRecord => ({
              id: record.id,
              source: "current" as const,
              serviceDate: dateInputFromDate(record.serviceDate),
              customerName: record.customerName ?? record.client?.user.name ?? "Nao informado",
              notes: record.notes ?? "",
              subscriptionId: record.subscriptionId,
              pendingChange: record.changeRequests[0]?.id ?? null,
              items: record.items.map((item) => ({
                serviceId: item.serviceId,
                name: item.service.name,
                quantity: item.quantity,
                price: Number(item.unitPrice),
                chargedPrice: Number(item.chargedUnitPrice),
                covered: item.coveredBySubscription
              }))
            })) as ManualServiceRecord[]).concat(legacyRows)}
            services={services.map((service) => ({ id: service.id, name: service.name, price: Number(service.price) }))}
            subscribers={subscribers}
            barbers={[{ id: barberId, name: session.user.name }]}
            barberId={barberId}
          />
        </div>
      </section>
    </main>
  );
}
