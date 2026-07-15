import * as React from "react";
import { cn } from "@/utils/cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon, trailing, ...props }, ref) => (
    <div className="flex h-[58px] items-center gap-4 rounded-[8px] border border-white/20 bg-white/[0.045] px-4 transition focus-within:border-primary/80">
      {icon ? <span className="text-white/70">{icon}</span> : null}
      <input
        ref={ref}
        className={cn(
          "h-full min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-white/50",
          className
        )}
        {...props}
      />
      {trailing ? <span className="text-white/70">{trailing}</span> : null}
    </div>
  )
);

Input.displayName = "Input";
