import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import { getAuthenticatedClient } from "@/lib/server/auth";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

const requestSchema = z.object({
  planId: z.string().uuid()
});

const manageSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel"), subscriptionId: z.string().uuid() }),
  z.object({ action: z.literal("change"), subscriptionId: z.string().uuid(), planId: z.string().uuid() })
]);

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedClient();

    if (!session) {
      return NextResponse.json({ message: "Faca login para solicitar uma assinatura." }, { status: 401 });
    }

    const payload = requestSchema.safeParse(await request.json());

    if (!payload.success) {
      return NextResponse.json({ message: "Escolha um plano valido." }, { status: 400 });
    }

    const plan = await prisma.subscriptionPlan.findFirst({
      where: {
        id: payload.data.planId,
        active: true,
        deletedAt: null
      }
    });

    if (!plan) {
      return NextResponse.json({ message: "Plano nao encontrado." }, { status: 404 });
    }

    const existingSubscription = await prisma.subscription.findFirst({
      where: { clientId: session.client.id, deletedAt: null, status: { in: ["ACTIVE", "PENDING"] } }
    });

    if (existingSubscription) {
      return NextResponse.json({ message: "Voce ja possui uma assinatura em andamento. Gerencie-a nesta pagina." }, { status: 409 });
    }

    const subscription = await prisma.subscription.create({
      data: {
        clientId: session.client.id,
        subscriptionPlanId: plan.id,
        startDate: new Date(),
        active: false,
        status: "PENDING"
      }
    });

    const message = [
      "Ola!",
      "",
      "Gostaria de contratar o seguinte plano:",
      "",
      plan.name,
      "",
      "Valor:",
      "",
      formatCurrency(Number(plan.value)),
      "",
      "Nome:",
      "",
      session.user.name || "Nao informado",
      "",
      "Telefone:",
      "",
      session.user.phone || "Nao informado",
      "",
      "Aguardo confirmacao.",
      "",
      "Obrigado!"
    ].join("\n");

    return NextResponse.json({
      subscriptionId: subscription.id,
      whatsAppUrl: buildWhatsAppUrl(message)
    });
  } catch {
    return NextResponse.json(
      { message: "Nao foi possivel solicitar a assinatura agora." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getAuthenticatedClient();
    if (!session) return NextResponse.json({ message: "Faca login para gerenciar sua assinatura." }, { status: 401 });

    const payload = manageSchema.safeParse(await request.json());
    if (!payload.success) return NextResponse.json({ message: "Confira os dados da assinatura." }, { status: 400 });

    const subscription = await prisma.subscription.findFirst({
      where: {
        id: payload.data.subscriptionId,
        clientId: session.client.id,
        deletedAt: null,
        status: { in: ["ACTIVE", "PENDING"] }
      }
    });
    if (!subscription) return NextResponse.json({ message: "Assinatura nao encontrada ou nao pode mais ser alterada." }, { status: 404 });

    if (payload.data.action === "cancel") {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { active: false, status: "CANCELED", endDate: new Date() }
      });
      return NextResponse.json({ message: "Assinatura cancelada com sucesso." });
    }

    const plan = await prisma.subscriptionPlan.findFirst({
      where: { id: payload.data.planId, active: true, deletedAt: null }
    });
    if (!plan) return NextResponse.json({ message: "Plano nao encontrado." }, { status: 404 });

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { subscriptionPlanId: plan.id }
    });
    return NextResponse.json({ message: "Plano alterado com sucesso." });
  } catch {
    return NextResponse.json({ message: "Nao foi possivel gerenciar a assinatura agora." }, { status: 500 });
  }
}
