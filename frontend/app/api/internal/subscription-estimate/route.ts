import { NextResponse } from "next/server";
import { getOwnSubscriptionEstimate } from "@/lib/server/barber-subscription-estimate";
import { currentCompetenceMonth } from "@/lib/server/subscription-payouts";

export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("competenceMonth") ?? currentCompetenceMonth();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > currentCompetenceMonth()) {
    return NextResponse.json({ error: "Competencia invalida ou futura." }, { status: 400 });
  }
  try {
    return NextResponse.json(await getOwnSubscriptionEstimate(month), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Nao foi possivel consultar o repasse. Verifique seu acesso e tente novamente." }, { status: 403 });
  }
}
