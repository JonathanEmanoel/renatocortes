import Link from "next/link";
import { ArrowLeft, BriefcaseBusiness, LayoutDashboard, UserRound } from "lucide-react";
import type { UserRole } from "@/types/auth";

type InternalPageHeaderProps = {
  eyebrow: string;
  title: string;
  backHref: string;
  backLabel: string;
  role: UserRole;
  hasBarber?: boolean;
};

export function InternalPageHeader({ eyebrow, title, backHref, backLabel, role, hasBarber = false }: InternalPageHeaderProps) {
  const canOpenAdmin = role === "ADMIN" || role === "DEVELOPER";
  const canOpenBarberPanel = hasBarber && role !== "DEVELOPER";

  return (
    <header className="rounded-[12px] border border-primary/20 bg-card p-4 shadow-panel md:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Link href={backHref} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-primary transition hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
          <p className="mt-5 text-sm font-bold uppercase tracking-[0.22em] text-primary">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-black uppercase md:text-5xl">{title}</h1>
        </div>

        <nav className="flex flex-wrap gap-2">
          <Link className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-white/10 bg-black/30 px-4 text-sm font-black uppercase text-white/75 transition hover:border-primary/50 hover:text-primary" href="/admin">
            <LayoutDashboard className="h-4 w-4" />
            Painel
          </Link>
          <Link className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-white/10 bg-black/30 px-4 text-sm font-black uppercase text-white/75 transition hover:border-primary/50 hover:text-primary" href={role === "CLIENT" ? "/cliente/perfil" : role === "BARBER" ? "/funcionario/perfil" : "/admin/perfil"}>
            <UserRound className="h-4 w-4" />
            Perfil
          </Link>
          {canOpenAdmin ? (
            <Link className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-primary/30 bg-primary/10 px-4 text-sm font-black uppercase text-primary transition hover:bg-primary hover:text-black" href="/admin">
              <BriefcaseBusiness className="h-4 w-4" />
              Painel administrativo
            </Link>
          ) : null}
          {canOpenBarberPanel ? (
            <Link className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-primary/30 bg-primary/10 px-4 text-sm font-black uppercase text-primary transition hover:bg-primary hover:text-black" href="/funcionario">
              <BriefcaseBusiness className="h-4 w-4" />
              Meu painel de barbeiro
            </Link>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
