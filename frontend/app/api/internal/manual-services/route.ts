import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/server/audit";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

const requestSchema = z.object({
  barberId: z.string().uuid().optional(),
  serviceIds: z.array(z.string().uuid()).min(1),
  customerName: z.string().trim().max(120).optional(),
  paymentMethod: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(500).optional()
});

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedUser();
    if (!session || session.user.role === "CLIENT") {
      return NextResponse.json({ message: "Acesso nao autorizado." }, { status: 403 });
    }

    const payload = requestSchema.safeParse(await request.json());
    if (!payload.success) return NextResponse.json({ message: "Confira os dados do atendimento." }, { status: 400 });

    const barberId = session.user.role === "BARBER" ? session.user.barber?.id : payload.data.barberId ?? session.user.barber?.id;
    if (!barberId) return NextResponse.json({ message: "Informe o barbeiro responsavel." }, { status: 400 });

    const [barber, services] = await Promise.all([
      prisma.barber.findFirst({ where: { id: barberId, active: true, deletedAt: null } }),
      prisma.service.findMany({ where: { id: { in: payload.data.serviceIds }, active: true, deletedAt: null } })
    ]);

    if (!barber || services.length !== payload.data.serviceIds.length) {
      return NextResponse.json({ message: "Barbeiro ou servico indisponivel." }, { status: 404 });
    }

    const total = services.reduce((sum, service) => sum + Number(service.price), 0);
    const commissionPercent = Number(barber.serviceCommissionPercent);
    const commissionAmount = total * (commissionPercent / 100);
    const serviceNames = services.map((service) => service.name).join(" + ");

    const transaction = await prisma.$transaction(async (tx) => {
      const financial = await tx.financialTransaction.create({
        data: {
          type: "INCOME",
          amount: total,
          description: `Atendimento avulso: ${serviceNames}${payload.data.customerName ? ` - ${payload.data.customerName}` : ""}`
        }
      });

      await tx.employeeCommission.create({
        data: {
          barberId,
          amount: commissionAmount,
          percentage: commissionPercent
        }
      });

      return financial;
    });

    await createAuditLog({
      userId: session.user.id,
      action: "MANUAL_SERVICE_CREATE",
      entity: "FinancialTransaction",
      entityId: transaction.id,
      metadata: { barberId, serviceIds: payload.data.serviceIds, customerName: payload.data.customerName ?? null }
    });

    return NextResponse.json({ transactionId: transaction.id });
  } catch {
    return NextResponse.json({ message: "Nao foi possivel registrar o atendimento agora." }, { status: 500 });
  }
}
