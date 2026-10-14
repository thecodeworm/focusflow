import * as React from "react";
import { Slider as SliderPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

export const Slider = React.forwardRef<
  React.ComponentRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("relative flex h-4 w-full touch-none select-none items-center data-[disabled]:opacity-45", className)}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-[4px] w-full grow overflow-hidden rounded-full bg-line">
      <SliderPrimitive.Range className="absolute h-full bg-accent" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className="block size-[14px] rounded-full border border-black/10 bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-100 hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
      aria-label={props["aria-label"]}
    />
  </SliderPrimitive.Root>
));
Slider.displayName = "Slider";
