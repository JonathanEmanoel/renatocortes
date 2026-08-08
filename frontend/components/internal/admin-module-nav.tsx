import Link from "next/link";
import { BarChart3, CalendarDays, ClipboardList, Crown, Package, Scissors, Settings, UserCog, UserRound, Wallet } from "lucide-react";

const modules = [
  { href: "/admin/agendamentos", label: "Agendamentos", icon: CalendarDays },
  { href: "/admin/assinaturas", label: "Assinaturas", icon: Crown },
  { href: "/admin/pedidos", label: "Pedidos", icon: ClipboardList },
  { href: "/admin/produtos", label: "Produtos", icon: Package },
  { href: "/admin/servicos", label: "Servicos", icon: Scissors },
  { href: "/admin/financeiro", label: "Financeiro", icon: Wallet },
  { href: "/admin/relatorios", label: "Relatorios", icon: BarChart3 },
  { href: "/admin/equipe", label: "Equipe", icon: UserCog },
  { href: "/admin/disponibilidade", label: "Disponibilidade", icon: CalendarDays },
  { href: "/admin/perfil", label: "Perfil", icon: UserRound },
  { href: "/admin/configuracoes", label: "Planos e configuracoes", icon: Settings }
];

export function AdminModuleNav() {
  return (
    <nav className="mt-8 rounded-[12px] border border-primary/20 bg-card p-4 shadow-panel">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {modules.map((module) => (
          <Link
            key={module.href}
            href={module.href}
            className="flex min-h-14 items-center gap-3 rounded-[10px] border border-white/10 bg-black/30 px-4 py-3 text-sm font-black uppercase text-white/75 transition hover:border-primary/50 hover:text-primary"
          >
            <module.icon className="h-5 w-5 text-primary" />
            {module.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
