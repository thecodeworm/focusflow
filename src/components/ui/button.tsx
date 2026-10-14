import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-medium select-none transition-[background-color,color,box-shadow,transform,opacity] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:bg-accent-hover shadow-soft",
        secondary: "bg-surface text-fg border border-line hover:bg-hover shadow-soft",
        ghost: "text-fg-2 hover:text-fg hover:bg-hover",
        subtle: "bg-sunken text-fg hover:bg-press",
        danger: "bg-danger text-white hover:opacity-90",
        "danger-ghost": "text-danger hover:bg-danger/10",
      },
      size: {
        sm: "h-7 rounded-lg px-2.5 text-[12.5px] [&_svg]:size-3.5",
        md: "h-8 rounded-[9px] px-3 text-[13px] [&_svg]:size-4",
        lg: "h-10 rounded-[11px] px-4 text-[14px] [&_svg]:size-4",
        icon: "size-8 rounded-[9px] [&_svg]:size-4",
        "icon-sm": "size-7 rounded-lg [&_svg]:size-3.5",
        "icon-xs": "size-6 rounded-md [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, type = "button", ...props }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = "Button";

export { buttonVariants };
