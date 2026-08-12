import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/server/audit";
import { PRODUCT_PROFIT_COMMISSION_PERCENT, productItemsCommission } from "@/lib/server/finance-rules";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

const requestSchema = z.object({
  saleId: z.string().uuid(),
  action: z.enum(["complete", "cancel"])
});

const manualSaleSchema = z.object({
  barberId: z.string().uuid().optional(),
  customerName: z.string().trim().max(120).optional(),
  observations: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(999)
      })
    )
    .min(1)
});

function canManageSales(role: string) {
  return role === "ADMIN" || role === "DEVELOPER";
}

function canRegisterOwnSale(role: string) {
  return role === "BARBER" || role === "ADMIN";
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
  if (canManageSales(role)) return requestedBarberId ?? sessionBarberId;
  return sessionBarberId;
}

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedUser();
    if (!session || (!canManageSales(session.user.role) && !canRegisterOwnSale(session.user.role))) {
      return NextResponse.json({ message: "Acesso nao autorizado." }, { status: 403 });
    }

    const payload = manualSaleSchema.safeParse(await request.json());
    if (!payload.success) return NextResponse.json({ message: "Confira os dados da venda." }, { status: 400 });

    const barberId = resolveResponsibleBarberId({
      role: session.user.role,
      sessionBarberId: session.user.barber?.id,
      requestedBarberId: payload.data.barberId
    });

    if (!barberId) {
      return NextResponse.json({ message: "Seu usuario nao possui barbeiro vinculado para registrar venda presencial." }, { status: 400 });
    }

    const [barber, products] = await Promise.all([
      prisma.barber.findFirst({ where: { id: barberId, active: true, deletedAt: null } }),
      prisma.product.findMany({
      where: { id: { in: payload.data.items.map((item) => item.productId) }, active: true, deletedAt: null }
      })
    ]);

    if (!barber) return NextResponse.json({ message: "Barbeiro responsavel nao encontrado." }, { status: 404 });

    if (products.length !== payload.data.items.length) {
      return NextResponse.json({ message: "Um ou mais produtos nao estao disponiveis." }, { status: 404 });
    }

    const productsById = new Map(products.map((product) => [product.id, product]));
    const items = payload.data.items.map((item) => {
      const product = productsById.get(item.productId)!;
      if (product.stock < item.quantity) {
        throw new Error(`Estoque insuficiente para ${product.name}.`);
      }
      return {
        product,
        quantity: item.quantity,
        subtotal: Number(product.price) * item.quantity
      };
    });
    const totalValue = items.reduce((sum, item) => sum + item.subtotal, 0);
    const commissionPercent = PRODUCT_PROFIT_COMMISSION_PERCENT;
    const commissionAmount = productItemsCommission(
      items.map((item) => ({
        quantity: item.quantity,
        price: item.product.price,
        costPrice: item.product.costPrice,
        product: { visibleInStore: item.product.visibleInStore }
      }))
    );

    const sale = await prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          barberId,
          status: "COMPLETED",
          totalValue,
          customerName: payload.data.customerName,
          deliveryMethod: "Venda presencial",
          observations: payload.data.observations,
          completedAt: new Date(),
          items: {
            create: items.map((item) => ({
              productId: item.product.id,
              quantity: item.quantity,
              price: item.product.price,
              costPrice: item.product.costPrice
            }))
          }
        }
      });

      for (const item of items) {
        await tx.product.update({
          where: { id: item.product.id },
          data: { stock: { decrement: item.quantity } }
        });
        await tx.stockMovement.create({
          data: {
            productId: item.product.id,
            type: "SALE",
            quantity: item.quantity,
            reason: `Venda presencial ${created.id}`
          }
        });
      }

      await tx.financialTransaction.create({
        data: {
          type: "INCOME",
          amount: totalValue,
          description: `Venda presencial de produtos ${created.id}`
        }
      });

      if (commissionAmount > 0) {
        await tx.employeeCommission.create({
          data: {
            barberId,
            saleId: created.id,
            amount: commissionAmount,
            percentage: commissionPercent
          }
        });
      }

      return created;
    });

    await createAuditLog({
      userId: session.user.id,
      action: "MANUAL_PRODUCT_SALE_CREATE",
      entity: "Sale",
      entityId: sale.id,
      metadata: { barberId, items: payload.data.items, customerName: payload.data.customerName ?? null, gross: totalValue, commission: commissionAmount }
    });

    return NextResponse.json({ sale });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Nao foi possivel registrar a venda agora." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getAuthenticatedUser();
    if (!session || !canManageSales(session.user.role)) {
      return NextResponse.json({ message: "Acesso nao autorizado." }, { status: 403 });
    }

    const payload = requestSchema.safeParse(await request.json());
    if (!payload.success) return NextResponse.json({ message: "Confira os dados do pedido." }, { status: 400 });

    const sale = await prisma.sale.findFirst({
      where: { id: payload.data.saleId, deletedAt: null },
      include: { items: { include: { product: true } } }
    });

    if (!sale) return NextResponse.json({ message: "Pedido nao encontrado." }, { status: 404 });
    if (sale.status !== "OPEN") return NextResponse.json({ message: "Este pedido ja foi processado." }, { status: 409 });

    if (payload.data.action === "cancel") {
      const canceled = await prisma.sale.update({
        where: { id: sale.id },
        data: { status: "CANCELED", canceledAt: new Date() }
      });
      await createAuditLog({ userId: session.user.id, action: "SALE_CANCEL", entity: "Sale", entityId: sale.id });
      return NextResponse.json({ sale: canceled });
    }

    for (const item of sale.items) {
      if (item.product.stock < item.quantity) {
        return NextResponse.json({ message: `Estoque insuficiente para ${item.product.name}.` }, { status: 409 });
      }
    }

    const commissionAmount = sale.barberId ? productItemsCommission(sale.items) : 0;

    const completed = await prisma.$transaction(async (tx) => {
      for (const item of sale.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } }
        });
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            type: "SALE",
            quantity: item.quantity,
            reason: `Venda ${sale.id}`
          }
        });
      }

      await tx.financialTransaction.create({
        data: {
          type: "INCOME",
          amount: sale.totalValue,
          description: `Venda de produtos ${sale.id}`
        }
      });

      if (sale.barberId && commissionAmount > 0) {
        await tx.employeeCommission.create({
          data: {
            barberId: sale.barberId,
            saleId: sale.id,
            amount: commissionAmount,
            percentage: PRODUCT_PROFIT_COMMISSION_PERCENT.toFixed(2)
          }
        });
      }

      return tx.sale.update({
        where: { id: sale.id },
        data: { status: "COMPLETED", completedAt: new Date() }
      });
    });

    await createAuditLog({ userId: session.user.id, action: "SALE_COMPLETE", entity: "Sale", entityId: sale.id });
    return NextResponse.json({ sale: completed });
  } catch {
    return NextResponse.json({ message: "Nao foi possivel alterar o pedido agora." }, { status: 500 });
  }
}
