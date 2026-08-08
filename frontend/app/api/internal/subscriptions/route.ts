import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/server/audit";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

const requestSchema = z.object({
  subscriptionId: z.string().uuid(),
  action: z.enum(["approve", "reject", "cancel"])
});

export async function PATCH(request: Request) {
  try {
    const session = await getAuthenticatedUser();

    if (!session || session.user.role === "CLIENT" || session.user.role === "BARBER") {
      return NextResponse.json({ message: "Acesso nao autorizado." }, { status: 403 });
    }

    const payload = requestSchema.safeParse(await request.json());

    if (!payload.success) {
      return NextResponse.json({ message: "Confira os dados da assinatura." }, { status: 400 });
    }

    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 30);

    const subscription = await prisma.subscription.update({
      where: { id: payload.data.subscriptionId },
      data:
        payload.data.action === "approve"
          ? {
              active: true,
              status: "ACTIVE",
              startDate: now,
              endDate,
              deletedAt: null
            }
          : {
              active: false,
              status: payload.data.action === "cancel" ? "CANCELED" : "REJECTED",
              endDate: payload.data.action === "cancel" ? now : undefined,
              deletedAt: null
            }
    });

    await createAuditLog({
      userId: session.user.id,
      action: `SUBSCRIPTION_${payload.data.action.toUpperCase()}`,
      entity: "Subscription",
      entityId: subscription.id,
      metadata: { active: subscription.active, endDate: subscription.endDate?.toISOString() ?? null }
    });

    return NextResponse.json({ subscription });
  } catch {
    return NextResponse.json({ message: "Nao foi possivel alterar a assinatura agora." }, { status: 500 });
  }
}
