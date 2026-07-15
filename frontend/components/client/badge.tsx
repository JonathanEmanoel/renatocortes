import { cn } from "@/utils/cn";

type BadgeProps = {
  children: React.ReactNode;
  tone?: "red" | "white" | "green";
};

export function Badge({ children, tone = "red" }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.08em]",
        tone === "red" && "border-primary/50 bg-primary/12 text-primary",
        tone === "white" && "border-white/20 bg-white/10 text-white",
        tone === "green" && "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
      )}
    >
      {children}
    </span>
  );
}
