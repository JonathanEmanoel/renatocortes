import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

const registerProfileSchema = z.object({
  name: z.string().trim().min(3),
  phone: z.string().trim().min(10).max(20)
});

export async function POST(request: Request) {
  try {
    const body = registerProfileSchema.parse(await request.json());
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const {
      data: { user },
      error
    } = await supabase.auth.getUser();

    if (error || !user?.id || !user.email) {
      return NextResponse.json({ message: "Sessão expirada. Faça login para concluir seu cadastro." }, { status: 401 });
    }

    const profile = await prisma.$transaction(async (tx) => {
      const dbUser = await tx.user.upsert({
        where: { authId: user.id },
        update: {
          name: body.name,
          email: user.email!,
          phone: body.phone,
          role: "CLIENT",
          active: true,
          deletedAt: null
        },
        create: {
          authId: user.id,
          name: body.name,
          email: user.email!,
          phone: body.phone,
          role: "CLIENT"
        }
      });

      await tx.client.upsert({
        where: { userId: dbUser.id },
        update: { deletedAt: null },
        create: { userId: dbUser.id }
      });

      return dbUser;
    });

    return NextResponse.json({
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "Confira os dados informados e tente novamente." }, { status: 400 });
    }

    return NextResponse.json(
      { message: "Não foi possível finalizar seu cadastro agora. Tente novamente." },
      { status: 500 }
    );
  }
}
