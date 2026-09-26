export function formatCurrency(value: number | string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value));
}

/** Formata no timezone do ambiente; nao converte para o calendario de Sao Paulo. */
export function formatDatePtBr(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

/** Versao sem ano, preservando o timezone do ambiente de renderizacao. */
export function formatShortDatePtBr(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short"
  }).format(date);
}

/** Hora de exibicao em 24h no timezone do ambiente, sem alterar o instante recebido. */
export function formatTimePtBr(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}
