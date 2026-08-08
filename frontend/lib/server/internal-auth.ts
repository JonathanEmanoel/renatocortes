import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";
import type { UserRole } from "@/types/auth";

type InternalProfile = {
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  barberSpecialty?: string;
};

type AuthenticatedDbUser = Prisma.UserGetPayload<{
  include: {
    barber: true;
    client: true;
  };
}>;

type AuthenticatedSession = {
  authUser: Awaited<ReturnType<ReturnType<typeof createClient>["auth"]["getUser"]>>["data"]["user"];
  user: AuthenticatedDbUser;
};

const internalProfiles: Record<string, InternalProfile> = {
  "renato3010andrade@gmail.com": {
    name: "Renato",
    email: "renato3010andrade@gmail.com",
    role: "ADMIN",
    phone: "81 9 9590-1793",
    barberSpecialty: "Administrador e barbeiro Renato Cortes"
  },
  "claso6806@gmail.com": {
    name: "Italo",
    email: "claso6806@gmail.com",
    role: "BARBER",
    phone: "81 9 9329-0688",
    barberSpecialty: "Degrade navalhado, luzes e platinado"
  },
  "gustavosilvagustavo.mendes@gmail.com": {
    name: "Renan",
    email: "gustavosilvagustavo.mendes@gmail.com",
    role: "BARBER",
    phone: "81 9 9388-7519",
    barberSpecialty: "Barba, acabamento e cortes modernos"
  },
  "reservabarbearia605@gmail.com": {
    name: "Jonathan Emanoel",
    email: "reservabarbearia605@gmail.com",
    role: "DEVELOPER",
    phone: "81 9 84667532"
  }
};

export function getDashboardPath(role: UserRole, hasBarber = false) {
  if (role === "CLIENT") return "/cliente";
  if (role === "BARBER" || (role === "ADMIN" && hasBarber)) return "/funcionario";
  return "/admin";
}

export function getInternalProfileByEmail(email: string) {
  return internalProfiles[email.trim().toLowerCase()] ?? null;
}

export async function getAuthenticatedUser(): Promise<AuthenticatedSession | null> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user?.id || !user.email) {
    return null;
  }

  const email = user.email.trim().toLowerCase();
  const internalProfile = getInternalProfileByEmail(email);

  let dbUser = await prisma.user.findFirst({
    where: internalProfile
      ? {
          OR: [{ authId: user.id }, { email }],
          deletedAt: null
        }
      : {
          authId: user.id,
          deletedAt: null
        },
    include: {
      barber: true,
      client: true
    }
  });

  if (!dbUser) {
    dbUser = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          authId: user.id,
          name: internalProfile?.name ?? user.user_metadata?.name ?? user.email!.split("@")[0],
          email,
          phone: internalProfile?.phone ?? (typeof user.user_metadata?.phone === "string" ? user.user_metadata.phone : undefined),
          role: internalProfile?.role ?? "CLIENT"
        },
        include: {
          barber: true,
          client: true
        }
      });

      if (internalProfile?.role === "BARBER" || internalProfile?.role === "ADMIN") {
        await tx.barber.create({
          data: {
            userId: createdUser.id,
            specialty: internalProfile.barberSpecialty ?? "Barbeiro Renato Cortes",
            serviceCommissionPercent: "50.00",
            productCommissionPercent: "20.00"
          }
        });
      }

      if (!internalProfile) {
        await tx.client.create({
          data: {
            userId: createdUser.id
          }
        });
      }

      return tx.user.findUniqueOrThrow({
        where: { id: createdUser.id },
        include: {
          barber: true,
          client: true
        }
      });
    });
  } else if (
    dbUser.authId !== user.id ||
    (internalProfile &&
      dbUser.role !== internalProfile.role)
  ) {
    dbUser = await prisma.user.update({
      where: { id: dbUser.id },
      data: {
        authId: user.id,
        role: internalProfile?.role ?? dbUser.role,
        active: true,
        deletedAt: null
      },
      include: {
        barber: true,
        client: true
      }
    });
  }

  if (!dbUser) {
    return null;
  }

  if (internalProfile && (internalProfile.role === "BARBER" || internalProfile.role === "ADMIN") && !dbUser.barber) {
    const barber = await prisma.barber.create({
      data: {
        userId: dbUser.id,
        specialty: internalProfile.barberSpecialty ?? "Barbeiro Renato Cortes",
        serviceCommissionPercent: "50.00",
        productCommissionPercent: "20.00"
      }
    });
    dbUser = { ...dbUser, barber };
  }

  return {
    authUser: user,
    user: dbUser
  };
}
