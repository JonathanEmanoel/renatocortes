export const dynamic = "force-dynamic";
export const revalidate = 0;
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedClient } from "@/lib/server/auth";
import { redirect } from "next/navigation";
import { SubscriptionsContent } from "./subscriptions-content";
import type { SubscriptionPlan } from "@/types/client-area";

export default async function SubscriptionsPage() {
  const session = await getAuthenticatedClient();
  if (!session) redirect("/login?redirectTo=/cliente/assinaturas");

  const [planRecords, subscription] = await Promise.all([
    prisma.subscriptionPlan.findMany({
      where: { active: true, deletedAt: null },
      include: { services: { include: { service: true } } },
      orderBy: { value: "asc" }
    }),
    prisma.subscription.findFirst({
      where: { clientId: session.client.id, deletedAt: null, status: { in: ["ACTIVE", "PENDING"] } },
      include: { subscriptionPlan: { include: { services: { include: { service: true } } } } },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
    })
  ]);

  const plans: SubscriptionPlan[] = planRecords.map((plan, index) => ({
    id: plan.id,
    name: plan.name,
    price: formatCurrency(Number(plan.value)),
    description: plan.description ?? undefined,
    periodicity: "Mensal",
    benefits: [
      plan.description ?? "Benefícios exclusivos Renato Cortes.",
      ...plan.services.map((item) => item.service.name)
    ],
    featured: plan.name === "Plano Cabelo + Barba" || index === Math.floor(planRecords.length / 2)
  }));

  const currentSubscription = subscription
    ? {
        id: subscription.id,
        status: subscription.status as "ACTIVE" | "PENDING",
        planId: subscription.subscriptionPlan.id,
        planName: subscription.subscriptionPlan.name,
        price: formatCurrency(Number(subscription.subscriptionPlan.value)),
        renewalDate: subscription.endDate?.toISOString() ?? null,
        benefits: [
          subscription.subscriptionPlan.description ?? "Benefícios exclusivos Renato Cortes.",
          ...subscription.subscriptionPlan.services.map((item) => item.service.name)
        ]
      }
    : null;

  return <SubscriptionsContent plans={plans} currentSubscription={currentSubscription} />;
}
