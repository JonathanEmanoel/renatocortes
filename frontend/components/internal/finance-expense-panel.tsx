"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  Check,
  ChevronDown,
  Download,
  PiggyBank,
  ReceiptText,
  Trash2,
  TrendingDown,
  TrendingUp,
  WalletCards
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/utils/cn";

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
  createdByName: string;
};

type ExpenseStatus = ExpenseItem["status"];
type PaymentMethod = "CASH" | "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "BANK_TRANSFER";

type ExpenseForm = {
  expenseId: string;
  categoryId: string;
  name: string;
  description: string;
  amount: string;
  dueDate: string;
  paidAt: string;
  paymentMethod: PaymentMethod;
  status: ExpenseStatus;
  notes: string;
};

type FinanceExpensePanelProps = {
  categories: ExpenseCategory[];
  expenses: ExpenseItem[];
  periodFilter: {
    period: string;
    date: string;
    month: string;
    startDate: string;
    endDate: string;
    label: string;
  };
  periodRevenue: number;
  periodExpenses: number;
  annualRevenue: number;
  annualExpenses: number;
  overdueCount: number;
  dueTodayCount: number;
  dueSoonCount: number;
};

type SelectOption = {
  value: string;
  label: string;
  detail?: string;
};

const inputClass =
  "min-h-12 w-full rounded-[10px] border border-primary/20 bg-black/45 px-4 text-base font-semibold text-white outline-none transition focus:border-primary";

const paymentOptions: SelectOption[] = [
  { value: "PIX", label: "PIX" },
  { value: "CASH", label: "Dinheiro" },
  { value: "DEBIT_CARD", label: "Cartao de debito" },
  { value: "CREDIT_CARD", label: "Cartao de credito" },
  { value: "BANK_TRANSFER", label: "Transferencia" }
];

const statusOptions: SelectOption[] = [
  { value: "PENDING", label: "Pendente" },
  { value: "PAID", label: "Pago" },
  { value: "OVERDUE", label: "Atrasado" },
  { value: "CANCELED", label: "Cancelado" }
];

const emptyExpense: ExpenseForm = {
  expenseId: "",
  categoryId: "",
  name: "",
  description: "",
  amount: "0,00",
  dueDate: "",
  paidAt: "",
  paymentMethod: "PIX",
  status: "PENDING",
  notes: ""
};

function parseNumber(value: string) {
  const normalized = value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value;
  return Number(normalized) || 0;
}

