"use client";

import Link from "next/link";
import { CalendarDays, Home, LogIn, Scissors, ShoppingBag, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { useUiStore } from "@/store/ui-store";
import { cn } from "@/utils/cn";

const links = [
  { href: "/", label: "Home", icon: Home },
  { href: "/login", label: "Agendar", icon: CalendarDays },
  { href: "/login", label: "Assinaturas", icon: Star },
  { href: "/login", label: "Loja", icon: ShoppingBag }
];

export function MobileDrawer() {
  const { isMobileMenuOpen, closeMobileMenu } = useUiStore();

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 bg-black/70 opacity-0 pointer-events-none transition md:hidden",
        isMobileMenuOpen && "opacity-100 pointer-events-auto"
      )}
    >
      <aside
        className={cn(
          "h-full w-[82%] max-w-sm border-r border-white/15 bg-[#050505] p-6 transition-transform duration-300",
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
          {links.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={closeMobileMenu}
              className="flex items-center gap-4 rounded-[8px] border border-white/10 px-4 py-4 text-sm font-bold uppercase text-white transition hover:border-primary hover:text-primary"
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          ))}
        </nav>
        <Link href="/login" onClick={closeMobileMenu}>
          <Button className="mt-8 w-full">
            <LogIn className="h-5 w-5" />
            Entrar
          </Button>
        </Link>
        <div className="mt-10 flex items-center gap-3 text-white/60">
          <Scissors className="h-5 w-5 text-primary" />
          <span className="text-sm">Seu estilo, nossa arte.</span>
        </div>
      </aside>
    </div>
  );
}
