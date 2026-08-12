"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ExpenseCategoryOption = {
  id: string;
  name: string;
};

const paymentOptions = [
  { value: "PIX", label: "PIX" },
  { value: "CASH", label: "Dinheiro" },
  { value: "DEBIT_CARD", label: "Cartao de debito" },
  { value: "CREDIT_CARD", label: "Cartao de credito" },
  { value: "BANK_TRANSFER", label: "Transferencia" }
];

function parseMoney(value: string) {
  const normalized = value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value;
  return Number(normalized) || 0;
}

export function BarberExpenseRequestForm({ categories }: { categories: ExpenseCategoryOption[] }) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("PIX");
  const [notes, setNotes] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function submit() {
    setFeedback(null);

    const parsedAmount = parseMoney(amount);
    if (name.trim().length < 2) {
      setFeedback("Informe o nome da despesa.");
      return;
    }
    if (parsedAmount <= 0) {
      setFeedback("Informe um valor valido.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/internal/expense-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: categoryId || undefined,
          name: name.trim(),
          amount: parsedAmount,
          paymentMethod,
          notes: notes.trim() || undefined
        })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setFeedback(payload?.message ?? "Nao foi possivel registrar a despesa.");
        return;
      }

      setName("");
      setAmount("");
      setNotes("");
      setFeedback("Despesa registrada. Ela ficara pendente para aprovacao do administrador.");
      router.refresh();
    } catch {
      setFeedback("Falha de conexao ao registrar a despesa.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="rounded-[12px] border border-primary/20 bg-card p-5 shadow-panel md:p-6">
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[10px] border border-primary/30 bg-primary/10 text-primary">
          <ReceiptText className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">Despesa</p>
          <h2 className="mt-1 text-2xl font-black uppercase">Registrar gasto</h2>
          <p className="mt-2 text-sm text-white/60">
            Use para despesas pontuais da barbearia. O administrador precisa aprovar antes de entrar no financeiro.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-bold uppercase text-white/70">Nome da despesa</span>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Agua mineral" />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-bold uppercase text-white/70">Valor</span>
            <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Ex.: 12,00" />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-bold uppercase text-white/70">Categoria</span>
            <select
              className="min-h-12 rounded-[10px] border border-primary/20 bg-black/45 px-4 font-semibold text-white outline-none transition focus:border-primary"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">Sem categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-bold uppercase text-white/70">Forma de pagamento</span>
            <select
              className="min-h-12 rounded-[10px] border border-primary/20 bg-black/45 px-4 font-semibold text-white outline-none transition focus:border-primary"
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
            >
              {paymentOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="grid gap-2">
          <span className="text-sm font-bold uppercase text-white/70">Observacoes</span>
          <textarea
            className="min-h-28 rounded-[10px] border border-primary/20 bg-black/45 px-4 py-3 font-semibold text-white outline-none transition focus:border-primary"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Ex.: comprado durante o expediente, comprovante entregue ao Renato."
          />
        </label>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {feedback ? <p className="rounded-[8px] border border-primary/50 px-4 py-3 text-sm font-bold text-primary">{feedback}</p> : <span />}
          <Button type="button" onClick={submit} disabled={isLoading}>
            {isLoading ? "Registrando..." : "Registrar despesa"}
          </Button>
        </div>
      </div>
    </section>
  );
}
