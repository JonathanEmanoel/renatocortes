import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState() {
  return (
    <div className="rounded-[8px] border border-white/14 bg-card p-7 text-center">
      <CalendarDays className="mx-auto h-10 w-10 text-primary" />
      <p className="mt-4 text-lg font-bold">Você ainda não possui horários agendados.</p>
      <Link href="/cliente/agendamento">
        <Button className="mt-6">Agendar Agora</Button>
      </Link>
    </div>
  );
}
