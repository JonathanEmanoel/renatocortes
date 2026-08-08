"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/utils/supabase/client";

export function InternalProfileForm({ user }: { user: { name: string; email: string; phone?: string | null; role: string } }) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function save() {
    setFeedback(null);
    setIsLoading(true);
    try {
      const response = await fetch("/api/internal/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, password })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setFeedback(payload?.message ?? "Nao foi possivel salvar.");
        return;
      }
      setPassword("");
      setFeedback("Perfil atualizado.");
      router.refresh();
    } catch {
      setFeedback("Falha de conexao.");
    } finally {
      setIsLoading(false);
    }
  }

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <section className="rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
      <h2 className="text-xl font-black uppercase">Meu perfil interno</h2>
      <div className="mt-5 grid gap-5">
        <label className="grid gap-2">
          <span className="font-bold uppercase text-white/70">Nome</span>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="grid gap-2">
          <span className="font-bold uppercase text-white/70">E-mail</span>
          <Input value={user.email} disabled />
        </label>
        <label className="grid gap-2">
          <span className="font-bold uppercase text-white/70">Telefone</span>
          <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>
        <label className="grid gap-2">
          <span className="font-bold uppercase text-white/70">Nova senha</span>
          <Input value={password} type="password" onChange={(event) => setPassword(event.target.value)} placeholder="Preencha apenas se quiser alterar" />
        </label>
        <p className="text-sm font-bold uppercase tracking-[0.1em] text-primary">{user.role}</p>
        {feedback ? <p className="rounded-[8px] border border-primary/50 p-3 text-sm text-primary">{feedback}</p> : null}
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={save} disabled={isLoading}>{isLoading ? "Salvando..." : "Salvar perfil"}</Button>
          <Button type="button" variant="outline" onClick={logout}>Sair</Button>
        </div>
      </div>
    </section>
  );
}
