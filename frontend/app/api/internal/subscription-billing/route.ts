import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";
import { confirmSubscriptionPayment, previewSubscriptionBilling, scheduleSubscriptionDueDay } from "@/lib/server/subscription-billing";

const common = { subscriptionId: z.string().uuid(), operationKey: z.string().regex(/^[a-f0-9]{64}$/) };
const requestSchema = z.discriminatedUnion("action", [
  z.object({ ...common, action: z.literal("confirm"), paidDate: z.string(), method: z.enum(["CASH", "PIX", "CREDIT_CARD", "DEBIT_CARD", "BANK_TRANSFER"]), acknowledgeLegacy: z.boolean() }).strict(),
  z.object({ ...common, action: z.literal("schedule"), newDay: z.number().int().min(1).max(31) }).strict()
]);

export async function GET(request: Request) {
  const session = await getAuthenticatedUser();
  if (session?.user.role !== "ADMIN") return NextResponse.json({ message: "Somente ADMIN." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const input = z.object({ subscriptionId: z.string().uuid(), newDay: z.coerce.number().int().min(1).max(31).optional() }).safeParse({ subscriptionId: params.get("subscriptionId"), newDay: params.has("newDay") ? params.get("newDay") : undefined });
  if (!input.success) return NextResponse.json({ message: "Dados invalidos." }, { status: 400 });
  try {
    return NextResponse.json(await previewSubscriptionBilling(input.data.subscriptionId, session.user.id, input.data.newDay), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error && !('code' in error) ? error.message : "Nao foi possivel calcular a previa." }, { status: 409 });
  }
}

export async function POST(request: Request) {
  const session = await getAuthenticatedUser();
  if (session?.user.role !== "ADMIN") return NextResponse.json({ message: "Somente ADMIN." }, { status: 403 });
  const payload = requestSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return NextResponse.json({ message: "Confira os dados. Datas de ciclo sao calculadas pelo servidor." }, { status: 400 });
  try {
    const input = { ...payload.data, userId: session.user.id };
    const result = input.action === "confirm" ? await confirmSubscriptionPayment(input) : await scheduleSubscriptionDueDay(input);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error && !('code' in error) ? error.message : "Nao foi possivel concluir. Nenhuma operacao parcial foi confirmada." }, { status: 409 });
  }
}
