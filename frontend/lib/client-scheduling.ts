import { dateInputFromDate, SAO_PAULO_OFFSET } from "@/lib/server/date-periods";

export function minutesFromTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function clientBookingDates(now = new Date()) {
  const today = dateInputFromDate(now);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${today}T12:00:00${SAO_PAULO_OFFSET}`);
    date.setUTCDate(date.getUTCDate() + index);
    return { value: dateInputFromDate(date), label: new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" }).format(date).replace(".", "") };
  });
}

export function minutesInSaoPaulo(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  return Number(parts.find((part) => part.type === "hour")?.value) * 60 + Number(parts.find((part) => part.type === "minute")?.value);
}

export function validBookingDate(date: string) {
  const instant = new Date(`${date}T12:00:00${SAO_PAULO_OFFSET}`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(+instant) && dateInputFromDate(instant) === date;
}

/** Restricao exclusiva do CLIENT; nao define nem amplia o expediente. */
export function clientBookingWindow(date: string, now: Date) {
  const today = dateInputFromDate(now);
  if (!validBookingDate(date) || date < today) return { start: 0, end: 0, message: "Escolha uma data valida a partir de hoje." };
  if (date > today) return { start: 0, end: 1440, message: "" };
  const current = minutesInSaoPaulo(now);
  if (current < 720) return { start: 720, end: 1080, message: "Agendamentos para hoje estao disponiveis somente no turno da tarde." };
  if (current < 1080) return { start: 1080, end: 1440, message: "Agendamentos para hoje estao disponiveis somente no turno da noite." };
  return { start: 0, end: 0, message: "Os agendamentos para hoje foram encerrados. Escolha uma data a partir de amanha." };
}

export function clientSlotAllowed(date: string, time: string, now: Date) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return false;
  const window = clientBookingWindow(date, now);
  const minute = minutesFromTime(time);
  return minute >= window.start && minute < window.end;
}

export type BookingInterval = { start: number; end: number };

export function slotFitsAvailability(start: number, duration: number, windows: BookingInterval[], busy: BookingInterval[]) {
  const end = start + duration;
  return duration > 0 && windows.some((window) => start >= window.start && end <= window.end) &&
    !busy.some((appointment) => start < appointment.end && end > appointment.start);
}

/** Preserva a grade de 60 minutos ancorada no inicio de cada expediente. */
export function clientAvailableTimes(date: string, duration: number, windows: BookingInterval[], busy: BookingInterval[], now: Date) {
  const times = new Set<string>();
  for (const window of windows) {
    for (let start = window.start; start + duration <= window.end && duration > 0; start += 60) {
      const time = `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`;
      if (clientSlotAllowed(date, time, now) && slotFitsAvailability(start, duration, windows, busy)) times.add(time);
    }
  }
  return [...times].sort();
}
