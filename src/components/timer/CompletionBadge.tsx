import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";

/** Brief, quiet confirmation shown in the ring when a session completes. */
export function CompletionBadge({ show, label, size = 44 }: { show: boolean; label: string; size?: number }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ borderRadius: "50%" }}
        >
          <motion.div
            className="flex items-center justify-center rounded-full bg-accent text-accent-fg"
            style={{ width: size, height: size }}
            initial={{ scale: 0.4 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
          >
            <Check strokeWidth={3} style={{ width: size * 0.5, height: size * 0.5 }} />
          </motion.div>
          <motion.span
            className="mt-2 text-[12px] font-medium text-fg-2"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.2 }}
          >
            {label}
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
