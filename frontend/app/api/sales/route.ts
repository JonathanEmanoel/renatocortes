import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import { getAuthenticatedClient } from "@/lib/server/auth";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

const addressSchema = z.object({
  street: z.string().trim().min(1).max(120),
  number: z.string().trim().min(1).max(20),
  neighborhood: z.string().trim().min(1).max(80),
  complement: z.string().trim().max(80).optional()
});

const requestSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(99)
      })
    )
    .min(1),
  customerName: z.string().trim().min(3).max(120),
  customerPhone: z.string().trim().min(8).max(30),
  deliveryMethod: z.enum(["Retirar na barbearia", "Entrega"]),
  deliveryAddress: addressSchema.optional(),
  observations: z.string().trim().max(500).optional()
});

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedClient().catch(() => null);
    const payload = requestSchema.safeParse(await request.json());

    if (!payload.success) {
      return NextResponse.json({ message: "Confira os dados do pedido." }, { status: 400 });
    }

    if (payload.data.deliveryMethod === "Entrega" && !payload.data.deliveryAddress) {
      return NextResponse.json({ message: "Informe o endereço de entrega." }, { status: 400 });
    }

    const products = await prisma.product.findMany({
      where: {
        id: { in: payload.data.items.map((item) => item.productId) },
        active: true,
        visibleInStore: true,
        deletedAt: null
      }
    });

    if (products.length !== payload.data.items.length) {
      return NextResponse.json({ message: "Um ou mais produtos não estão disponíveis." }, { status: 404 });
    }

    const productById = new Map(products.map((product) => [product.id, product]));
    const items = payload.data.items.map((item) => {
      const product = productById.get(item.productId)!;

      if (product.stock < item.quantity) {
        throw new Error(`Estoque indisponível para ${product.name}.`);
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
        clientId: session?.client.id,
        status: "OPEN",
        totalValue: total,
        customerName: payload.data.customerName,
        customerPhone: payload.data.customerPhone,
        deliveryMethod: payload.data.deliveryMethod,
        deliveryAddress: payload.data.deliveryAddress ?? undefined,
        observations: payload.data.observations,
        items: {
          create: items.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
            price: item.price,
            costPrice: item.product.costPrice
          }))
        }
      }
    });

    const productList = items
      .map((item) => `${item.product.name}\n${item.quantity}x - ${formatCurrency(item.subtotal)}`)
      .join("\n\n");

    const messageParts = [
      "Olá!",
      "",
      "Gostaria de fazer o seguinte pedido:",
      "",
      productList,
      "",
      "Total:",
      formatCurrency(total),
      "",
      "Nome:",
      payload.data.customerName,
      "",
      "Telefone:",
      payload.data.customerPhone,
      "",
      "Forma de recebimento:",
      payload.data.deliveryMethod,
      ""
    ];

    if (payload.data.deliveryMethod === "Entrega" && payload.data.deliveryAddress) {
      messageParts.push("Endereço:");
      messageParts.push(`${payload.data.deliveryAddress.street}, ${payload.data.deliveryAddress.number}`);
      messageParts.push(
        `${payload.data.deliveryAddress.neighborhood}${payload.data.deliveryAddress.complement ? ` - ${payload.data.deliveryAddress.complement}` : ""}`
      );
      messageParts.push("");
    }

    messageParts.push("Observações:");
    messageParts.push(payload.data.observations || "Nenhuma");
    messageParts.push("", "Obrigado!");

    return NextResponse.json({
      saleId: sale.id,
      whatsAppUrl: buildWhatsAppUrl(messageParts.join("\n"))
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível finalizar o pedido." },
      { status: 500 }
    );
  }
}
