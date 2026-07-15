"use client";

import Link from "next/link";
import { Menu, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { useUiStore } from "@/store/ui-store";

export function Navbar() {
  const openMobileMenu = useUiStore((state) => state.openMobileMenu);

  return (
    <>
      <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-6 py-6 md:px-12">
        <Button variant="ghost" size="icon" onClick={openMobileMenu} aria-label="Abrir menu">
          <Menu className="h-8 w-8" />
        </Button>
        <Link href="/" aria-label="Renato Cortes Barbearia">
          <Logo compact />
        </Link>
        <Link href="/login" aria-label="Entrar">
          <Button variant="ghost" size="icon">
            <User className="h-8 w-8" />
          </Button>
        </Link>
      </header>
      <MobileDrawer />
    </>
  );
}
