import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { ClientShell } from "@/components/client/client-shell";
import { Button } from "@/components/ui/button";

export default function CheckoutSuccessPage() {
  return (
    <ClientShell>
      <section className="mx-auto mt-10 max-w-2xl rounded-[14px] border border-primary/30 bg-card p-8 text-center shadow-panel">
        <CheckCircle2 className="mx-auto h-16 w-16 text-primary" />
        <p className="mt-6 text-sm font-bold uppercase tracking-[0.22em] text-primary">Pedido enviado</p>
        <h1 className="mt-3 text-3xl font-black uppercase md:text-5xl">Obrigado!</h1>
        <p className="mt-4 text-white/70">
          Seu pedido foi registrado e o WhatsApp foi aberto para confirmar os detalhes com a barbearia.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/cliente/loja">
            <Button type="button" variant="outline">Continuar comprando</Button>
          </Link>
          <Link href="/cliente">
            <Button type="button">Voltar ao início</Button>
          </Link>
        </div>
      </section>
    </ClientShell>
  );
}
