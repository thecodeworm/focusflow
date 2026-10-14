import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

export const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "peer inline-flex h-[18px] w-[30px] shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 data-[state=checked]:bg-accent data-[state=unchecked]:bg-line-strong",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block size-[14px] rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.25)] ring-0 transition-transform duration-150 data-[state=checked]:translate-x-[13px] data-[state=unchecked]:translate-x-[1px]" />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";
