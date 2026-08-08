import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/server/audit";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";
import { createClient } from "@/utils/supabase/server";

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional(),
  password: z.string().min(8).max(72).optional().or(z.literal(""))
});

export async function PATCH(request: Request) {
  try {
    const session = await getAuthenticatedUser();
    if (!session || session.user.role === "CLIENT") {
      return NextResponse.json({ message: "Acesso nao autorizado." }, { status: 403 });
    }

    const payload = profileSchema.safeParse(await request.json());
    if (!payload.success) return NextResponse.json({ message: "Confira os dados do perfil." }, { status: 400 });

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name: payload.data.name,
        phone: payload.data.phone || null
      }
    });

    if (payload.data.password) {
      const cookieStore = await cookies();
      const supabase = createClient(cookieStore);
      const { error } = await supabase.auth.updateUser({ password: payload.data.password });
      if (error) {
        return NextResponse.json({ message: "Dados salvos, mas nao foi possivel alterar a senha agora." }, { status: 500 });
      }
    }

    await createAuditLog({
      userId: session.user.id,
      action: "INTERNAL_PROFILE_UPDATE",
      entity: "User",
      entityId: session.user.id
    });

    return NextResponse.json({ user: { id: updated.id, name: updated.name, phone: updated.phone, email: updated.email } });
  } catch {
    return NextResponse.json({ message: "Nao foi possivel atualizar o perfil agora." }, { status: 500 });
  }
}
