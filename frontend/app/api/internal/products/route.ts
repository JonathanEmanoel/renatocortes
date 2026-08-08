import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/server/audit";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

const productSchema = z.object({
  productId: z.string().uuid().optional(),
  categoryId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  price: z.number().min(0),
  costPrice: z.number().min(0).optional(),
  stock: z.number().int().min(0).max(9999),
  image: z.string().trim().max(500).optional(),
  active: z.boolean().default(true),
  visibleInStore: z.boolean().default(true)
});

const stockSchema = z.object({
  productId: z.string().uuid(),
  stock: z.number().int().min(0).max(9999)
});

const deleteSchema = z.object({
  productId: z.string().uuid()
});

function canManageBusiness(role: string) {
  return role === "ADMIN" || role === "DEVELOPER";
}

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedUser();

    if (!session || !canManageBusiness(session.user.role)) {
      return NextResponse.json({ message: "Acesso não autorizado." }, { status: 403 });
    }

    const payload = productSchema.safeParse(await request.json());
    if (!payload.success) return NextResponse.json({ message: "Confira os dados do produto." }, { status: 400 });

    const product = await prisma.product.create({
      data: {
        categoryId: payload.data.categoryId,
        name: payload.data.name,
        description: payload.data.description,
        price: payload.data.price,
        costPrice: payload.data.costPrice ?? 0,
        stock: payload.data.stock,
        image: payload.data.image,
        active: payload.data.active,
        visibleInStore: payload.data.visibleInStore
      }
    });

    await prisma.stockMovement.create({
      data: { productId: product.id, type: "IN", quantity: product.stock, reason: "Cadastro inicial" }
    }).catch(() => null);

    await createAuditLog({ userId: session.user.id, action: "CREATE_PRODUCT", entity: "Product", entityId: product.id, metadata: payload.data });
    return NextResponse.json({ product });
  } catch {
    return NextResponse.json({ message: "Não foi possível cadastrar o produto." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getAuthenticatedUser();

    if (!session || session.user.role === "CLIENT") {
      return NextResponse.json({ message: "Acesso não autorizado." }, { status: 403 });
    }

    const body = await request.json();
    const productPayload = productSchema.safeParse(body);

    if (productPayload.success && productPayload.data.productId) {
      if (!canManageBusiness(session.user.role)) {
        return NextResponse.json({ message: "Barbeiros só podem alterar quantidade em estoque." }, { status: 403 });
      }

      const before = await prisma.product.findUnique({ where: { id: productPayload.data.productId } });
      const product = await prisma.product.update({
        where: { id: productPayload.data.productId },
        data: {
          categoryId: productPayload.data.categoryId,
          name: productPayload.data.name,
          description: productPayload.data.description,
          price: productPayload.data.price,
          costPrice: productPayload.data.costPrice ?? 0,
          stock: productPayload.data.stock,
          image: productPayload.data.image,
          active: productPayload.data.active,
          visibleInStore: productPayload.data.visibleInStore
        }
      });

      if (before && before.stock !== product.stock) {
        await prisma.stockMovement.create({
          data: {
            productId: product.id,
            type: product.stock > before.stock ? "IN" : "OUT",
            quantity: Math.abs(product.stock - before.stock),
            reason: "Alteração administrativa"
          }
        }).catch(() => null);
      }

      await createAuditLog({ userId: session.user.id, action: "UPDATE_PRODUCT", entity: "Product", entityId: product.id, metadata: productPayload.data });
      return NextResponse.json({ product });
    }

    const stockPayload = stockSchema.safeParse(body);
    if (!stockPayload.success) return NextResponse.json({ message: "Confira os dados do produto." }, { status: 400 });

    const before = await prisma.product.findUnique({ where: { id: stockPayload.data.productId } });
    const product = await prisma.product.update({
      where: { id: stockPayload.data.productId },
      data: { stock: stockPayload.data.stock }
    });

    await prisma.stockMovement.create({
      data: {
        productId: product.id,
        type: before && stockPayload.data.stock >= before.stock ? "IN" : "OUT",
        quantity: before ? Math.abs(stockPayload.data.stock - before.stock) : stockPayload.data.stock,
        reason: "Ajuste de estoque"
      }
    }).catch(() => null);

    await createAuditLog({ userId: session.user.id, action: "UPDATE_STOCK", entity: "Product", entityId: product.id, metadata: stockPayload.data });
    return NextResponse.json({ product });
  } catch {
    return NextResponse.json({ message: "Não foi possível atualizar o produto agora." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getAuthenticatedUser();
    if (!session || !canManageBusiness(session.user.role)) {
      return NextResponse.json({ message: "Acesso não autorizado." }, { status: 403 });
    }

    const payload = deleteSchema.safeParse(await request.json());
    if (!payload.success) return NextResponse.json({ message: "Informe o produto." }, { status: 400 });

    const product = await prisma.product.update({
      where: { id: payload.data.productId },
      data: { active: false, deletedAt: null }
    });

    await createAuditLog({ userId: session.user.id, action: "DELETE_PRODUCT", entity: "Product", entityId: product.id });
    return NextResponse.json({ product });
  } catch {
    return NextResponse.json({ message: "Não foi possível excluir o produto." }, { status: 500 });
  }
}
