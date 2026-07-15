"use client";

import { Check } from "lucide-react";
import { cn } from "@/utils/cn";

type CheckboxProps = {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
};

export function Checkbox({ checked = false, onCheckedChange, className }: CheckboxProps) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "grid h-6 w-6 shrink-0 place-items-center rounded-[5px] border border-white/80 bg-transparent text-white transition hover:border-primary",
        checked && "border-primary bg-primary",
        className
      )}
    >
      {checked ? <Check className="h-4 w-4" /> : null}
    </button>
  );
}
