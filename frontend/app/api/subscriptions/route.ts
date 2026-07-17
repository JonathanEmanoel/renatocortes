import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import { getAuthenticatedClient } from "@/lib/server/auth";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

const requestSchema = z.object({
  planId: z.string().uuid()
});

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

    const subscription = await prisma.subscription.create({
      data: {
        clientId: session.client.id,
        subscriptionPlanId: plan.id,
        startDate: new Date(),
        active: false
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
