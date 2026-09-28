export function formatCurrency(value: number | string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value));
}

export const OPERATIONAL_TIME_ZONE = "America/Sao_Paulo";

/** Formata datas operacionais sempre no calendario da barbearia. */
export function formatDatePtBr(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: OPERATIONAL_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

/** Versao sem ano no calendario da barbearia. */
export function formatShortDatePtBr(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: OPERATIONAL_TIME_ZONE,
    day: "2-digit",
    month: "short"
  }).format(date);
}

/** Hora operacional em 24h, independente do timezone do servidor. */
export function formatTimePtBr(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: OPERATIONAL_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}
