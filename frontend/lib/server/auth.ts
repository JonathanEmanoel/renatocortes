import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

export async function getAuthenticatedClient() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user?.id || !user.email) {
    return null;
  }

  const dbUser = await prisma.user.findFirst({
    where: {
      authId: user.id,
      deletedAt: null,
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
    authUser: user,
    user: dbUser,
    client: dbUser.client,
    address: dbUser.addresses[0] ?? null
  };
}
