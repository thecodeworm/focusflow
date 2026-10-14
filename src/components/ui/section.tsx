import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-card border border-line bg-surface shadow-soft", className)} {...props} />;
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between px-1">
      <h3 className="text-[12px] font-semibold tracking-wide text-fg-2 uppercase">{children}</h3>
      {action}
    </div>
  );
}

/** A settings-style row: label + description on the left, control on the right. */
export function Row({
  label,
  description,
  children,
  className,
  htmlFor,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn("flex min-h-[48px] items-center justify-between gap-6 px-4 py-2.5", className)}>
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-[13px] font-medium text-fg">
          {label}
        </label>
        {description && <p className="mt-0.5 text-[12px] leading-snug text-fg-2">{description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

export function RowGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return <Card className={cn("divide-y divide-line overflow-hidden", className)}>{children}</Card>;
}
