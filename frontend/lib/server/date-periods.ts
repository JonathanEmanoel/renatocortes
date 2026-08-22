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

export function addDaysInput(value: string, days: number) {
  const date = new Date(`${value}T12:00:00${SAO_PAULO_OFFSET}`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function startOfSaoPauloDay(value: string) {
  return new Date(`${value}T00:00:00${SAO_PAULO_OFFSET}`);
}

export function endOfSaoPauloDay(value: string) {
  return new Date(`${value}T23:59:59.999${SAO_PAULO_OFFSET}`);
}

export function isSameOrBeforeToday(value: string) {
  return value <= todayDateInput();
}

export function isValidDateOrder(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return true;
  return startDate <= endDate;
}

function firstDayOfMonth(month: string) {
  return `${month}-01`;
}

function lastDayOfMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber, 0);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfWeekInput(anchor: string) {
  const date = new Date(`${anchor}T12:00:00${SAO_PAULO_OFFSET}`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

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
