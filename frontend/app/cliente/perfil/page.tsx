import Link from "next/link";
import { CalendarDays, KeyRound, LogOut, Mail, Phone, Star, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ClientShell } from "@/components/client/client-shell";
import { SectionTitle } from "@/components/client/section-title";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { mockClient } from "@/utils/client-mocks";

const accountLinks = [
  { href: "/cliente/meus-agendamentos", label: "Meus Agendamentos", icon: CalendarDays },
  { href: "/cliente/assinaturas", label: "Minhas Assinaturas", icon: Star },
  { href: "/", label: "Sair", icon: LogOut }
];

export default function ProfilePage() {
  return (
    <ClientShell>
      <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary">Perfil</p>
      <h1 className="mt-3 text-3xl font-black uppercase md:text-5xl">Meu Perfil</h1>

      <section className="mt-9 rounded-[8px] border border-white/14 bg-card p-6 text-center">
        <Avatar name={mockClient.name} className="mx-auto h-24 w-24" />
        <h2 className="mt-5 text-2xl font-black uppercase">{mockClient.name}</h2>
        <div className="mt-6 grid gap-3 text-left md:grid-cols-2">
          <Info icon={Phone} label="Telefone" value={mockClient.phone} />
          <Info icon={Mail} label="Email" value={mockClient.email} />
        </div>
        <div className="mt-7 grid gap-3 md:grid-cols-2">
          <Button>
            <UserRound className="h-5 w-5" />
            Editar Dados
          </Button>
          <Button variant="outline">
            <KeyRound className="h-5 w-5" />
            Alterar Senha
          </Button>
        </div>
      </section>

      <section className="mt-10">
        <SectionTitle title="Minha Conta" />
        <div className="grid gap-3">
          {accountLinks.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="flex items-center justify-between rounded-[8px] border border-white/14 bg-card p-5 font-black uppercase transition hover:border-primary/50 hover:text-primary"
            >
              <span className="flex items-center gap-4">
                <item.icon className="h-5 w-5 text-primary" />
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </ClientShell>
  );
}

function Info({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-black/35 p-4">
      <p className="flex items-center gap-3 text-sm uppercase tracking-[0.08em] text-white/50">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </p>
      <p className="mt-2 font-bold">{value}</p>
    </div>
  );
}
