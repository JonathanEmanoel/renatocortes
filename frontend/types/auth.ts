import type { UserRole } from "@prisma/client";

export type { UserRole };

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  hasBarber?: boolean;
};

export type LoginCredentials = {
  email: string;
  password: string;
};