function moneyInput(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function statusLabel(status: ExpenseStatus) {
  return statusOptions.find((option) => option.value === status)?.label ?? status;
}

function SelectControl({
  label,
  value,
  options,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <div className="relative grid min-w-0 gap-2 text-sm font-bold uppercase text-white/70">
      <span>{label}</span>
      <button
        type="button"
        aria-expanded={open}
        className={cn(inputClass, "flex items-center justify-between gap-3 text-left")}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0">
          <span className="block truncate">{selected?.label ?? placeholder ?? "Selecione"}</span>
          {selected?.detail ? <span className="block truncate text-xs font-semibold normal-case text-white/45">{selected.detail}</span> : null}
        </span>
        <ChevronDown className={cn("h-6 w-6 shrink-0 transition", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-80 overflow-auto rounded-[10px] border border-primary/35 bg-[#111] p-2 shadow-panel">
          {options.map((option) => {
            const selectedOption = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-[8px] px-4 py-3 text-left text-base font-black normal-case text-white transition hover:bg-primary hover:text-black",
                  selectedOption && "bg-primary text-black"
                )}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate">{option.label}</span>
                  {option.detail ? <span className={cn("block truncate text-xs font-semibold", selectedOption ? "text-black/60" : "text-white/45")}>{option.detail}</span> : null}
                </span>
                {selectedOption ? <Check className="h-5 w-5 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function FinanceExpensePanel({
  categories,
  expenses,
  periodFilter,
  periodRevenue,
  periodExpenses,
  annualRevenue,
  annualExpenses,
  overdueCount,
  dueTodayCount,
  dueSoonCount
}: FinanceExpensePanelProps) {
  const router = useRouter();
  const [form, setForm] = useState<ExpenseForm>({ ...emptyExpense, categoryId: categories[0]?.id ?? "" });
  const [isOneOff, setIsOneOff] = useState(false);
  const [message, setMessage] = useState("");

  const categoryOptions = useMemo<SelectOption[]>(
    () => [
      { value: "", label: "Sem categoria", detail: "Use quando a despesa ainda nao tiver grupo definido" },
      ...categories.map((category) => ({ value: category.id, label: category.name }))
    ],
    [categories]
  );

  const expenseOptions = useMemo<SelectOption[]>(
    () => [
      { value: "", label: "Nova despesa", detail: "Cadastrar nova conta ou custo" },
      ...expenses.map((expense) => ({
        value: expense.id,
        label: expense.name,
        detail: `${formatCurrency(expense.amount)} - ${statusLabel(expense.status)}`
      }))
    ],
    [expenses]
  );

  const pendingAmount = expenses
    .filter((expense) => expense.status === "PENDING" || expense.status === "OVERDUE")
    .reduce((sum, expense) => sum + expense.amount, 0);
  const pendingApprovalExpenses = expenses.filter((expense) => expense.status === "PENDING");
  const paidAmount = expenses.filter((expense) => expense.status === "PAID").reduce((sum, expense) => sum + expense.amount, 0);
  const monthProfit = periodRevenue - periodExpenses;
  const annualProfit = annualRevenue - annualExpenses;
  const monthMargin = periodRevenue > 0 ? (monthProfit / periodRevenue) * 100 : 0;
  const exportQuery = `period=${periodFilter.period}&date=${periodFilter.date}&month=${periodFilter.month}&startDate=${periodFilter.startDate}&endDate=${periodFilter.endDate}`;

  function resetForm() {
    setMessage("");
    setIsOneOff(false);
    setForm({ ...emptyExpense, categoryId: categories[0]?.id ?? "" });
  }

  function startOneOffExpense() {
    setMessage("");
    setIsOneOff(true);
    setForm({
      ...emptyExpense,
      categoryId: categories[0]?.id ?? "",
      paidAt: todayInputValue(),
      status: "PAID"
    });
  }

  function toggleOneOff(checked: boolean) {
    setIsOneOff(checked);
    setForm((current) => ({
      ...current,
      dueDate: checked ? "" : current.dueDate,
      paidAt: checked && !current.paidAt ? todayInputValue() : current.paidAt,
      status: checked && current.status === "PENDING" ? "PAID" : current.status
    }));
  }

  function selectExpense(id: string) {
    const expense = expenses.find((item) => item.id === id);
    if (!expense) {
      resetForm();
      return;
    }

    setMessage("");
    setIsOneOff(!expense.dueDate);
    setForm({
      expenseId: expense.id,
      categoryId: expense.categoryId,
      name: expense.name,
      description: expense.description,
      amount: moneyInput(expense.amount),
      dueDate: expense.dueDate,
      paidAt: expense.paidAt,
      paymentMethod: (expense.paymentMethod || "PIX") as PaymentMethod,
      status: expense.status,
      notes: expense.notes
    });
  }

  function expensePayload() {
    const paidAt = form.status === "PAID" ? form.paidAt || todayInputValue() : form.paidAt || undefined;

    return {
      ...(form.expenseId ? { expenseId: form.expenseId } : {}),
      categoryId: form.categoryId || undefined,
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      amount: parseNumber(form.amount),
      dueDate: isOneOff ? undefined : form.dueDate || undefined,
      paidAt,
      paymentMethod: form.paymentMethod,
      status: form.status,
      notes: form.notes.trim() || undefined
    };
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
      setMessage(data.message ?? "Nao foi possivel salvar a despesa.");
      return;
    }
    setMessage(method === "DELETE" ? "Despesa excluida com sucesso." : "Despesa salva com sucesso.");
    if (method === "DELETE") resetForm();
    router.refresh();
  }

  async function reviewExpense(expense: ExpenseItem, status: "PAID" | "CANCELED") {
    await requestExpense("PATCH", {
      expenseId: expense.id,
      categoryId: expense.categoryId || undefined,
      name: expense.name,
      description: expense.description || undefined,
      amount: expense.amount,
      dueDate: expense.dueDate || undefined,
      paidAt: status === "PAID" ? todayInputValue() : undefined,
      paymentMethod: expense.paymentMethod || "PIX",
      status,
      notes: expense.notes || undefined
    });
  }

  return (
    <section className="mt-8 rounded-[12px] border border-primary/20 bg-card p-4 shadow-panel sm:p-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">Financeiro</p>
          <h2 className="mt-2 text-2xl font-black uppercase">Despesas e relatorios</h2>
          <p className="mt-2 max-w-2xl text-sm text-white/55">
            Controle contas fixas, custos avulsos e alertas de vencimento para manter a barbearia com fluxo de caixa previsivel.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={startOneOffExpense}>
            <ReceiptText className="mr-2 h-4 w-4" />
            Despesa pontual
          </Button>
          <a href={`/api/internal/reports/export?format=csv&${exportQuery}`} className="inline-flex min-h-11 items-center rounded-[10px] border border-primary/40 px-4 text-sm font-black uppercase text-primary transition hover:bg-primary hover:text-black">
            <Download className="mr-2 h-4 w-4" />
            Excel
          </a>
          <a href={`/api/internal/reports/export?format=html&${exportQuery}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-[10px] border border-primary/40 px-4 text-sm font-black uppercase text-primary transition hover:bg-primary hover:text-black">
            <Download className="mr-2 h-4 w-4" />
            PDF
          </a>
        </div>
      </div>

      <form className="mt-6 rounded-[10px] border border-white/10 bg-black/25 p-4" action="/admin/financeiro">
        <div className="grid gap-4 md:grid-cols-5">
          <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
            Periodo
            <select name="period" defaultValue={periodFilter.period} className={inputClass}>
              <option value="day">Dia</option>
              <option value="week">Semana</option>
              <option value="month">Mes</option>
              <option value="custom">Personalizado</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
            Dia
            <input name="date" type="date" defaultValue={periodFilter.date} className={inputClass} />
          </label>
          <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
            Mes
            <input name="month" type="month" defaultValue={periodFilter.month} className={inputClass} />
          </label>
          <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
            Inicio
            <input name="startDate" type="date" defaultValue={periodFilter.startDate} className={inputClass} />
          </label>
          <label className="grid gap-2 text-sm font-bold uppercase text-white/70">
            Fim
            <input name="endDate" type="date" defaultValue={periodFilter.endDate} className={inputClass} />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="submit">Aplicar periodo</Button>
          <Link href="/admin/financeiro" className="inline-flex min-h-11 items-center rounded-[10px] border border-primary/40 px-4 text-sm font-black uppercase text-primary transition hover:bg-primary hover:text-black">
            Limpar periodo
          </Link>
          <span className="text-sm font-bold text-white/55">{periodFilter.label}</span>
        </div>
      </form>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Receita do periodo", value: periodRevenue, icon: TrendingUp },
          { label: "Despesas do periodo", value: periodExpenses, icon: TrendingDown },
          { label: "Lucro liquido", value: monthProfit, icon: PiggyBank },
          { label: "Margem do periodo", value: `${monthMargin.toFixed(1).replace(".", ",")}%`, icon: Banknote }
        ].map((card) => (
          <article key={card.label} className="rounded-[10px] border border-white/10 bg-black/30 p-4">
            <card.icon className="h-5 w-5 text-primary" />
            <p className="mt-3 text-sm uppercase tracking-[0.12em] text-white/55">{card.label}</p>
            <strong className="mt-2 block text-2xl text-primary">{typeof card.value === "number" ? formatCurrency(card.value) : card.value}</strong>
          </article>
        ))}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Receita anual", value: annualRevenue },
          { label: "Despesas anuais", value: annualExpenses },
          { label: "Lucro anual", value: annualProfit },
          { label: "Em aberto", value: pendingAmount }
        ].map((card) => (
          <article key={card.label} className="rounded-[10px] border border-white/10 bg-black/20 p-4">
            <p className="text-sm uppercase tracking-[0.12em] text-white/45">{card.label}</p>
            <strong className="mt-2 block text-xl text-white">{formatCurrency(card.value)}</strong>
          </article>
        ))}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        {[
          ["Contas vencidas", overdueCount],
          ["Vencendo hoje", dueTodayCount],
          ["Proximos 7 dias", dueSoonCount],
          ["Pagas no filtro", formatCurrency(paidAmount)]
        ].map(([label, value]) => (
          <div key={String(label)} className="flex items-center justify-between gap-3 rounded-[10px] border border-red-500/30 bg-red-500/10 px-4 py-3">
            <span className="flex min-w-0 items-center gap-2 font-bold uppercase text-white/80">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
              <span className="truncate">{label}</span>
            </span>
            <strong className="shrink-0 text-lg text-red-300">{value}</strong>
          </div>
        ))}
      </div>

      {message ? <div className="mt-5 rounded-[10px] border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-bold text-primary">{message}</div> : null}

      {pendingApprovalExpenses.length > 0 ? (
        <section className="mt-6 rounded-[12px] border border-primary/25 bg-primary/5 p-4 sm:p-5">
          <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">Aprovacao</p>
              <h3 className="mt-1 text-xl font-black uppercase">Despesas pendentes dos barbeiros</h3>
              <p className="mt-1 text-sm text-white/55">Aprove somente os gastos que devem entrar no financeiro da barbearia.</p>
            </div>
            <strong className="text-primary">{pendingApprovalExpenses.length} pendente(s)</strong>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {pendingApprovalExpenses.map((expense) => (
              <article key={expense.id} className="rounded-[10px] border border-white/10 bg-black/35 p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <p className="truncate font-black uppercase">{expense.name}</p>
                    <p className="mt-1 text-sm text-white/55">
                      Registrado por {expense.createdByName || "usuario interno"}{expense.categoryName ? ` - ${expense.categoryName}` : ""}
                    </p>
                    {expense.notes ? <p className="mt-2 text-sm text-white/60">{expense.notes}</p> : null}
                  </div>
                  <strong className="shrink-0 text-xl text-primary">{formatCurrency(expense.amount)}</strong>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" className="bg-primary text-black hover:bg-primary/90" onClick={() => void reviewExpense(expense, "PAID")}>
                    Aprovar
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void reviewExpense(expense, "CANCELED")}>
                    Recusar
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="min-w-0 rounded-[10px] border border-white/10 bg-black/30 p-4">
          <SelectControl label="Despesa" value={form.expenseId} options={expenseOptions} onChange={selectExpense} />
          <div className="mt-4 grid max-h-[34rem] gap-3 overflow-auto pr-1">
            {expenses.length === 0 ? <p className="rounded-[8px] border border-white/10 p-4 text-sm text-white/60">Nenhuma despesa cadastrada.</p> : null}
            {expenses.map((expense) => (
              <button
                type="button"
                key={expense.id}
                onClick={() => selectExpense(expense.id)}
                className={cn(
                  "rounded-[8px] border p-3 text-left text-sm transition hover:border-primary/50",
                  form.expenseId === expense.id ? "border-primary/60 bg-primary/10" : "border-white/10 bg-black/30"
                )}
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-black uppercase">{expense.name}</p>
                    <p className="truncate text-white/55">{expense.categoryName || "Sem categoria"}</p>
                  </div>
                  <strong className="shrink-0 text-primary">{formatCurrency(expense.amount)}</strong>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold uppercase">
                  <span className="rounded-full border border-white/10 px-3 py-1 text-white/70">{statusLabel(expense.status)}</span>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-white/55">
                    <CalendarClock className="mr-1 inline h-3 w-3" />
                    {expense.dueDate || "Sem vencimento"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <form className="grid min-w-0 gap-5" onSubmit={(event) => { event.preventDefault(); void requestExpense(form.expenseId ? "PATCH" : "POST", expensePayload()); }}>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">{form.expenseId ? "Edicao" : "Nova"}</p>
            <h3 className="mt-1 truncate text-2xl font-black uppercase">{form.expenseId ? `Editando: ${form.name || "despesa"}` : "Nova despesa"}</h3>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-primary/20 bg-primary/10 p-4 text-sm text-white/75 transition hover:border-primary/45">
            <input
              type="checkbox"
              checked={isOneOff}
              onChange={(event) => toggleOneOff(event.target.checked)}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <span className="min-w-0">
              <span className="block font-black uppercase text-primary">Despesa pontual, sem vencimento</span>
              <span className="mt-1 block text-white/55">
                Use para compras avulsas como agua mineral, material de limpeza, cafe ou reposicoes pequenas.
              </span>
            </span>
          </label>

          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <label className="grid min-w-0 gap-2 text-sm font-bold uppercase text-white/70">
              Nome da despesa
              <input className={inputClass} placeholder="Ex.: Aluguel, agua, energia" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <SelectControl label="Categoria" value={form.categoryId} options={categoryOptions} onChange={(value) => setForm({ ...form, categoryId: value })} />

            <label className="grid min-w-0 gap-2 text-sm font-bold uppercase text-white/70">
              Valor
              <div className="flex min-w-0 items-center rounded-[10px] border border-primary/20 bg-black/45 px-4 focus-within:border-primary">
                <WalletCards className="h-5 w-5 shrink-0 text-primary" />
                <input className="min-h-12 w-full min-w-0 bg-transparent px-3 text-base font-semibold text-white outline-none" inputMode="decimal" placeholder="Ex.: 120,00" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
              </div>
            </label>

            <SelectControl label="Status" value={form.status} options={statusOptions} onChange={(value) => setForm({ ...form, status: value as ExpenseStatus })} />

            {isOneOff ? (
              <div className="grid min-w-0 gap-2 text-sm font-bold uppercase text-white/70">
                Vencimento
                <div className="flex min-h-12 items-center rounded-[10px] border border-primary/20 bg-black/30 px-4 text-base font-semibold normal-case text-white/55">
                  Sem vencimento
                </div>
              </div>
            ) : (
              <label className="grid min-w-0 gap-2 text-sm font-bold uppercase text-white/70">
                Vencimento opcional
                <input className={inputClass} type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} />
              </label>
            )}
            <label className="grid min-w-0 gap-2 text-sm font-bold uppercase text-white/70">
              Data de pagamento
              <input className={inputClass} type="date" value={form.paidAt} onChange={(event) => setForm({ ...form, paidAt: event.target.value })} />
            </label>

            <SelectControl label="Forma de pagamento" value={form.paymentMethod} options={paymentOptions} onChange={(value) => setForm({ ...form, paymentMethod: value as PaymentMethod })} />

            <label className="grid min-w-0 gap-2 text-sm font-bold uppercase text-white/70">
              Descricao opcional
              <input className={inputClass} placeholder="Ex.: Conta fixa mensal" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </label>
          </div>

          <label className="grid min-w-0 gap-2 text-sm font-bold uppercase text-white/70">
            Observacoes
            <textarea className={`${inputClass} min-h-24 py-3`} placeholder="Detalhes de comprovante, recorrencia, fornecedor ou observacoes internas." value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </label>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" className="bg-primary text-black hover:bg-primary/90">
              <ReceiptText className="mr-2 h-4 w-4" />
              {form.expenseId ? "Salvar alteracoes" : "Salvar despesa"}
            </Button>
            <Button type="button" variant="outline" onClick={resetForm}>Nova despesa</Button>
            {form.expenseId ? (
              <Button type="button" variant="outline" onClick={() => window.confirm("Excluir esta despesa?") && void requestExpense("DELETE", { expenseId: form.expenseId })}>
                <Trash2 className="h-4 w-4" />
                Excluir
              </Button>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}
