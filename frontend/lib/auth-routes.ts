import type { UserRole } from "@/types/auth";

/**
 * Centraliza o destino pos-login por perfil interno.
 * ADMIN com cadastro de barbeiro entra primeiro no painel do barbeiro para
 * operar a propria agenda; o acesso administrativo continua por navegaçao
 * interna. Essa regra evita que BARBER/ADMIN caiam na area CLIENT.
 */
export function getDashboardPath(role: UserRole, hasBarber = false) {
  if (role === "CLIENT") return "/cliente";
  if (role === "BARBER") return "/funcionario";
  if (role === "ADMIN") return hasBarber ? "/funcionario" : "/admin";
  if (role === "DEVELOPER") return "/admin";
  return "/login";
}
