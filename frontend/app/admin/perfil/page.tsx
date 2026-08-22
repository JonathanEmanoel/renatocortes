export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { InternalPageHeader } from "@/components/internal/internal-page-header";
import { InternalProfileForm } from "@/components/internal/internal-profile-form";
import { getDashboardPath } from "@/lib/auth-routes";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

export default async function AdminProfilePage() {
  const session = await getAuthenticatedUser();
  if (!session) redirect("/login?redirectTo=/admin/perfil");
  if (session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER") redirect(getDashboardPath(session.user.role, Boolean(session.user.barber?.id)));

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-8 text-white">
      <section className="mx-auto max-w-3xl">
        <InternalPageHeader
          eyebrow="Perfil"
          title="Meu perfil"
          backHref="/admin"
          backLabel="Painel administrativo"
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
