"use client";

import { type FormEvent, useState } from "react";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const inputLabelClass = "grid gap-2 text-sm font-bold uppercase tracking-[0.05em] text-white";
const selectClass =
  "h-[58px] rounded-[10px] border border-primary/20 bg-black/35 px-4 text-base text-white outline-none transition focus:border-primary/80";

export function BootstrapForm() {
  const [role, setRole] = useState<"BARBER" | "ADMIN" | "DEVELOPER">("BARBER");
  const [active, setActive] = useState(true);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setIsSubmitting(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch("/api/internal/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(formData.get("name") ?? ""),
          email: String(formData.get("email") ?? ""),
          password: String(formData.get("password") ?? ""),
          phone: String(formData.get("phone") ?? ""),
          role,
          photo: String(formData.get("photo") ?? ""),
          specialty: String(formData.get("specialty") ?? ""),
          active,
          serviceCommissionPercent: Number(formData.get("serviceCommissionPercent") ?? 50),
          productCommissionPercent: Number(formData.get("productCommissionPercent") ?? 20)
        })
      });

      const payload = await response.json().catch(() => null);

      setFeedback({
        type: response.ok ? "success" : "error",
        message: payload?.message ?? (response.ok ? "Conta interna criada." : "Nao foi possivel criar a conta.")
      });

      if (response.ok) {
        form.reset();
        setRole("BARBER");
        setActive(true);
      }
    } catch {
      setFeedback({ type: "error", message: "Nao foi possivel conectar ao servidor agora." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 grid gap-5">
      <label className={inputLabelClass}>
        Nome
        <Input name="name" required placeholder="Nome completo" />
      </label>

      <div className="grid gap-5 md:grid-cols-2">
        <label className={inputLabelClass}>
          E-mail
          <Input name="email" type="email" required placeholder="email@exemplo.com" />
        </label>
        <label className={inputLabelClass}>
          Senha temporaria
          <Input name="password" type="password" required placeholder="Minimo de 8 caracteres" />
        </label>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <label className={inputLabelClass}>
          Telefone
          <Input name="phone" placeholder="(00) 00000-0000" />
        </label>
        <label className={inputLabelClass}>
          Cargo
          <select className={selectClass} value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
            <option value="BARBER">Barbeiro</option>
            <option value="ADMIN">Administrador</option>
            <option value="DEVELOPER">Desenvolvedor</option>
          </select>
        </label>
      </div>

      {role === "BARBER" ? (
        <div className="grid gap-5 md:grid-cols-2">
          <label className={inputLabelClass}>
            Especialidade
            <Input name="specialty" placeholder="Ex: Degrade, barba e platinado" />
          </label>
          <label className={inputLabelClass}>
            Foto
            <Input name="photo" type="url" placeholder="https://..." />
          </label>
          <label className={inputLabelClass}>
            Comissao servicos (%)
            <Input name="serviceCommissionPercent" type="number" min="0" max="100" step="0.01" defaultValue="50" />
          </label>
          <label className={inputLabelClass}>
            Comissao produtos (%)
            <Input name="productCommissionPercent" type="number" min="0" max="100" step="0.01" defaultValue="20" />
          </label>
        </div>
      ) : null}

      <label className="flex items-center gap-3 text-sm font-bold uppercase tracking-[0.05em] text-white">
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
          className="h-5 w-5 rounded border-primary/30 bg-black accent-primary"
        />
        Usuario ativo
      </label>

      {feedback ? (
        <p
          className={
            feedback.type === "success"
              ? "rounded-[10px] border border-primary/45 bg-primary/10 p-4 text-primary"
              : "rounded-[10px] border border-red-500/45 bg-red-500/10 p-4 text-red-200"
          }
        >
          {feedback.message}
        </p>
      ) : null}

      <Button type="submit" disabled={isSubmitting} className="w-full">
        <ShieldCheck className="h-5 w-5" />
        {isSubmitting ? "Sincronizando..." : "Criar acesso interno"}
        <ArrowRight className="h-5 w-5" />
      </Button>

      {feedback?.type === "success" ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-white/65">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          A senha foi enviada apenas ao Supabase Auth. Nenhuma senha foi salva no Prisma.
        </p>
      ) : null}
    </form>
  );
}
