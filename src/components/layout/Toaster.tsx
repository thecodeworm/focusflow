import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useToasts } from "@/stores/toast";
import { cn } from "@/lib/utils";

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed bottom-5 left-[calc(208px+24px)] z-50 flex max-w-[420px] flex-col gap-2" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-line bg-elevated py-2.5 pr-2 pl-3 text-[12.5px] text-fg shadow-pop"
            role={t.tone === "error" ? "alert" : "status"}
          >
            {t.tone === "error" ? (
              <AlertCircle className="mt-px size-4 shrink-0 text-danger" />
            ) : t.tone === "success" ? (
              <CheckCircle2 className="mt-px size-4 shrink-0 text-success" />
            ) : (
              <Info className="mt-px size-4 shrink-0 text-fg-2" />
            )}
            <p className={cn("flex-1 leading-snug")}>{t.message}</p>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="flex size-5 shrink-0 items-center justify-center rounded text-fg-3 hover:bg-hover hover:text-fg">
              <X className="size-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
