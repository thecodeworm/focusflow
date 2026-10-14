import * as React from "react";
import { AlertDialog as AlertPrimitive } from "radix-ui";
import { Button } from "./button";

interface ConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, destructive, onConfirm }: ConfirmProps) {
  return (
    <AlertPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertPrimitive.Portal>
        <AlertPrimitive.Overlay className="fixed inset-0 z-50 bg-black/25 data-[state=open]:animate-[ff-fade_160ms_ease-out] dark:bg-black/50" />
        <AlertPrimitive.Content className="fixed top-1/2 left-1/2 z-50 w-[min(400px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-elevated p-5 shadow-pop data-[state=open]:animate-[ff-pop_180ms_cubic-bezier(0.2,0.9,0.3,1)]">
          <AlertPrimitive.Title className="text-[15px] font-semibold text-fg">{title}</AlertPrimitive.Title>
          <AlertPrimitive.Description className="mt-1.5 text-[13px] leading-relaxed text-fg-2">{description}</AlertPrimitive.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertPrimitive.Cancel asChild>
              <Button variant="secondary">Cancel</Button>
            </AlertPrimitive.Cancel>
            <AlertPrimitive.Action asChild>
              <Button variant={destructive ? "danger" : "primary"} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertPrimitive.Action>
          </div>
        </AlertPrimitive.Content>
      </AlertPrimitive.Portal>
    </AlertPrimitive.Root>
  );
}
