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
        "w-full rounded-[12px] border bg-card p-5 text-left shadow-[0_16px_44px_rgba(0,0,0,0.28)] transition hover:-translate-y-1 hover:border-primary/60 hover:bg-white/[0.055]",
        selected ? "border-primary bg-primary/10 shadow-red" : "border-primary/18"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <span className="grid h-12 w-12 place-items-center rounded-full border border-primary/35 bg-black/45">
          <service.icon className="h-6 w-6 text-primary" />
        </span>
        {selected ? <Check className="h-6 w-6 text-primary" /> : null}
      </div>
      <h3 className="mt-5 min-h-[44px] font-black uppercase leading-tight">{service.name}</h3>
      <p className="mt-2 text-sm font-semibold text-white/58">{service.duration}</p>
      <p className="mt-4 inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-base font-black text-primary">
        {service.price}
      </p>
    </button>
  );
}
