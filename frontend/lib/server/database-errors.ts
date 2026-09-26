const DATABASE_UNAVAILABLE_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024"]);
const DATABASE_SCHEMA_CODES = new Set(["P2021", "P2022"]);

type ErrorWithCode = {
  code?: unknown;
  name?: unknown;
};

/** Classifica apenas falhas de infraestrutura/schema que nao devem virar erro de credencial. */
export function getDatabaseFailureKind(error: unknown): "unavailable" | "schema" | null {
  if (!error || typeof error !== "object") return null;

  const candidate = error as ErrorWithCode;
  const code = typeof candidate.code === "string" ? candidate.code : null;
  const name = typeof candidate.name === "string" ? candidate.name : "";

  if (code && DATABASE_UNAVAILABLE_CODES.has(code)) return "unavailable";
  if (code && DATABASE_SCHEMA_CODES.has(code)) return "schema";
  if (name === "PrismaClientInitializationError") return "unavailable";

  return null;
}

export function databaseUnavailableMessage() {
  return "Nosso servico de dados esta temporariamente indisponivel. Sua sessao foi preservada; tente novamente em instantes.";
}
