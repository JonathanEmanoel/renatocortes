import type { UserRole } from "@/types/auth";

export function getDashboardPath(role: UserRole, hasBarber = false) {
  if (role === "CLIENT") return "/cliente";
  if (role === "BARBER") return "/funcionario";
  if (role === "ADMIN") return hasBarber ? "/funcionario" : "/admin";
  if (role === "DEVELOPER") return "/admin";
  return "/login";
}
