import { User } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/utils/cn";
import type { Barber } from "@/types/client-area";

type BarberCardProps = {
  barber: Barber;
  selected?: boolean;
  onClick?: () => void;
};

export function BarberCard({ barber, selected, onClick }: BarberCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-4 rounded-[12px] border bg-card p-4 text-left shadow-[0_16px_44px_rgba(0,0,0,0.24)] transition hover:border-primary/60 hover:bg-white/[0.055]",
        selected ? "border-primary bg-primary/10 shadow-red" : "border-primary/18"
      )}
    >
      <Avatar name={barber.name} className="h-14 w-14" />
      <div className="min-w-0 flex-1">
        <h3 className="font-black uppercase">{barber.name}</h3>
        <p className="mt-1 text-sm text-white/58">{barber.specialty}</p>
      </div>
      <User className="h-5 w-5 text-primary/55" />
    </button>
  );
}
