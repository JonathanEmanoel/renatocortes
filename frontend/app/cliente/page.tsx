import Link from "next/link";
import { Crown, ShoppingBag } from "lucide-react";
import { AppointmentCard } from "@/components/client/appointment-card";
import { ClientShell } from "@/components/client/client-shell";
import { ProductCard } from "@/components/client/product-card";
import { QuickActionCard } from "@/components/client/quick-action-card";
import { SectionTitle } from "@/components/client/section-title";
import { Button } from "@/components/ui/button";
import { appointments, mockClient, products, quickActions } from "@/utils/client-mocks";

export default function ClientDashboardPage() {
  const nextAppointment = appointments.find((appointment) => appointment.status === "Confirmado");

  return (
    <ClientShell>
      <section>
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary">Área do Cliente</p>
        <h1 className="mt-3 text-3xl font-black uppercase md:text-5xl">Olá, {mockClient.name}!</h1>
        <p className="mt-3 text-lg text-white/68">Pronto para renovar seu estilo?</p>
      </section>

      <section className="mt-10">
        <SectionTitle title="Próximo Agendamento" />
        {nextAppointment ? (
          <AppointmentCard appointment={nextAppointment} detailed />
        ) : (
          <div className="rounded-[8px] border border-white/14 bg-card p-7 text-center">
            <p className="text-lg font-bold">Você ainda não possui horários agendados.</p>
            <Link href="/cliente/agendamento">
              <Button className="mt-6">Agendar Agora</Button>
            </Link>
          </div>
        )}
      </section>

      <section className="mt-10">
        <SectionTitle title="Acesso Rápido" />
        <div className="grid grid-cols-2 gap-4">
          {quickActions.map((action) => (
            <QuickActionCard key={action.href} {...action} />
          ))}
        </div>
      </section>

      <section className="mt-10 overflow-hidden rounded-[8px] border border-primary/35 bg-gradient-to-br from-primary/22 via-[#080808] to-black p-7 shadow-red">
        <Crown className="h-10 w-10 text-primary" />
        <h2 className="mt-5 max-w-xl text-2xl font-black uppercase md:text-4xl">
          Corte e barba quantas vezes quiser por mês.
        </h2>
        <p className="mt-4 max-w-lg text-white/68">
          Planos premium para manter seu visual sempre alinhado com economia e prioridade na agenda.
        </p>
        <Link href="/cliente/assinaturas">
          <Button className="mt-7">Conhecer Planos</Button>
        </Link>
      </section>

      <section className="mt-10">
        <SectionTitle
          title="Produtos em Destaque"
          action={
            <Link href="/cliente/loja" className="text-sm font-black uppercase tracking-[0.08em] text-primary">
              Ver Todos
            </Link>
          }
        />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {products.slice(0, 4).map((product) => (
            <ProductCard key={product.id} product={product} compact />
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-[8px] border border-white/14 bg-card p-5">
        <div className="flex items-center gap-4">
          <ShoppingBag className="h-8 w-8 text-primary" />
          <div>
            <h2 className="font-black uppercase">Loja pronta para integração</h2>
            <p className="mt-1 text-sm text-white/58">Produtos e carrinho seguem mockados nesta etapa.</p>
          </div>
        </div>
      </section>
    </ClientShell>
  );
}
