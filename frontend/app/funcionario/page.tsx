"use client";

import { BarChart3, CalendarDays, LogOut, Package, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth-store";

const cards = [
  { title: "Dashboard", icon: BarChart3 },
  { title: "Agenda", icon: CalendarDays },
  { title: "Clientes", icon: Users },
  { title: "Produtos", icon: Package }
];

export default function EmployeePage() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  function handleLogout() {
    logout();
    router.push("/");
  }

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-8 text-white">
      <section className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={user?.name} className="border-primary" />
            <div>
              <p className="text-sm uppercase tracking-[0.16em] text-primary">Painel do funcionário</p>
              <h1 className="text-2xl font-black">{user?.name ?? "Funcionário"}</h1>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Sair">
            <LogOut className="h-6 w-6" />
          </Button>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {cards.map((card) => (
            <article key={card.title} className="rounded-[8px] border border-white/14 bg-card p-6">
              <card.icon className="h-8 w-8 text-primary" />
              <h2 className="mt-5 text-xl font-black uppercase">{card.title}</h2>
              <p className="mt-3 text-white/62">Módulo reservado para as próximas entregas.</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
