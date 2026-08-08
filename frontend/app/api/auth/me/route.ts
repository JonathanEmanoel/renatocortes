import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

export async function GET() {
  try {
    const session = await getAuthenticatedUser();

    if (!session) {
      return NextResponse.json({ message: "Sessão expirada. Faça login novamente." }, { status: 401 });
    }

    return NextResponse.json({
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role,
      hasBarber: Boolean(session.user.barber?.id)
    });
  } catch {
    return NextResponse.json(
      { message: "Não foi possível carregar seu perfil agora. Tente novamente." },
      { status: 500 }
    );
  }
}
