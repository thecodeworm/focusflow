import { Select as SelectPrimitive } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  value: T;
  onValueChange: (v: T) => void;
  options: SelectOption<T>[];
  className?: string;
  "aria-label"?: string;
  placeholder?: string;
}

export function Select<T extends string>({ value, onValueChange, options, className, placeholder, ...rest }: Props<T>) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={(v) => onValueChange(v as T)}>
      <SelectPrimitive.Trigger
        aria-label={rest["aria-label"]}
        className={cn(
          "inline-flex h-8 min-w-[140px] items-center justify-between gap-2 rounded-[9px] border border-line bg-surface px-2.5 text-[13px] text-fg shadow-soft outline-none transition-colors duration-150 hover:bg-hover data-[placeholder]:text-fg-3",
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="size-3.5 text-fg-2" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-[300px] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-line bg-elevated p-1 text-fg shadow-pop data-[state=open]:animate-[ff-pop_140ms_ease-out]"
        >
          <SelectPrimitive.Viewport>
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className="relative flex h-7 cursor-default items-center rounded-md pr-7 pl-2 text-[13px] outline-none select-none data-[highlighted]:bg-hover"
              >
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2">
                  <Check className="size-3.5 text-accent" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
