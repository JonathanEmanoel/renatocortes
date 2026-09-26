import { NextResponse } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/server/audit";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";
import { paySubscriptionPayout } from "@/lib/server/subscription-payouts";

const requestSchema = z.object({
  competenceMonth: z.string().regex(/^\d{4}-\d{2}$/),
  barberId: z.string().uuid(),
  adjustment: z.boolean().optional(),
  operationKey: z.string().regex(/^[a-f0-9]{64}$/)
});

/**
 * Baixa de repasse de assinaturas: somente ADMIN pode transformar
 * o calculo mensal em despesa paga e movimentacao financeira.
 */
export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedUser();
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ message: "Acesso nao autorizado." }, { status: 403 });
    }

    const payload = requestSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json({ message: "Confira os dados do repasse." }, { status: 400 });
    }

    const payout = await paySubscriptionPayout({
      competenceMonth: payload.data.competenceMonth,
      barberId: payload.data.barberId,
      adjustment: payload.data.adjustment,
      operationKey: payload.data.operationKey,
      paidById: session.user.id
    });

    // Mantem rastreabilidade para auditoria da baixa financeira feita pelo administrador.
    await createAuditLog({
      userId: session.user.id,
      action: "SUBSCRIPTION_PAYOUT_PAID",
      entity: "SubscriptionPayout",
      entityId: payout.id,
      metadata: {
        competenceMonth: payout.competenceMonth,
        barberId: payout.barberId,
        paidAmount: payout.paidAmount.toString(),
        paidAt: payout.paidAt?.toISOString() ?? null,
        type: payout.type,
        adjustmentNumber: payout.adjustmentNumber
      }
    });

    return NextResponse.json({ payoutId: payout.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel pagar o repasse.";
    const status = message.includes("ja foi pago") || message.includes("processamento") || message.includes("calculo mudou") ? 409 : 500;
    return NextResponse.json({ message }, { status });
  }
}
