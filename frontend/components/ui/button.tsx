import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils/cn";

const buttonVariants = cva(
  "inline-flex h-14 items-center justify-center gap-3 rounded-[8px] px-6 text-sm font-bold uppercase tracking-[0.04em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground shadow-red hover:bg-[#ff2d35]",
        outline: "border border-primary bg-transparent text-primary hover:bg-primary hover:text-white",
        ghost: "bg-transparent text-white hover:bg-white/10"
      },
      size: {
        default: "h-14 px-6",
        icon: "h-12 w-12 px-0",
        lg: "h-16 px-8 text-base"
      }
    },
    defaultVariants: {
      variant: "primary",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  )
);

Button.displayName = "Button";
