import { Star, User } from "lucide-react";
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
        "flex w-full items-center gap-4 rounded-[8px] border bg-card p-4 text-left transition hover:border-primary/50",
        selected ? "border-primary" : "border-white/14"
      )}
    >
      <Avatar name={barber.name} className="h-14 w-14" />
      <div className="min-w-0 flex-1">
        <h3 className="font-black uppercase">{barber.name}</h3>
        <p className="mt-1 text-sm text-white/58">{barber.specialty}</p>
        <p className="mt-2 flex items-center gap-2 text-sm text-primary">
          <Star className="h-4 w-4 fill-primary" />
          {barber.rating}
        </p>
      </div>
      <User className="h-5 w-5 text-white/30" />
    </button>
  );
}
