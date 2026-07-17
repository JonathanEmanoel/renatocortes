import type { AuthUser, LoginCredentials } from "@/types/auth";

const mockUsers: Array<AuthUser & { password: string }> = [
  {
    id: "client-user",
    name: "Cliente Renato Cortes",
    email: "cliente@email.com",
    password: "123456",
    role: "CLIENT"
  },
  {
    id: "employee-user",
    name: "Renan Cortes",
    email: "renan@barbearia.com",
    password: "123456",
    role: "EMPLOYEE"
  }
];

export async function signInMock(credentials: LoginCredentials): Promise<AuthUser> {
  await new Promise((resolve) => setTimeout(resolve, 350));

  const user = mockUsers.find(
    (candidate) =>
      candidate.email.toLowerCase() === credentials.email.toLowerCase() &&
      candidate.password === credentials.password
  );

  if (!user) {
    throw new Error("E-mail ou senha inválidos.");
  }

  const { password: _password, ...safeUser } = user;
  return safeUser;
}
