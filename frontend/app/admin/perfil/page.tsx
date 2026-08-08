export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { InternalProfileForm } from "@/components/internal/internal-profile-form";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

export default async function AdminProfilePage() {
  const session = await getAuthenticatedUser();
  if (!session) redirect("/login?redirectTo=/admin/perfil");
  if (session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER") redirect("/cliente");

  return (
    <main className="min-h-screen bg-barber-radial px-5 py-8 text-white">
      <section className="mx-auto max-w-3xl">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary">Perfil</p>
        <h1 className="mt-3 text-3xl font-black uppercase md:text-5xl">Meu perfil</h1>
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
