"use client";

import { useState } from "react";
import { AlertTriangle, Download, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";

type ExpenseCategory = {
  id: string;
  name: string;
};

type ExpenseItem = {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string;
  amount: number;
  dueDate: string;
  paidAt: string;
  paymentMethod: string;
  status: "PENDING" | "PAID" | "OVERDUE" | "CANCELED";
  notes: string;
};

type ExpenseStatus = ExpenseItem["status"];

type ExpenseForm = {
  expenseId: string;
  categoryId: string;
  name: string;
  description: string;
  amount: number;
  dueDate: string;
  paidAt: string;
  paymentMethod: string;
  status: ExpenseStatus;
  notes: string;
};

type FinanceExpensePanelProps = {
  categories: ExpenseCategory[];
  expenses: ExpenseItem[];
  monthRevenue: number;
  monthExpenses: number;
  annualRevenue: number;
  annualExpenses: number;
  overdueCount: number;
  dueTodayCount: number;
  dueSoonCount: number;
};

const emptyExpense: ExpenseForm = {
  expenseId: "",
  categoryId: "",
  name: "",
  description: "",
  amount: 0,
  dueDate: "",
  paidAt: "",
  paymentMethod: "PIX",
  status: "PENDING",
  notes: ""
};

const inputClass =
  "min-h-12 rounded-[10px] border border-primary/20 bg-black/45 px-4 text-base font-semibold text-white outline-none transition focus:border-primary";

function parseNumber(value: string) {
  return Number(value.replace(",", ".")) || 0;
}

export function FinanceExpensePanel({
  categories,
  expenses,
  monthRevenue,
  monthExpenses,
  annualRevenue,
  annualExpenses,
  overdueCount,
  dueTodayCount,
  dueSoonCount
}: FinanceExpensePanelProps) {
  const [form, setForm] = useState({ ...emptyExpense, categoryId: categories[0]?.id ?? "" });
  const [message, setMessage] = useState("");

  function selectExpense(id: string) {
    const expense = expenses.find((item) => item.id === id);
    if (!expense) {
      setForm({ ...emptyExpense, categoryId: categories[0]?.id ?? "" });
      return;
    }

    setForm({
      expenseId: expense.id,
      categoryId: expense.categoryId,
      name: expense.name,
      description: expense.description,
      amount: expense.amount,
      dueDate: expense.dueDate,
      paidAt: expense.paidAt,
      paymentMethod: expense.paymentMethod || "PIX",
      status: expense.status,
      notes: expense.notes
    });
  }

  async function requestExpense(method: "POST" | "PATCH" | "DELETE", body: unknown) {
    setMessage("");
    const response = await fetch("/api/internal/expenses", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.message ?? "Não foi possível salvar a despesa.");
      return;
    }
    setMessage("Despesa salva com sucesso.");
    window.setTimeout(() => window.location.reload(), 700);
  }

  return (
    <section className="mt-8 rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">Financeiro</p>
          <h2 className="mt-2 text-2xl font-black uppercase">Despesas e relatórios</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/api/internal/reports/export?format=csv" className="inline-flex rounded-[10px] border border-primary/40 px-4 py-3 text-sm font-black uppercase text-primary">
            <Download className="mr-2 h-4 w-4" />
            Excel
          </a>
          <a href="/api/internal/reports/export?format=html" target="_blank" rel="noreferrer" className="inline-flex rounded-[10px] border border-primary/40 px-4 py-3 text-sm font-black uppercase text-primary">
            <Download className="mr-2 h-4 w-4" />
            PDF
          </a>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          ["Receita do mês", monthRevenue],
          ["Despesas do mês", monthExpenses],
          ["Lucro líquido do mês", monthRevenue - monthExpenses],
          ["Receita anual", annualRevenue],
          ["Despesas anuais", annualExpenses],
          ["Lucro anual", annualRevenue - annualExpenses]
        ].map(([label, value]) => (
          <article key={String(label)} className="rounded-[10px] border border-white/10 bg-black/30 p-4">
            <p className="text-sm uppercase tracking-[0.12em] text-white/55">{label}</p>
            <strong className="mt-2 block text-2xl text-primary">{formatCurrency(Number(value))}</strong>
          </article>
        ))}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {[
          ["Contas vencidas", overdueCount],
          ["Vencendo hoje", dueTodayCount],
          ["Próximos 7 dias", dueSoonCount]
        ].map(([label, value]) => (
          <div key={String(label)} className="flex items-center justify-between rounded-[10px] border border-red-500/30 bg-red-500/10 px-4 py-3">
            <span className="flex items-center gap-2 font-bold uppercase text-white/80">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              {label}
            </span>
            <strong className="text-xl text-red-300">{value}</strong>
          </div>
        ))}
      </div>

      {message ? <div className="mt-5 rounded-[10px] border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-bold text-primary">{message}</div> : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <div className="rounded-[10px] border border-white/10 bg-black/30 p-4">
          <select className={`${inputClass} w-full`} value={form.expenseId} onChange={(event) => selectExpense(event.target.value)}>
            <option value="">Nova despesa</option>
            {expenses.map((expense) => (
              <option key={expense.id} value={expense.id}>
                {expense.name} - {formatCurrency(expense.amount)}
              </option>
            ))}
          </select>
          <div className="mt-4 grid max-h-96 gap-3 overflow-auto pr-1">
            {expenses.map((expense) => (
              <article key={expense.id} className="rounded-[8px] border border-white/10 bg-black/30 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black uppercase">{expense.name}</p>
                    <p className="text-white/55">{expense.categoryName || "Sem categoria"}</p>
                  </div>
                  <strong className="text-primary">{formatCurrency(expense.amount)}</strong>
                </div>
                <p className="mt-2 text-white/55">Vencimento: {expense.dueDate || "Não informado"}</p>
                <span className="mt-2 inline-flex rounded-full border border-white/10 px-3 py-1 text-xs font-black uppercase text-white/70">
                  {expense.status}
                </span>
              </article>
            ))}
          </div>
        </div>

        <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void requestExpense(form.expenseId ? "PATCH" : "POST", form); }}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
              Nome
              <input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
              Categoria
              <select className={inputClass} value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
              Valor
              <input className={inputClass} value={form.amount} onChange={(event) => setForm({ ...form, amount: parseNumber(event.target.value) })} />
            </label>
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
              Vencimento
              <input className={inputClass} type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} />
            </label>
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
              Pagamento
              <input className={inputClass} type="date" value={form.paidAt} onChange={(event) => setForm({ ...form, paidAt: event.target.value })} />
            </label>
            <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
              Status
              <select className={inputClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as typeof form.status })}>
                <option value="PENDING">Pendente</option>
                <option value="PAID">Pago</option>
                <option value="OVERDUE">Atrasado</option>
                <option value="CANCELED">Cancelado</option>
              </select>
            </label>
          </div>
          <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
            Observações
            <textarea className={`${inputClass} min-h-24 py-3`} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </label>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" className="bg-primary text-black hover:bg-primary/90">
              <ReceiptText className="mr-2 h-4 w-4" />
              Salvar despesa
            </Button>
            {form.expenseId ? <Button type="button" variant="outline" onClick={() => void requestExpense("DELETE", { expenseId: form.expenseId })}>Excluir</Button> : null}
          </div>
        </form>
      </div>
    </section>
  );
}
