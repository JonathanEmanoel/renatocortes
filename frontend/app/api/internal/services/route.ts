import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/server/audit";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

const serviceSchema = z.object({
  serviceId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  duration: z.number().int().min(5).max(600),
  price: z.number().min(0),
  active: z.boolean().default(true)
});

const deleteSchema = z.object({ serviceId: z.string().uuid() });

async function requireManager() {
  const session = await getAuthenticatedUser();
  return session && (session.user.role === "ADMIN" || session.user.role === "DEVELOPER") ? session : null;
}

export async function POST(request: Request) {
  const session = await requireManager();
  if (!session) return NextResponse.json({ message: "Acesso não autorizado." }, { status: 403 });
  const payload = serviceSchema.safeParse(await request.json());
  if (!payload.success) return NextResponse.json({ message: "Confira os dados do serviço." }, { status: 400 });
  const service = await prisma.service.create({ data: payload.data });
  await createAuditLog({ userId: session.user.id, action: "CREATE_SERVICE", entity: "Service", entityId: service.id, metadata: payload.data });
  return NextResponse.json({ service });
}

export async function PATCH(request: Request) {
  const session = await requireManager();
  if (!session) return NextResponse.json({ message: "Acesso não autorizado." }, { status: 403 });
  const payload = serviceSchema.safeParse(await request.json());
  if (!payload.success || !payload.data.serviceId) return NextResponse.json({ message: "Confira os dados do serviço." }, { status: 400 });
  const service = await prisma.service.update({
    where: { id: payload.data.serviceId },
    data: {
      name: payload.data.name,
      description: payload.data.description,
      duration: payload.data.duration,
      price: payload.data.price,
      active: payload.data.active
    }
  });
  await createAuditLog({ userId: session.user.id, action: "UPDATE_SERVICE", entity: "Service", entityId: service.id, metadata: payload.data });
  return NextResponse.json({ service });
}

export async function DELETE(request: Request) {
  const session = await requireManager();
  if (!session) return NextResponse.json({ message: "Acesso não autorizado." }, { status: 403 });
  const payload = deleteSchema.safeParse(await request.json());
  if (!payload.success) return NextResponse.json({ message: "Informe o serviço." }, { status: 400 });
  const service = await prisma.service.update({ where: { id: payload.data.serviceId }, data: { active: false, deletedAt: new Date() } });
  await createAuditLog({ userId: session.user.id, action: "DELETE_SERVICE", entity: "Service", entityId: service.id });
  return NextResponse.json({ service });
}
