import type { Prisma } from "@prisma/client";

export class LinkedPayoutExpenseError extends Error {
  constructor() {
    super("Despesa vinculada a repasse de assinatura. Alteracao, exclusao ou ocultacao deve ocorrer pelo fluxo financeiro de ajuste.");
  }
}

/** Protege tambem registros ocultos: o vinculo financeiro nao depende da lista da UI. */
export async function assertExpenseNotLinkedToPayout(db: Prisma.TransactionClient, expenseIds: string[]) {
  const linked = await db.subscriptionPayout.findFirst({ where: { expenseId: { in: expenseIds } }, select: { id: true } });
  if (linked) throw new LinkedPayoutExpenseError();
}
