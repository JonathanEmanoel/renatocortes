import { dateInputFromDate, startOfSaoPauloDay } from "@/lib/server/date-periods";

export function assertDueDay(day: number) {
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error("Dia de vencimento invalido.");
}

/** Clamp only the effective date, never the original base day. */
export function dueDateInMonth(month: string, baseDueDay: number) {
  assertDueDay(baseDueDay);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 1900) throw new Error("Competencia invalida.");
  const [year, number] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return startOfSaoPauloDay(`${month}-${String(Math.min(baseDueDay, lastDay)).padStart(2, "0")}`);
}

export function nextCycleDueDate(dueDate: Date, baseDueDay: number) {
  const [year, month] = dateInputFromDate(dueDate).split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
  return dueDateInMonth(next, baseDueDay);
}
