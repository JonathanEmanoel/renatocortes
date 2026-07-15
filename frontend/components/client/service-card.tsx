import { Check } from "lucide-react";
import { cn } from "@/utils/cn";
import type { Service } from "@/types/client-area";

type ServiceCardProps = {
  service: Service;
  selected?: boolean;
  onClick?: () => void;
};

export function ServiceCard({ service, selected, onClick }: ServiceCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-[8px] border bg-card p-5 text-left transition hover:-translate-y-1 hover:border-primary/50",
        selected ? "border-primary" : "border-white/14"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <service.icon className="h-9 w-9 text-primary" />
        {selected ? <Check className="h-6 w-6 text-primary" /> : null}
      </div>
      <h3 className="mt-5 font-black uppercase">{service.name}</h3>
      <p className="mt-2 text-sm text-white/58">{service.duration}</p>
      <p className="mt-4 text-xl font-black text-primary">{service.price}</p>
    </button>
  );
}
