import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/server/audit";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

const protectedClientEmails = new Set(["jonathan.emanoel23@gmail.com"]);

const requestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  password: z.string().min(8).max(120),
  phone: z.string().trim().max(30).optional(),
  role: z.enum(["BARBER", "ADMIN", "DEVELOPER"]),
  photo: z.string().trim().url().optional().or(z.literal("")),
  specialty: z.string().trim().max(160).optional(),
  active: z.boolean().default(true),
  serviceCommissionPercent: z.coerce.number().min(0).max(100).default(50),
  productCommissionPercent: z.coerce.number().min(0).max(100).default(20)
});

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function findAuthUserByEmail(email: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { user: null, error: "Supabase Admin nao configurado." };

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return { user: null, error: error.message };

    const user = data.users.find((item) => item.email?.toLowerCase() === email);
    if (user) return { user, error: null };
    if (data.users.length < 1000) break;
  }

  return { user: null, error: null };
}

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedUser();

    if (!session || session.user.role !== "DEVELOPER") {
      return NextResponse.json({ message: "Acesso tecnico nao autorizado." }, { status: 403 });
    }

    const payload = requestSchema.safeParse(await request.json());

    if (!payload.success) {
      return NextResponse.json({ message: "Confira os dados informados." }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    if (!supabase) {
      return NextResponse.json(
        { message: "Configure SUPABASE_SERVICE_ROLE_KEY no ambiente do servidor." },
        { status: 500 }
      );
    }

    const email = payload.data.email.toLowerCase();

    if (protectedClientEmails.has(email)) {
      return NextResponse.json(
        { message: "Este e-mail pertence a um cliente protegido e deve continuar como CLIENT." },
        { status: 409 }
      );
    }

    const existingDbUser = await prisma.user.findFirst({
      where: {
        email,
        deletedAt: null
      }
    });

    if (existingDbUser) {
      return NextResponse.json(
        { message: "Este e-mail ja existe no sistema. Nenhuma alteracao foi realizada." },
        { status: 409 }
      );
    }

    let authUser = (await findAuthUserByEmail(email)).user;
    let source: "created" | "linked" = "linked";

    if (!authUser) {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: payload.data.password,
        email_confirm: true,
        user_metadata: {
          name: payload.data.name,
          phone: payload.data.phone || null,
          role: payload.data.role
        }
      });

      if (error || !data.user) {
        return NextResponse.json(
          { message: error?.message ?? "Nao foi possivel criar o usuario no Supabase Auth." },
          { status: 409 }
        );
      }

      authUser = data.user;
      source = "created";
    }

    if (!authUser?.id) {
      return NextResponse.json({ message: "Usuario do Supabase Auth nao encontrado." }, { status: 409 });
    }

    const createdUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          authId: authUser.id,
          name: payload.data.name,
          email,
          phone: payload.data.phone || null,
          role: payload.data.role,
          active: payload.data.active
        }
      });

      if (payload.data.role === "BARBER") {
        await tx.barber.create({
          data: {
            userId: user.id,
            specialty: payload.data.specialty || "Barbeiro Renato Cortes",
            photo: payload.data.photo || null,
            active: payload.data.active,
            serviceCommissionPercent: payload.data.serviceCommissionPercent.toFixed(2),
            productCommissionPercent: payload.data.productCommissionPercent.toFixed(2)
          }
        });
      }

      return user;
    });

    await createAuditLog({
      userId: session.user.id,
      action: "INTERNAL_USER_BOOTSTRAP",
      entity: "User",
      entityId: createdUser.id,
      metadata: {
        targetEmail: email,
        targetRole: payload.data.role,
        authSource: source
      }
    });

    return NextResponse.json({
      ok: true,
      message:
        source === "created"
          ? "Conta interna criada com sucesso."
          : "Conta existente no Supabase Auth vinculada ao sistema com sucesso."
    });
  } catch {
    return NextResponse.json(
      { message: "Nao foi possivel criar a conta interna agora." },
      { status: 500 }
    );
  }
}
