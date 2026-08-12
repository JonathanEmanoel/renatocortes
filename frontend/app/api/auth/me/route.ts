import { NextResponse } from "next/server";
import { getAuthenticatedUser, getAuthenticatedUserFromToken } from "@/lib/server/internal-auth";

export async function GET(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    const bearerToken = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
    const session = bearerToken ? await getAuthenticatedUserFromToken(bearerToken) : await getAuthenticatedUser();

    if (!session) {
      return NextResponse.json(
        { message: "Nao foi possivel validar sua sessao. Confira o e-mail e senha e tente novamente." },
        { status: 401 }
      );
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
      { message: "Nao foi possivel carregar seu perfil agora. Tente novamente." },
      { status: 500 }
    );
  }
}
