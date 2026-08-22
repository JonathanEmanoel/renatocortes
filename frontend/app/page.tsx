export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { getDashboardPath } from "@/lib/auth-routes";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

export default async function HomePage() {
  const session = await getAuthenticatedUser();

  if (session) {
    redirect(getDashboardPath(session.user.role, Boolean(session.user.barber?.id)));
  }

  redirect("/login");
}
