import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";
import type { UserRole } from "@/types/auth";
export { getDashboardPath } from "@/lib/auth-routes";

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

/**
 * Resolve contas internas fixas pelo e-mail autenticado no Supabase.
 * Essa lista e a camada que impede admin, barbeiros e dev de serem tratados
 * como CLIENT quando entram pelo mesmo formulario publico de login.
 */
export function getInternalProfileByEmail(email: string) {
  return internalProfiles[email.trim().toLowerCase()] ?? null;
}

/**
 * Sincroniza o usuario autenticado no Supabase com o cadastro interno.
 *
 * A busca por `authId` ou e-mail existe para recuperar contas antigas da equipe
 * que ja estavam cadastradas antes da correção de roteamento por perfil. Quando
 * o e-mail pertence a uma conta interna, o papel salvo no banco e realinhado ao
 * perfil fixo para que o redirecionamento use ADMIN/BARBER/DEVELOPER.
 */
async function resolveDbSession(user: Awaited<ReturnType<ReturnType<typeof createClient>["auth"]["getUser"]>>["data"]["user"]): Promise<AuthenticatedSession | null> {
  if (!user?.id || !user.email) return null;

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
    try {
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
          // Barbeiros/admins precisam do registro Barber para acessar paines operacionais.
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
    } catch (error) {
      // Requisicoes paralelas podem sincronizar a mesma sessao na primeira carga.
      // A vencedora cria o perfil; a outra reutiliza o registro ja confirmado.
      if (!(error && typeof error === "object" && "code" in error && error.code === "P2002")) throw error;
      dbUser = await prisma.user.findFirst({
        where: internalProfile
          ? { OR: [{ authId: user.id }, { email }], deletedAt: null }
          : { authId: user.id, deletedAt: null },
        include: { barber: true, client: true }
      });
      if (!dbUser) throw error;
    }
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
    // Corrige contas antigas da equipe que existiam como User mas ainda nao tinham Barber.
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

/**
 * Retorna a sessao do usuario a partir dos cookies do Next/Supabase.
 * Alem de validar o token, tambem chama a sincronizacao com `User`, `Barber` e
 * `Client`, por isso rotas server-side devem preferir este helper ao acesso
 * direto ao Supabase quando precisam aplicar permissao por perfil.
 */
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

  return resolveDbSession(user);
}

/**
 * Variante para chamadas autenticadas por Bearer token.
 * Usada por APIs que recebem o token explicitamente; a sessao nao e persistida
 * no cliente Supabase para evitar que uma requisicao reaproveite credenciais de
 * outra chamada no ambiente serverless.
 */
export async function getAuthenticatedUserFromToken(accessToken: string): Promise<AuthenticatedSession | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) return null;

  const supabase = createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  const {
    data: { user },
    error
  } = await supabase.auth.getUser(accessToken);

  if (error || !user?.id || !user.email) return null;
  return resolveDbSession(user);
}
