export const dynamic = "force-dynamic";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { SubscriptionsContent } from "./subscriptions-content";
import type { SubscriptionPlan } from "@/types/client-area";

export default async function SubscriptionsPage() {
  const planRecords = await prisma.subscriptionPlan.findMany({
    where: { active: true, deletedAt: null },
    include: { services: { include: { service: true } } },
    orderBy: { value: "asc" }
  });

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
    featured: index === Math.floor(planRecords.length / 2)
  }));

  return <SubscriptionsContent plans={plans} />;
}
