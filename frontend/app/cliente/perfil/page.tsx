export const dynamic = "force-dynamic";
export const revalidate = 0;

import { requireAuthenticatedClient } from "@/lib/server/auth";
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
  const session = await requireAuthenticatedClient("/cliente/perfil");

  const address = session.address;
  const formattedAddress = address
    ? `${address.street}, ${address.number}${address.complement ? ` - ${address.complement}` : ""}, ${address.city} - ${address.state}, ${address.zipCode}`
    : notInformed;
  const notes = parseClientNotes(session.client.notes ?? null);

  return (
    <ProfileContent
      initialProfile={{
        name: session.user.name ?? notInformed,
        email: session.user.email ?? notInformed,
        phone: session.user.phone ?? notInformed,
        cpf: notes.cpf,
        birthDate: notes.birthDate,
        createdAt: session.user.createdAt ? session.user.createdAt.toLocaleDateString("pt-BR") : notInformed,
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
