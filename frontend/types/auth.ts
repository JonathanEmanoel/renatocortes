export type UserRole = "ADMIN" | "CLIENT" | "BARBER" | "EMPLOYEE" | "DEVELOPER";

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
