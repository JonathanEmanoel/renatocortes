import { NextResponse } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/server/audit";
import { createManualService, manualServiceTotals } from "@/lib/server/manual-services";
import { startOfSaoPauloDay, todayDateInput } from "@/lib/server/date-periods";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

const itemSchema = z.object({
  serviceId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1)
});

const requestSchema = z.object({
  barberId: z.string().uuid().optional(),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  customerName: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  subscriptionId: z.string().uuid().optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
  items: z.array(itemSchema).min(1),
  highQuantityConfirmed: z.boolean().optional()
});

function canChooseBarber(role: string) {
  return role === "ADMIN" || role === "DEVELOPER";
}

function resolveResponsibleBarberId({
  role,
  sessionBarberId,
  requestedBarberId
}: {
  role: string;
  sessionBarberId?: string;
  requestedBarberId?: string;
}) {
  if (role === "BARBER") return sessionBarberId;
  if (canChooseBarber(role)) return requestedBarberId ?? sessionBarberId;
  return sessionBarberId;
}

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedUser();
    if (!session || session.user.role === "CLIENT") {
      return NextResponse.json({ message: "Acesso nao autorizado." }, { status: 403 });
    }

    const payload = requestSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json({ message: "Confira os dados do atendimento." }, { status: 400 });
    }

    const barberId = resolveResponsibleBarberId({
      role: session.user.role,
      sessionBarberId: session.user.barber?.id,
      requestedBarberId: payload.data.barberId
    });
    if (!barberId) return NextResponse.json({ message: "Informe o barbeiro responsavel." }, { status: 400 });

    const hasHighQuantity = !payload.data.subscriptionId && payload.data.items.some((item) => item.quantity > 50);
    if (hasHighQuantity && !payload.data.highQuantityConfirmed) {
      return NextResponse.json({ message: "Confirme a quantidade alta antes de registrar." }, { status: 400 });
    }

    const manualService = await createManualService({
      barberId,
      serviceDate: startOfSaoPauloDay(payload.data.serviceDate ?? todayDateInput()),
      customerName: payload.data.customerName,
      clientId: payload.data.clientId ?? null,
      subscriptionId: payload.data.subscriptionId ?? null,
      notes: payload.data.notes,
      items: payload.data.items,
      createdById: session.user.id
    });

    const totals = manualServiceTotals(manualService);
    await createAuditLog({
      userId: session.user.id,
      action: "MANUAL_SERVICE_CREATE",
      entity: "ManualService",
      entityId: manualService.id,
      metadata: {
        barberId,
        manualServiceId: manualService.id,
        serviceIds: manualService.items.map((item) => item.serviceId),
        customerName: manualService.customerName,
        serviceDate: manualService.serviceDate.toISOString(),
        gross: totals.chargedGross,
        commission: totals.commission,
        subscriptionId: manualService.subscriptionId
      }
    });

    return NextResponse.json({ manualServiceId: manualService.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel registrar o atendimento agora.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
