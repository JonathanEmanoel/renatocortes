import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/server/audit";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

const planSchema = z.object({
  planId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  value: z.number().min(0),
  benefits: z.string().trim().max(1000).optional(),
  cutsIncluded: z.number().int().min(0).max(999).optional(),
  periodDays: z.number().int().min(1).max(365).default(30),
  active: z.boolean().default(true)
});

const deleteSchema = z.object({ planId: z.string().uuid() });

async function requireManager() {
  const session = await getAuthenticatedUser();
  return session && (session.user.role === "ADMIN" || session.user.role === "DEVELOPER") ? session : null;
}

function dataFromPayload(payload: z.infer<typeof planSchema>) {
  return {
    name: payload.name,
    description: payload.description,
    value: payload.value,
    benefits: payload.benefits ? payload.benefits.split("\n").filter(Boolean) : undefined,
    cutsIncluded: payload.cutsIncluded,
    periodDays: payload.periodDays,
    active: payload.active
  };
}

export async function POST(request: Request) {
  const session = await requireManager();
  if (!session) return NextResponse.json({ message: "Acesso não autorizado." }, { status: 403 });
  const payload = planSchema.safeParse(await request.json());
  if (!payload.success) return NextResponse.json({ message: "Confira os dados do plano." }, { status: 400 });
  const plan = await prisma.subscriptionPlan.create({ data: dataFromPayload(payload.data) });
  await createAuditLog({ userId: session.user.id, action: "CREATE_PLAN", entity: "SubscriptionPlan", entityId: plan.id, metadata: payload.data });
  return NextResponse.json({ plan });
}

export async function PATCH(request: Request) {
  const session = await requireManager();
  if (!session) return NextResponse.json({ message: "Acesso não autorizado." }, { status: 403 });
  const payload = planSchema.safeParse(await request.json());
  if (!payload.success || !payload.data.planId) return NextResponse.json({ message: "Confira os dados do plano." }, { status: 400 });
  const plan = await prisma.subscriptionPlan.update({ where: { id: payload.data.planId }, data: dataFromPayload(payload.data) });
  await createAuditLog({ userId: session.user.id, action: "UPDATE_PLAN", entity: "SubscriptionPlan", entityId: plan.id, metadata: payload.data });
  return NextResponse.json({ plan });
}

export async function DELETE(request: Request) {
  const session = await requireManager();
  if (!session) return NextResponse.json({ message: "Acesso não autorizado." }, { status: 403 });
  const payload = deleteSchema.safeParse(await request.json());
  if (!payload.success) return NextResponse.json({ message: "Informe o plano." }, { status: 400 });
  const plan = await prisma.subscriptionPlan.update({ where: { id: payload.data.planId }, data: { active: false, deletedAt: null } });
  await createAuditLog({ userId: session.user.id, action: "DELETE_PLAN", entity: "SubscriptionPlan", entityId: plan.id });
  return NextResponse.json({ plan });
}
