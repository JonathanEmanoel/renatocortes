import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedClient } from "@/lib/server/auth";

const profileSchema = z.object({
  name: z.string().trim().min(3, "Informe seu nome.").max(120),
  phone: z.string().trim().min(10, "Informe um telefone válido.").max(20),
  cpf: z.string().trim().max(20).optional().or(z.literal("")),
  birthDate: z.string().trim().max(20).optional().or(z.literal("")),
  address: z.object({
    street: z.string().trim().max(120).optional().or(z.literal("")),
    number: z.string().trim().max(20).optional().or(z.literal("")),
    complement: z.string().trim().max(80).optional().or(z.literal("")),
    neighborhood: z.string().trim().max(80).optional().or(z.literal("")),
    city: z.string().trim().max(80).optional().or(z.literal("")),
    state: z.string().trim().max(2).optional().or(z.literal("")),
    zipCode: z.string().trim().max(20).optional().or(z.literal(""))
  })
});

function buildClientNotes(current: string | null, data: { cpf?: string; birthDate?: string }) {
  let parsed: Record<string, unknown> = {};

  try {
    parsed = current ? JSON.parse(current) : {};
  } catch {
    parsed = {};
  }

  return JSON.stringify({
    ...parsed,
    cpf: data.cpf || null,
    birthDate: data.birthDate || null
  });
}

export async function PATCH(request: Request) {
  try {
    const session = await getAuthenticatedClient();

    if (!session) {
      return NextResponse.json({ message: "Faça login para alterar seus dados." }, { status: 401 });
    }

    const payload = profileSchema.safeParse(await request.json());

    if (!payload.success) {
      return NextResponse.json({ message: "Confira os dados informados." }, { status: 400 });
    }

    const { address, ...profile } = payload.data;
    const hasAddress = Boolean(address.street && address.number && address.city && address.state && address.zipCode);

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: session.user.id },
        data: {
          name: profile.name,
          phone: profile.phone
        }
      });

      await tx.client.update({
        where: { id: session.client.id },
        data: {
          notes: buildClientNotes(session.client.notes, {
            cpf: profile.cpf,
            birthDate: profile.birthDate
          })
        }
      });

      let savedAddress = session.address;

      if (hasAddress) {
        savedAddress = session.address
          ? await tx.address.update({
              where: { id: session.address.id },
              data: {
                street: address.street!,
                number: address.number!,
                complement: address.complement || null,
                neighborhood: address.neighborhood || null,
                city: address.city!,
                state: address.state!.toUpperCase(),
                zipCode: address.zipCode!
              }
            })
          : await tx.address.create({
              data: {
                userId: user.id,
                street: address.street!,
                number: address.number!,
                complement: address.complement || null,
                neighborhood: address.neighborhood || null,
                city: address.city!,
                state: address.state!.toUpperCase(),
                zipCode: address.zipCode!
              }
            });
      }

      return { user, address: savedAddress };
    });

    return NextResponse.json({
      name: updated.user.name,
      phone: updated.user.phone,
      cpf: profile.cpf || "Não informado",
      birthDate: profile.birthDate || "Não informado",
      address: updated.address
        ? `${updated.address.street}, ${updated.address.number}${updated.address.complement ? ` - ${updated.address.complement}` : ""}, ${updated.address.city} - ${updated.address.state}, ${updated.address.zipCode}`
        : "Não informado"
    });
  } catch {
    return NextResponse.json(
      { message: "Não foi possível atualizar seus dados agora." },
      { status: 500 }
    );
  }
}
