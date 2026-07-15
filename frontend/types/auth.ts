export type UserRole = "CLIENT" | "EMPLOYEE";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyId: string;
};

export type LoginCredentials = {
  email: string;
  password: string;
};
