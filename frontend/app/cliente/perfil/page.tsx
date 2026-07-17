import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";
import { ProfileContent } from "./profile-content";

const notInformed = "Não informado";

function parseClientNotes(notes: string | null) {
  try {
    const parsed = notes ? JSON.parse(notes) : {};
    return {
      cpf: typeof parsed.cpf === "string" && parsed.cpf ? parsed.cpf : notInformed,
      birthDate: typeof parsed.birthDate === "string" && parsed.birthDate ? parsed.birthDate : notInformed
    };
  } catch {
    return {
      cpf: notInformed,
      birthDate: notInformed
    };
  }
}

export default async function ProfilePage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user?.id) {
    redirect("/login");
  }

  const profile = await prisma.user
    .findFirst({
      where: {
        authId: user.id,
        deletedAt: null
      },
      include: {
        client: true,
        addresses: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    })
    .catch(() => null);

  const address = profile?.addresses[0] ?? null;
  const formattedAddress = address
    ? `${address.street}, ${address.number}${address.complement ? ` - ${address.complement}` : ""}, ${address.city} - ${address.state}, ${address.zipCode}`
    : notInformed;
  const notes = parseClientNotes(profile?.client?.notes ?? null);

  return (
    <ProfileContent
      initialProfile={{
        name: profile?.name ?? notInformed,
        email: profile?.email ?? user.email ?? notInformed,
        phone: profile?.phone ?? notInformed,
        cpf: notes.cpf,
        birthDate: notes.birthDate,
        createdAt: profile?.createdAt ? profile.createdAt.toLocaleDateString("pt-BR") : notInformed,
        address: formattedAddress,
        addressFields: {
          street: address?.street ?? "",
          number: address?.number ?? "",
          complement: address?.complement ?? "",
          neighborhood: address?.neighborhood ?? "",
          city: address?.city ?? "",
          state: address?.state ?? "",
          zipCode: address?.zipCode ?? ""
        }
      }}
    />
  );
}
