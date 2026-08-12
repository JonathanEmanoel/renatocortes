export const dynamic = "force-dynamic";
export const revalidate = 0;

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import { executeMaintenance, previewMaintenance, restoreMaintenance } from "@/lib/server/maintenance";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

const requestSchema = z.object({
  category: z.enum(["accounts", "appointments", "manual-services", "in-person-sales", "store-orders", "expenses"]),
  mode: z.enum(["hide", "delete"]).default("hide"),
  ids: z.array(z.string().min(1)).min(1).max(100),
  restoreStock: z.boolean().default(false),
  includeHidden: z.boolean().default(false),
  confirmation: z.string().optional()
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

async function requireDeveloper() {
  const session = await getAuthenticatedUser();
  return session?.user.role === "DEVELOPER" ? session : null;
}

export async function POST(request: Request) {
  try {
    const session = await requireDeveloper();
    if (!session) return NextResponse.json({ message: "Acesso exclusivo de DEVELOPER." }, { status: 403 });

    const payload = requestSchema.safeParse(await request.json());
    if (!payload.success) return NextResponse.json({ message: "Confira a selecao para manutencao." }, { status: 400 });

    const preview = await previewMaintenance(
      payload.data.category,
      payload.data.ids,
      payload.data.mode,
      session.user.id,
      payload.data.restoreStock,
      payload.data.includeHidden
    );
    return NextResponse.json({ preview });
  } catch {
    return NextResponse.json({ message: "Nao foi possivel pre-visualizar a manutencao." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireDeveloper();
    if (!session) return NextResponse.json({ message: "Acesso exclusivo de DEVELOPER." }, { status: 403 });

    const payload = requestSchema.safeParse(await request.json());
    if (!payload.success) return NextResponse.json({ message: "Confira a selecao para manutencao." }, { status: 400 });
    if (payload.data.confirmation !== "EXCLUIR") {
      return NextResponse.json({ message: "Digite EXCLUIR para confirmar a operacao." }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdminClient();
    const result = await executeMaintenance({
      category: payload.data.category,
      ids: payload.data.ids,
      mode: payload.data.mode,
      developerUserId: session.user.id,
      restoreStock: payload.data.restoreStock,
      includeHidden: payload.data.includeHidden,
      deleteAuthUser: supabaseAdmin
        ? async (authId: string) => {
            await supabaseAdmin.auth.admin.deleteUser(authId);
          }
        : undefined
    });

    return NextResponse.json({
      ok: true,
      message: payload.data.mode === "hide" ? "Registros ocultados com sucesso." : "Registros excluidos com sucesso.",
      result
    });
  } catch {
    return NextResponse.json(
      { message: "Nao foi possivel concluir a limpeza. Nenhuma alteracao parcial foi confirmada quando aplicavel." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireDeveloper();
    if (!session) return NextResponse.json({ message: "Acesso exclusivo de DEVELOPER." }, { status: 403 });

    const payload = requestSchema.safeParse(await request.json());
    if (!payload.success) return NextResponse.json({ message: "Confira a selecao para restaurar." }, { status: 400 });

    const result = await restoreMaintenance({
      category: payload.data.category,
      ids: payload.data.ids,
      developerUserId: session.user.id
    });

    return NextResponse.json({
      ok: true,
      message: `${result.count} registro(s) restaurado(s) com sucesso.`,
      result
    });
  } catch {
    return NextResponse.json(
      { message: "Nao foi possivel restaurar os registros selecionados." },
      { status: 500 }
    );
  }
}
