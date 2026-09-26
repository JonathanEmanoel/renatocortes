import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Diagnostico local sem expor host, usuario, banco, parametros ou segredos. */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ message: "Nao encontrado." }, { status: 404 });
  }

  return NextResponse.json({
    databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
    directUrlConfigured: Boolean(process.env.DIRECT_URL)
  });
}
