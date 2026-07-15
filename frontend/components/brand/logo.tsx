import { Scissors } from "lucide-react";
import { cn } from "@/utils/cn";

type LogoProps = {
  compact?: boolean;
  className?: string;
};

export function Logo({ compact = false, className }: LogoProps) {
  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      <div className="relative grid h-24 w-24 place-items-center rounded-full border-2 border-white bg-black shadow-panel">
        <span className="absolute inset-2 rounded-full border-l-4 border-r-4 border-l-primary border-r-accentBlue" />
        <Scissors className="relative z-10 h-10 w-10 text-white" />
      </div>
      {!compact ? (
        <div className="-mt-3 rounded-[4px] border border-white/70 bg-black px-4 py-2">
          <p className="text-lg font-black uppercase leading-none tracking-[0.08em]">Renato Cortes</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-white/80">Barbearia</p>
        </div>
      ) : null}
    </div>
  );
}
