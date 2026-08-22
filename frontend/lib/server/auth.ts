import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getDashboardPath } from "@/lib/auth-routes";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

export async function getAuthenticatedClient() {
  const session = await getAuthenticatedUser();

  if (!session?.user.client || session.user.role !== "CLIENT") {
    return null;
  }

  const dbUser = await prisma.user.findFirst({
    where: {
      id: session.user.id,
      deletedAt: null,
      role: "CLIENT",
      active: true
    },
    include: {
      client: true,
      addresses: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  if (!dbUser?.client || dbUser.role !== "CLIENT") {
    return null;
  }

  return {
    authUser: session.authUser,
    user: dbUser,
    client: dbUser.client,
    address: dbUser.addresses[0] ?? null
  };
}

export async function requireAuthenticatedClient(redirectTo = "/cliente") {
  const session = await getAuthenticatedUser();

  if (!session) {
    redirect(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  if (session.user.role !== "CLIENT" || !session.user.client) {
    redirect(getDashboardPath(session.user.role, Boolean(session.user.barber?.id)));
  }

  const clientSession = await getAuthenticatedClient();
  if (!clientSession) {
    redirect(getDashboardPath(session.user.role, Boolean(session.user.barber?.id)));
  }

  return clientSession;
}
