import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/server/audit";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

const expenseSchema = z.object({
  expenseId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(140),
  description: z.string().trim().max(500).optional(),
  amount: z.number().min(0),
  dueDate: z.string().optional(),
  paidAt: z.string().optional(),
  paymentMethod: z.enum(["CASH", "PIX", "CREDIT_CARD", "DEBIT_CARD", "BANK_TRANSFER"]).optional(),
  status: z.enum(["PENDING", "PAID", "OVERDUE", "CANCELED"]).default("PENDING"),
  notes: z.string().trim().max(500).optional()
});

const deleteSchema = z.object({ expenseId: z.string().uuid() });

async function requireManager() {
  const session = await getAuthenticatedUser();
  return session && (session.user.role === "ADMIN" || session.user.role === "DEVELOPER") ? session : null;
}

function toDate(value?: string) {
  return value ? new Date(value) : undefined;
}

function expenseData(payload: z.infer<typeof expenseSchema>, userId: string) {
  const paidAt = payload.status === "PAID" ? toDate(payload.paidAt) ?? new Date() : toDate(payload.paidAt);

  return {
    categoryId: payload.categoryId,
    updatedById: userId,
    name: payload.name,
    description: payload.description,
    amount: payload.amount,
    dueDate: toDate(payload.dueDate),
    paidAt,
    paymentMethod: payload.paymentMethod,
    status: payload.status,
    notes: payload.notes
  };
}

async function registerExpenseTransaction(expenseId: string, amount: number, description: string) {
  const alreadyRegistered = await prisma.financialTransaction.findFirst({
    where: { expenseId, type: "EXPENSE", deletedAt: null }
  });

  if (!alreadyRegistered) {
    await prisma.financialTransaction.create({
      data: {
        expenseId,
        type: "EXPENSE",
        amount,
        description
      }
    });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireManager();
    if (!session) return NextResponse.json({ message: "Acesso não autorizado." }, { status: 403 });

    const payload = expenseSchema.safeParse(await request.json());
    if (!payload.success) return NextResponse.json({ message: "Confira os dados da despesa." }, { status: 400 });

    const expense = await prisma.expense.create({
      data: {
        ...expenseData(payload.data, session.user.id),
        createdById: session.user.id
      }
    });

    if (expense.status === "PAID") {
      await registerExpenseTransaction(expense.id, Number(expense.amount), `Despesa paga: ${expense.name}`);
    }

    await createAuditLog({ userId: session.user.id, action: "CREATE_EXPENSE", entity: "Expense", entityId: expense.id, metadata: payload.data });
    return NextResponse.json({ expense });
  } catch {
    return NextResponse.json({ message: "Não foi possível cadastrar a despesa." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireManager();
    if (!session) return NextResponse.json({ message: "Acesso não autorizado." }, { status: 403 });

    const payload = expenseSchema.safeParse(await request.json());
    if (!payload.success || !payload.data.expenseId) {
      return NextResponse.json({ message: "Confira os dados da despesa." }, { status: 400 });
    }

    const expense = await prisma.expense.update({
      where: { id: payload.data.expenseId },
      data: expenseData(payload.data, session.user.id)
    });

    if (expense.status === "PAID") {
      await registerExpenseTransaction(expense.id, Number(expense.amount), `Despesa paga: ${expense.name}`);
    }

    await createAuditLog({ userId: session.user.id, action: "UPDATE_EXPENSE", entity: "Expense", entityId: expense.id, metadata: payload.data });
    return NextResponse.json({ expense });
  } catch {
    return NextResponse.json({ message: "Não foi possível atualizar a despesa." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireManager();
    if (!session) return NextResponse.json({ message: "Acesso não autorizado." }, { status: 403 });

    const payload = deleteSchema.safeParse(await request.json());
    if (!payload.success) return NextResponse.json({ message: "Informe a despesa." }, { status: 400 });

    const expense = await prisma.expense.update({
      where: { id: payload.data.expenseId },
      data: { deletedAt: new Date(), updatedById: session.user.id }
    });

    await createAuditLog({ userId: session.user.id, action: "DELETE_EXPENSE", entity: "Expense", entityId: expense.id });
    return NextResponse.json({ expense });
  } catch {
    return NextResponse.json({ message: "Não foi possível excluir a despesa." }, { status: 500 });
  }
}
