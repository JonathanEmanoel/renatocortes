export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { BootstrapForm } from "@/components/internal/bootstrap-form";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

export default async function InternalBootstrapPage() {
  const session = await getAuthenticatedUser();

  if (!session) redirect("/login?redirectTo=/internal/bootstrap");

  const isAuthorized = session.user.role === "DEVELOPER";
  const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-10 text-white">
      <section className="mx-auto max-w-3xl rounded-[14px] border border-primary/20 bg-card p-6 shadow-panel md:p-9">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary">Acesso tecnico</p>
        <h1 className="mt-3 text-3xl font-black uppercase md:text-5xl">Bootstrap interno</h1>
        <p className="mt-4 text-white/65">
          Cadastro manual de funcionarios internos. Esta rota nao aparece em menus e exige login de desenvolvedor.
        </p>

        {!isAuthorized ? (
          <BlockedState message="Somente usuarios DEVELOPER podem acessar esta interface." />
        ) : !hasServiceRoleKey ? (
          <BlockedState message="Configure SUPABASE_SERVICE_ROLE_KEY no ambiente do servidor antes de criar usuarios internos." />
        ) : (
          <BootstrapForm />
        )}
      </section>
    </main>
  );
}

function BlockedState({ message }: { message: string }) {
  return (
    <div className="mt-8 rounded-[12px] border border-red-500/35 bg-red-500/10 p-5 text-red-100">
      <ShieldAlert className="h-8 w-8" />
      <p className="mt-3 font-bold">{message}</p>
    </div>
  );
}
