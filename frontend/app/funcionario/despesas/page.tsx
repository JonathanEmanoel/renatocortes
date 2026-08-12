export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { BarberExpenseRequestForm } from "@/components/internal/barber-expense-request-form";
import { InternalPageHeader } from "@/components/internal/internal-page-header";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

export default async function BarberExpensesPage() {
  const session = await getAuthenticatedUser();

  if (!session) redirect("/login?redirectTo=/funcionario/despesas");
  if (session.user.role !== "BARBER" && session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER") redirect("/cliente");
  if (!session.user.barber?.id) redirect("/admin");

  const categories = await prisma.expenseCategory.findMany({
    where: { active: true, deletedAt: null },
    orderBy: { name: "asc" }
  });

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-8 text-white">
      <section className="mx-auto max-w-4xl">
        <InternalPageHeader
          eyebrow="Despesas"
          title="Registrar despesa"
          backHref="/funcionario"
          backLabel="Painel do barbeiro"
          role={session.user.role}
          hasBarber={Boolean(session.user.barber?.id)}
        />

        <div className="mt-8">
          <BarberExpenseRequestForm categories={categories.map((category) => ({ id: category.id, name: category.name }))} />
        </div>
      </section>
    </main>
  );
}
