"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ApplicationError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application route failed", { digest: error.digest });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-barber-radial px-5 text-white">
      <section className="w-full max-w-xl rounded-[12px] border border-primary/30 bg-card p-8 text-center shadow-panel">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-primary">Servico temporariamente indisponivel</p>
        <h1 className="mt-3 text-3xl font-black uppercase">Nao foi possivel carregar esta tela</h1>
        <p className="mt-4 text-white/70">
          Seus dados e sua sessao foram preservados. Aguarde alguns instantes e tente novamente.
        </p>
        <Button type="button" className="mt-7" onClick={reset}>
          Tentar novamente
        </Button>
      </section>
    </main>
  );
}
