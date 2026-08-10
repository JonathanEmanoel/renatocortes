export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { InternalPageHeader } from "@/components/internal/internal-page-header";
import { InternalProfileForm } from "@/components/internal/internal-profile-form";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

export default async function InternalProfilePage() {
  const session = await getAuthenticatedUser();
  if (!session) redirect("/login?redirectTo=/funcionario/perfil");
  if (session.user.role === "CLIENT") redirect("/cliente");

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-8 text-white">
      <section className="mx-auto max-w-3xl">
        <InternalPageHeader
          eyebrow="Perfil"
          title="Dados internos"
          backHref="/funcionario"
          backLabel="Painel do barbeiro"
          role={session.user.role}
          hasBarber={Boolean(session.user.barber?.id)}
        />
        <div className="mt-8">
          <InternalProfileForm
            user={{
              name: session.user.name,
              email: session.user.email,
              phone: session.user.phone,
              role: session.user.role
            }}
          />
        </div>
      </section>
    </main>
  );
}
