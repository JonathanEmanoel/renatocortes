/**
 * Calendario compartilhado dos filtros operacionais e financeiros.
 * Entradas civis YYYY-MM-DD tornam-se limites inclusivos com offset -03:00;
 * a conversao de instantes para datas usa America/Sao_Paulo. Helpers de
 * aritmetica abaixo usam Date local ao meio-dia, nao uma biblioteca de timezone.
 */
export type PeriodFilter = {
  period?: string;
  date?: string;
  month?: string;
  startDate?: string;
  endDate?: string;
};

export type ResolvedPeriodRange = {
  period: string;
  date: string;
  month: string;
  startDate: string;
  endDate: string;
  start: Date;
  end: Date;
  label: string;
  invalid?: boolean;
  error?: string;
};

export const SAO_PAULO_OFFSET = "-03:00";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/**
 * Extrai a data civil da barbearia sem depender do timezone do servidor.
 * Usado para agrupar instantes e preencher inputs sem o deslocamento de toISOString.
 */
export function dateInputFromDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}

export function todayDateInput() {
  return dateInputFromDate(new Date());
}

/**
 * Rejeita formato incorreto e datas normalizadas pelo Date, como 31 de fevereiro.
 * Compara os componentes locais apos construir o instante ao meio-dia -03:00.
 */
export function isValidDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(`${value}T12:00:00${SAO_PAULO_OFFSET}`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === year &&
    date.getMonth() + 1 === month &&
    date.getDate() === day
  );
}

/**
 * Desloca dias civis para navegar periodos e montar series, preservando YYYY-MM-DD.
 * Parte do meio-dia -03:00 e usa setDate/getters locais, inclusive nas viradas
 * de mes e ano; espera uma data de entrada valida.
 */
