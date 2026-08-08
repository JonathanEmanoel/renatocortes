import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
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

  const [sales, expenses, services, products] = await Promise.all([
    prisma.sale.findMany({ where: { createdAt: { gte: monthStart }, deletedAt: null }, include: { client: { include: { user: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.expense.findMany({ where: { createdAt: { gte: monthStart }, deletedAt: null }, include: { category: true }, orderBy: { dueDate: "asc" } }),
    prisma.appointment.groupBy({
      by: ["serviceId"],
      where: { createdAt: { gte: monthStart }, deletedAt: null },
      _count: { _all: true }
    }),
    prisma.saleItem.groupBy({
      by: ["productId"],
      where: { sale: { createdAt: { gte: monthStart }, deletedAt: null } },
      _sum: { quantity: true }
    })
  ]);

  const serviceNames = await prisma.service.findMany({ where: { id: { in: services.map((item) => item.serviceId) } } });
  const productNames = await prisma.product.findMany({ where: { id: { in: products.map((item) => item.productId) } } });
  const servicesById = new Map(serviceNames.map((service) => [service.id, service.name]));
  const productsById = new Map(productNames.map((product) => [product.id, product.name]));
  const revenue = sales.reduce((sum, sale) => sum + Number(sale.totalValue), 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);

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
  <p>Receita do mês: <strong>${formatCurrency(revenue)}</strong></p>
  <p>Despesas do mês: <strong>${formatCurrency(expenseTotal)}</strong></p>
  <p>Lucro líquido: <strong>${formatCurrency(revenue - expenseTotal)}</strong></p>
  <h2>Despesas</h2>
  <table><thead><tr><th>Nome</th><th>Categoria</th><th>Valor</th><th>Status</th></tr></thead><tbody>
    ${expenses.map((expense) => `<tr><td>${expense.name}</td><td>${expense.category?.name ?? ""}</td><td>${formatCurrency(Number(expense.amount))}</td><td>${expense.status}</td></tr>`).join("")}
  </tbody></table>
  <h2>Serviços mais vendidos</h2>
  <table><thead><tr><th>Serviço</th><th>Quantidade</th></tr></thead><tbody>
    ${services.map((item) => `<tr><td>${servicesById.get(item.serviceId) ?? item.serviceId}</td><td>${item._count._all}</td></tr>`).join("")}
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
    ["Resumo", "Receita do mês", "", "", revenue, ""],
    ["Resumo", "Despesas do mês", "", "", expenseTotal, ""],
    ["Resumo", "Lucro líquido", "", "", revenue - expenseTotal, ""],
    ...expenses.map((expense) => ["Despesa", expense.name, expense.category?.name ?? "", "", Number(expense.amount), expense.status]),
    ...services.map((item) => ["Serviço", servicesById.get(item.serviceId) ?? item.serviceId, "", item._count._all, "", ""]),
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
