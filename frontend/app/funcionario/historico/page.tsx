export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

function servicesLabel(appointment: { service: { name: string }; services: { service: { name: string } }[] }) {
  return appointment.services.length ? appointment.services.map((item) => item.service.name).join(" + ") : appointment.service.name;
}

function servicesDuration(appointment: { service: { duration: number }; services: { duration: number }[] }) {
  return appointment.services.length ? appointment.services.reduce((sum, item) => sum + item.duration, 0) : appointment.service.duration;
}

function servicesTotal(appointment: { service: { price: unknown }; services: { price: unknown }[] }) {
  return appointment.services.length ? appointment.services.reduce((sum, item) => sum + Number(item.price), 0) : Number(appointment.service.price);
}

export default async function BarberHistoryPage() {
  const session = await getAuthenticatedUser();
  if (!session) redirect("/login?redirectTo=/funcionario/historico");
  if (session.user.role !== "BARBER" && session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER") redirect("/cliente");
  if (!session.user.barber?.id) redirect("/admin");

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const history = await prisma.appointment.findMany({
    where: {
      barberId: session.user.barber.id,
      deletedAt: null,
      dataHora: { gte: since },
      status: { in: ["REJECTED", "CANCELED", "COMPLETED", "NO_SHOW"] }
    },
    include: { client: { include: { user: true } }, barber: { include: { user: true } }, service: true, services: { include: { service: true } } },
    orderBy: { dataHora: "desc" }
  });

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-8 text-white">
      <section className="mx-auto max-w-6xl">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary">Historico</p>
        <h1 className="mt-3 text-3xl font-black uppercase md:text-5xl">Atendimentos recentes</h1>

        <section className="mt-8 rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
          <h2 className="text-xl font-black uppercase">Ultimos 30 dias</h2>
          <div className="mt-5 grid gap-4">
            {history.length === 0 ? <p className="text-white/65">Nenhum historico recente.</p> : null}
            {history.map((appointment) => (
              <article key={appointment.id} className="grid gap-3 rounded-[10px] border border-white/10 bg-black/30 p-4 md:grid-cols-4">
                <div>
                  <p className="text-xs uppercase text-white/45">Cliente</p>
                  <p className="font-black uppercase">{appointment.client.user.name}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-white/45">Servico</p>
                  <p className="font-bold">{servicesLabel(appointment)}</p>
                  <p className="text-sm text-white/55">{servicesDuration(appointment)} min</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-white/45">Valor</p>
                  <p className="font-black text-primary">{formatCurrency(servicesTotal(appointment))}</p>
                </div>
                <div className="md:text-right">
                  <p>{appointment.dataHora.toLocaleDateString("pt-BR")} {appointment.dataHora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
                  <p className="font-black uppercase text-primary">{appointment.status}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