export function addDaysInput(value: string, days: number) {
  const date = new Date(`${value}T12:00:00${SAO_PAULO_OFFSET}`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Limite inclusivo gte do dia civil usando o offset fixo -03:00. */
export function startOfSaoPauloDay(value: string) {
  return new Date(`${value}T00:00:00${SAO_PAULO_OFFSET}`);
}

/** Limite inclusivo lte; inclui o ultimo milissegundo do dia civil -03:00. */
export function endOfSaoPauloDay(value: string) {
  return new Date(`${value}T23:59:59.999${SAO_PAULO_OFFSET}`);
}

/** Compara datas civis normalizadas; nao substitui a validacao do formato. */
export function isSameOrBeforeToday(value: string) {
  return value <= todayDateInput();
}

/**
 * Valida somente a ordem lexicografica de datas YYYY-MM-DD ja normalizadas.
 * Um limite ausente e aceito para permitir defaults definidos pelo chamador.
 */
export function isValidDateOrder(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return true;
  return startDate <= endDate;
}

function firstDayOfMonth(month: string) {
  return `${month}-01`;
}

/** Usa dia zero do mes seguinte para incluir corretamente meses de 28 a 31 dias. */
function lastDayOfMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber, 0);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Retorna a segunda-feira da semana civil da ancora; domingo e tratado como 7
 * para recuar seis dias, em vez de avancar para a semana seguinte.
 */
function startOfWeekInput(anchor: string) {
  const date = new Date(`${anchor}T12:00:00${SAO_PAULO_OFFSET}`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Fecha o caixa de sabado a sexta, diferentemente do filtro semanal civil.
 * Inclui a sexta da ancora ou a proxima sexta, com os seis dias anteriores.
 * Os instantes retornados cobrem integralmente os dois dias extremos em -03:00.
 */
export function resolveWeeklyCashClosingRange(anchor = todayDateInput()) {
  const date = new Date(`${anchor}T12:00:00${SAO_PAULO_OFFSET}`);
  const daysUntilFriday = (5 - date.getDay() + 7) % 7;
  const endDate = addDaysInput(anchor, daysUntilFriday);
  const startDate = addDaysInput(endDate, -6);

  return {
    startDate,
    endDate,
    start: startOfSaoPauloDay(startDate),
    end: endOfSaoPauloDay(endDate),
    label: `Fechamento semanal ${startOfSaoPauloDay(startDate).toLocaleDateString("pt-BR")} a ${startOfSaoPauloDay(endDate).toLocaleDateString("pt-BR")}`
  };
}

/**
 * Resolve dia, semana segunda-domingo ou intervalo completo personalizado.
 * Sem ambos limites do personalizado, ou com periodo desconhecido, usa mes.
 * Datas omitidas usam hoje/mes atual; intervalo invertido sinaliza invalid para
 * que a pagina apresente o erro. A funcao nao valida o formato de cada data.
 * @returns Datas civis para formularios e instantes inclusivos para queries.
 */
export function resolvePeriodRange(filters: PeriodFilter = {}): ResolvedPeriodRange {
  const today = todayDateInput();
  const currentMonth = today.slice(0, 7);
  const period = filters.period ?? "month";

  if (period === "day") {
    const date = filters.date || today;
    return {
      period,
      date,
      month: filters.month || currentMonth,
      startDate: date,
      endDate: date,
      start: startOfSaoPauloDay(date),
      end: endOfSaoPauloDay(date),
      label: `Dia ${startOfSaoPauloDay(date).toLocaleDateString("pt-BR")}`
    };
  }

  if (period === "week") {
    const startDate = startOfWeekInput(filters.date || today);
    const endDate = addDaysInput(startDate, 6);
    return {
      period,
      date: filters.date || today,
      month: filters.month || currentMonth,
      startDate,
      endDate,
      start: startOfSaoPauloDay(startDate),
      end: endOfSaoPauloDay(endDate),
      label: `Semana ${startOfSaoPauloDay(startDate).toLocaleDateString("pt-BR")} a ${startOfSaoPauloDay(endDate).toLocaleDateString("pt-BR")}`
    };
  }

  if (period === "custom" && filters.startDate && filters.endDate) {
    if (!isValidDateOrder(filters.startDate, filters.endDate)) {
      return {
        period,
        date: filters.date || today,
        month: filters.month || currentMonth,
        startDate: filters.startDate,
        endDate: filters.endDate,
        start: startOfSaoPauloDay(filters.startDate),
        end: endOfSaoPauloDay(filters.startDate),
        label: "Periodo personalizado invalido",
        invalid: true,
        error: "A data final nao pode ser anterior a data inicial."
      };
    }

    return {
      period,
      date: filters.date || today,
      month: filters.month || currentMonth,
      startDate: filters.startDate,
      endDate: filters.endDate,
      start: startOfSaoPauloDay(filters.startDate),
      end: endOfSaoPauloDay(filters.endDate),
      label: `Personalizado ${startOfSaoPauloDay(filters.startDate).toLocaleDateString("pt-BR")} a ${startOfSaoPauloDay(filters.endDate).toLocaleDateString("pt-BR")}`
    };
  }

  const month = filters.month || currentMonth;
  const startDate = firstDayOfMonth(month);
  const endDate = lastDayOfMonth(month);
  return {
    period: "month",
    date: filters.date || today,
    month,
    startDate,
    endDate,
    start: startOfSaoPauloDay(startDate),
    end: endOfSaoPauloDay(endDate),
    label: `Mes ${startOfSaoPauloDay(startDate).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`
  };
}

/**
 * Preserva o periodo resolvido em links e exportacoes, incluindo seus defaults.
 * Parametros temporais calculados sobrescrevem chaves homonimas em extra.
 */
export function periodQuery(filters: PeriodFilter, extra: Record<string, string> = {}) {
  const query = new URLSearchParams(extra);
  const resolved = resolvePeriodRange(filters);
  query.set("period", resolved.period);
  query.set("date", resolved.date);
  query.set("month", resolved.month);
  query.set("startDate", resolved.startDate);
  query.set("endDate", resolved.endDate);
  return query.toString();
}
