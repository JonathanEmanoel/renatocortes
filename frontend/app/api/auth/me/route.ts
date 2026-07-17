import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

const metadataSchema = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  phone: z.string().trim().min(10).max(20).optional()
});

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const {
      data: { user },
      error
    } = await supabase.auth.getUser();

    if (error || !user?.id || !user.email) {
      return NextResponse.json({ message: "Sessao expirada. Faca login novamente." }, { status: 401 });
    }

    let dbUser = await prisma.user.findFirst({
      where: {
        authId: user.id,
        deletedAt: null
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      }
    });

    if (!dbUser) {
      const metadata = metadataSchema.safeParse(user.user_metadata ?? {});
      const name = metadata.success ? metadata.data.name ?? user.email.split("@")[0] : user.email.split("@")[0];
      const phone = metadata.success ? metadata.data.phone : undefined;

      dbUser = await prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            authId: user.id,
            name,
            email: user.email!,
            phone,
            role: "CLIENT"
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        });

        await tx.client.create({
          data: {
            userId: createdUser.id
          }
        });

        return createdUser;
      });
    }

    return NextResponse.json(dbUser);
  } catch {
    return NextResponse.json(
      { message: "Nao foi possivel carregar seu perfil agora. Tente novamente." },
      { status: 500 }
    );
  }
}
