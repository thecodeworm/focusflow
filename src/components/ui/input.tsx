import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    spellCheck={false}
    autoComplete="off"
    className={cn(
      "h-8 w-full min-w-0 rounded-[9px] border border-line bg-surface px-2.5 text-[13px] text-fg shadow-soft outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-fg-3 focus:border-accent/60 focus:ring-3 focus:ring-accent/15 disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
