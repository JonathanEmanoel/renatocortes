import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/server/audit";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

const expenseRequestSchema = z.object({
  categoryId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(140),
  amount: z.number().positive(),
  paymentMethod: z.enum(["CASH", "PIX", "CREDIT_CARD", "DEBIT_CARD", "BANK_TRANSFER"]).optional(),
  notes: z.string().trim().max(500).optional()
});

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedUser();
    if (!session || (session.user.role !== "BARBER" && session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER")) {
      return NextResponse.json({ message: "Acesso nao autorizado." }, { status: 403 });
    }

    const payload = expenseRequestSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json({ message: "Confira os dados da despesa." }, { status: 400 });
    }

    const expense = await prisma.expense.create({
      data: {
        categoryId: payload.data.categoryId,
        createdById: session.user.id,
        updatedById: session.user.id,
        name: payload.data.name,
        description: "Despesa registrada pelo barbeiro para aprovacao administrativa.",
        amount: payload.data.amount,
        paymentMethod: payload.data.paymentMethod,
        status: "PENDING",
        notes: payload.data.notes
      }
    });

    await createAuditLog({
      userId: session.user.id,
      action: "CREATE_EXPENSE_REQUEST",
      entity: "Expense",
      entityId: expense.id,
      metadata: payload.data
    });

    return NextResponse.json({ expense });
  } catch {
    return NextResponse.json({ message: "Nao foi possivel registrar a despesa agora." }, { status: 500 });
  }
}
