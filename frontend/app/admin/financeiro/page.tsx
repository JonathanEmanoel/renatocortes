export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { FinanceExpensePanel } from "@/components/internal/finance-expense-panel";
import { InternalPageHeader } from "@/components/internal/internal-page-header";
import { prisma } from "@/lib/prisma";
import { resolvePeriodRange } from "@/lib/server/date-periods";
import { getFinanceMetrics } from "@/lib/server/finance-rules";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminFinancePage({ searchParams }: PageProps) {
  const session = await getAuthenticatedUser();
  if (!session) redirect("/login?redirectTo=/admin/financeiro");
  if (session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER") redirect("/cliente");

  const params = (await searchParams) ?? {};
  const selectedRange = resolvePeriodRange({
    period: firstParam(params.period),
    date: firstParam(params.date),
    month: firstParam(params.month),
    startDate: firstParam(params.startDate),
    endDate: firstParam(params.endDate)
  });
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear() + 1, 0, 1);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const dueSoonEnd = new Date(todayStart);
  dueSoonEnd.setDate(dueSoonEnd.getDate() + 7);

  const periodMetrics = await getFinanceMetrics(selectedRange.start, selectedRange.end);
  const annualMetrics = await getFinanceMetrics(yearStart, yearEnd);
  const [expenseCategories, expenses, overdueExpenses, dueTodayExpenses, dueSoonExpenses] =
    await Promise.all([
      prisma.expenseCategory.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
      prisma.expense.findMany({
        where: {
          deletedAt: null,
          OR: [
            { paidAt: { gte: selectedRange.start, lte: selectedRange.end } },
            { dueDate: { gte: selectedRange.start, lte: selectedRange.end } },
            { createdAt: { gte: selectedRange.start, lte: selectedRange.end } }
          ]
        },
        include: { category: true, createdBy: true },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        take: 80
      }),
      prisma.expense.count({ where: { status: { in: ["PENDING", "OVERDUE"] }, dueDate: { lt: todayStart }, deletedAt: null } }),
      prisma.expense.count({ where: { status: { in: ["PENDING", "OVERDUE"] }, dueDate: { gte: todayStart, lt: todayEnd }, deletedAt: null } }),
      prisma.expense.count({ where: { status: { in: ["PENDING", "OVERDUE"] }, dueDate: { gte: todayStart, lte: dueSoonEnd }, deletedAt: null } })
    ]);

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-8 text-white">
      <section className="mx-auto max-w-7xl">
        <InternalPageHeader
          eyebrow="Financeiro"
          title="Despesas e indicadores"
          backHref="/admin"
          backLabel="Painel administrativo"
          role={session.user.role}
          hasBarber={Boolean(session.user.barber?.id)}
        />
        <FinanceExpensePanel
          categories={expenseCategories.map((category) => ({ id: category.id, name: category.name }))}
          expenses={expenses.map((expense) => ({
            id: expense.id,
            categoryId: expense.categoryId ?? "",
            categoryName: expense.category?.name ?? "",
            name: expense.name,
            description: expense.description ?? "",
            amount: Number(expense.amount),
            dueDate: expense.dueDate ? expense.dueDate.toISOString().slice(0, 10) : "",
            paidAt: expense.paidAt ? expense.paidAt.toISOString().slice(0, 10) : "",
            paymentMethod: expense.paymentMethod ?? "",
            status: expense.status,
            notes: expense.notes ?? "",
            createdByName: expense.createdBy?.name ?? ""
          }))}
          periodFilter={{
            period: selectedRange.period,
            date: selectedRange.date,
            month: selectedRange.month,
            startDate: selectedRange.startDate,
            endDate: selectedRange.endDate,
            label: selectedRange.label
          }}
          periodRevenue={periodMetrics.grossRevenue}
          periodExpenses={periodMetrics.paidExpenses}
          annualRevenue={annualMetrics.grossRevenue}
          annualExpenses={annualMetrics.paidExpenses}
          overdueCount={overdueExpenses}
          dueTodayCount={dueTodayExpenses}
          dueSoonCount={dueSoonExpenses}
        />
      </section>
    </main>
  );
}
