import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import { getAuthenticatedClient } from "@/lib/server/auth";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

const requestSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(99)
      })
    )
    .min(1)
});

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedClient();

    if (!session) {
      return NextResponse.json({ message: "Faca login para finalizar o pedido." }, { status: 401 });
    }

    const payload = requestSchema.safeParse(await request.json());

    if (!payload.success) {
      return NextResponse.json({ message: "Confira os produtos do pedido." }, { status: 400 });
    }

    const products = await prisma.product.findMany({
      where: {
        id: { in: payload.data.items.map((item) => item.productId) },
        active: true,
        deletedAt: null
      }
    });

    if (products.length !== payload.data.items.length) {
      return NextResponse.json({ message: "Um ou mais produtos nao estao disponiveis." }, { status: 404 });
    }

    const productById = new Map(products.map((product) => [product.id, product]));
    const items = payload.data.items.map((item) => {
      const product = productById.get(item.productId)!;
      if (product.stock < item.quantity) {
        throw new Error(`Estoque indisponivel para ${product.name}.`);
      }
      return {
        product,
        quantity: item.quantity,
        price: Number(product.price),
        subtotal: Number(product.price) * item.quantity
      };
    });
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);

    const sale = await prisma.sale.create({
      data: {
        clientId: session.client.id,
        status: "OPEN",
        totalValue: total,
        items: {
          create: items.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
            price: item.price
          }))
        }
      }
    });

    const productList = items
      .map((item) => `- ${item.quantity}x ${item.product.name} (${formatCurrency(item.subtotal)})`)
      .join("\n");

    const message = [
      "Ola!",
      "",
      "Gostaria de realizar o seguinte pedido:",
      "",
      "Cliente:",
      "",
      session.user.name || "Nao informado",
      "",
      "Telefone:",
      "",
      session.user.phone || "Nao informado",
      "",
      "Produtos:",
      "",
      productList,
      "",
      "Valor Total:",
      "",
      formatCurrency(total),
      "",
      "Aguardo confirmacao.",
      "",
      "Obrigado!"
    ].join("\n");

    return NextResponse.json({
      saleId: sale.id,
      whatsAppUrl: buildWhatsAppUrl(message)
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Nao foi possivel finalizar o pedido." },
      { status: 500 }
    );
  }
}
