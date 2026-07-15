"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, Home, LogOut, Menu, Scissors, ShoppingBag, Star, User, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth-store";
import { useUiStore } from "@/store/ui-store";
import { cn } from "@/utils/cn";

const navigation = [
  { href: "/cliente", label: "Home", icon: Home },
  { href: "/cliente/agendamento", label: "Agendar", drawerLabel: "Agendar Horário", icon: CalendarDays },
  { href: "/cliente/assinaturas", label: "Assinaturas", icon: Star },
  { href: "/cliente/loja", label: "Loja", icon: ShoppingBag },
  { href: "/cliente/perfil", label: "Perfil", drawerLabel: "Meu Perfil", icon: User }
];

export function ClientShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-black pb-28 text-white">
      <ClientNavbar />
      <ClientDrawer />
      <div className="barber-texture min-h-screen px-5 pb-10 pt-32 md:px-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </div>
      <BottomNavigation />
    </main>
  );
}

function ClientNavbar() {
  const openMobileMenu = useUiStore((state) => state.openMobileMenu);

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-white/10 bg-black/88 px-5 py-5 backdrop-blur md:px-10">
      <Button variant="ghost" size="icon" onClick={openMobileMenu} aria-label="Abrir menu">
        <Menu className="h-8 w-8" />
      </Button>
      <Link href="/cliente" aria-label="Renato Cortes Barbearia">
        <Logo compact />
      </Link>
      <Link href="/cliente/perfil" aria-label="Meu perfil">
        <Avatar className="h-12 w-12" />
      </Link>
    </header>
  );
}

function ClientDrawer() {
  const router = useRouter();
  const pathname = usePathname();
  const { logout } = useAuthStore();
  const { isMobileMenuOpen, closeMobileMenu } = useUiStore();

  function handleLogout() {
    logout();
    closeMobileMenu();
    router.push("/");
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 bg-black/70 opacity-0 pointer-events-none transition-opacity duration-300",
        isMobileMenuOpen && "opacity-100 pointer-events-auto"
      )}
    >
      <aside
        className={cn(
          "h-full w-[84%] max-w-sm border-r border-white/15 bg-[#050505] p-6 shadow-panel transition-transform duration-300",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between">
          <Logo compact />
          <Button variant="ghost" size="icon" onClick={closeMobileMenu} aria-label="Fechar menu">
            <X className="h-7 w-7" />
          </Button>
        </div>

        <nav className="mt-12 grid gap-3">
          {navigation.map((item) => {
            const active = pathname === item.href || (item.href !== "/cliente" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMobileMenu}
                className={cn(
                  "flex items-center gap-4 rounded-[8px] border border-white/10 px-4 py-4 text-sm font-bold uppercase text-white transition hover:border-primary hover:text-primary",
                  active && "border-primary/70 bg-primary/10 text-primary"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.drawerLabel ?? item.label}
              </Link>
            );
          })}
        </nav>

        <Button className="mt-8 w-full" variant="outline" onClick={handleLogout}>
          <LogOut className="h-5 w-5" />
          Sair
        </Button>

        <div className="mt-10 flex items-center gap-3 text-white/60">
          <Scissors className="h-5 w-5 text-primary" />
          <span className="text-sm">Seu estilo, nossa arte.</span>
        </div>
      </aside>
    </div>
  );
}

function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/96 px-2 py-4 backdrop-blur">
      <div className="mx-auto grid max-w-2xl grid-cols-5 gap-1">
        {navigation.map((item) => {
          const active = pathname === item.href || (item.href !== "/cliente" && pathname.startsWith(item.href));
          return (
            <Link
              href={item.href}
              key={item.href}
              className={cn(
                "flex flex-col items-center gap-2 rounded-[8px] px-1 py-1 text-[10px] font-bold uppercase transition md:text-xs",
                active ? "text-primary" : "text-white/78 hover:text-white"
              )}
            >
              <item.icon className="h-6 w-6" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
