import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import { getFinanceMetrics } from "@/lib/server/finance-rules";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function csvEscape(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const session = await getAuthenticatedUser();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER")) {
    return NextResponse.json({ message: "Acesso não autorizado." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") ?? "csv";
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);

  const [metrics, expenses, completedAppointments, products] = await Promise.all([
    getFinanceMetrics(monthStart, monthEnd),
    prisma.expense.findMany({ where: { paidAt: { gte: monthStart, lt: monthEnd }, status: "PAID", deletedAt: null }, include: { category: true }, orderBy: { paidAt: "asc" } }),
    prisma.appointment.findMany({
      where: { dataHora: { gte: monthStart, lt: monthEnd }, status: "COMPLETED", deletedAt: null },
      include: { service: true, services: { include: { service: true } } }
    }),
    prisma.saleItem.groupBy({
      by: ["productId"],
      where: { sale: { status: "COMPLETED", completedAt: { gte: monthStart, lt: monthEnd }, deletedAt: null } },
      _sum: { quantity: true }
    })
  ]);

  const productNames = await prisma.product.findMany({ where: { id: { in: products.map((item) => item.productId) } } });
  const productsById = new Map(productNames.map((product) => [product.id, product.name]));
  const serviceCounts = new Map<string, { name: string; count: number }>();
  for (const appointment of completedAppointments) {
    const services = appointment.services.length ? appointment.services.map((item) => item.service) : [appointment.service];
    for (const service of services) {
      const current = serviceCounts.get(service.id) ?? { name: service.name, count: 0 };
      serviceCounts.set(service.id, { ...current, count: current.count + 1 });
    }
  }
  const services = Array.from(serviceCounts.values()).sort((a, b) => b.count - a.count);

  if (format === "html") {
    const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Relatório Renato Cortes</title>
  <style>
    body { font-family: Arial, sans-serif; background: #0f0f0f; color: #fff; padding: 32px; }
    h1, h2 { text-transform: uppercase; }
    strong { color: #D4AF37; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #333; padding: 10px; text-align: left; }
    th { color: #D4AF37; }
  </style>
</head>
<body>
  <h1>Relatório financeiro</h1>
  <p>Receita do mês: <strong>${formatCurrency(metrics.grossRevenue)}</strong></p>
  <p>Despesas pagas do mês: <strong>${formatCurrency(metrics.paidExpenses)}</strong></p>
  <p>Lucro líquido: <strong>${formatCurrency(metrics.netProfit)}</strong></p>
  <h2>Despesas</h2>
  <table><thead><tr><th>Nome</th><th>Categoria</th><th>Valor</th><th>Status</th></tr></thead><tbody>
    ${expenses.map((expense) => `<tr><td>${expense.name}</td><td>${expense.category?.name ?? ""}</td><td>${formatCurrency(Number(expense.amount))}</td><td>${expense.status}</td></tr>`).join("")}
  </tbody></table>
  <h2>Serviços mais vendidos</h2>
  <table><thead><tr><th>Serviço</th><th>Quantidade</th></tr></thead><tbody>
    ${services.map((item) => `<tr><td>${item.name}</td><td>${item.count}</td></tr>`).join("")}
  </tbody></table>
  <script>window.print()</script>
</body>
</html>`;

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }

  const rows = [
    ["Tipo", "Nome", "Categoria", "Quantidade", "Valor", "Status"],
    ["Resumo", "Receita do mês", "", "", metrics.grossRevenue, ""],
    ["Resumo", "Despesas pagas do mês", "", "", metrics.paidExpenses, ""],
    ["Resumo", "Lucro líquido", "", "", metrics.netProfit, ""],
    ...expenses.map((expense) => ["Despesa", expense.name, expense.category?.name ?? "", "", Number(expense.amount), expense.status]),
    ...services.map((item) => ["Serviço", item.name, "", item.count, "", ""]),
    ...products.map((item) => ["Produto", productsById.get(item.productId) ?? item.productId, "", item._sum.quantity ?? 0, "", ""])
  ];

  const csv = rows.map((row) => row.map((cell) => csvEscape(cell)).join(";")).join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=relatorio-renato-cortes.csv"
    }
  });
}
