import { z } from "zod";
import { minutesFromTime, type BookingInterval } from "@/lib/client-scheduling";

export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const breakSchema = z.object({
  startTime: timeSchema,
  endTime: timeSchema,
  label: z.string().trim().max(80).optional()
}).strict();

export type ScheduleBreakInput = z.infer<typeof breakSchema>;

export function overlaps(a: BookingInterval, b: BookingInterval) {
  return a.start < b.end && a.end > b.start;
}

export function timeInterval(value: { startTime: string; endTime: string }): BookingInterval {
  return { start: minutesFromTime(value.startTime), end: minutesFromTime(value.endTime) };
}

export function dayValidationMessage(day: { startTime: string; endTime: string; breaks?: ScheduleBreakInput[] }) {
  if (!timeSchema.safeParse(day.startTime).success || !timeSchema.safeParse(day.endTime).success || (day.breaks ?? []).some((pause) => !timeSchema.safeParse(pause.startTime).success || !timeSchema.safeParse(pause.endTime).success)) return "Preencha os horarios no formato HH:MM.";
  const window = timeInterval(day);
  if (window.start >= window.end) return "O inicio do atendimento precisa ser anterior ao fim.";
  const breaks = (day.breaks ?? []).map(timeInterval).sort((a, b) => a.start - b.start);
  for (let i = 0; i < breaks.length; i++) {
    const pause = breaks[i];
    if (pause.start >= pause.end) return "O inicio do intervalo precisa ser anterior ao fim.";
    if (pause.start < window.start || pause.end > window.end) return "O intervalo precisa estar dentro do horario de atendimento.";
    if (i > 0 && overlaps(breaks[i - 1], pause)) return "Este intervalo entra em conflito com outro intervalo configurado.";
  }
  return null;
}

export const availabilityDaySchema = z.object({
  weekDay: z.number().int().min(0).max(6),
  label: z.string().max(40).optional(),
  active: z.boolean(),
  startTime: timeSchema,
  endTime: timeSchema,
  // Omission preserves stored breaks for older callers; [] explicitly removes them.
  breaks: z.array(breakSchema).max(12).optional()
}).strict().superRefine((day, ctx) => {
  const message = dayValidationMessage(day);
  if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
});

export const weeklyAvailabilitySchema = z.array(availabilityDaySchema).length(7).refine(
  (days) => new Set(days.map((day) => day.weekDay)).size === 7,
  "Informe cada dia da semana uma unica vez."
);
export type AvailabilityDayInput = z.infer<typeof availabilityDaySchema>;
