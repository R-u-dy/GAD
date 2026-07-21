import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { subscribe } from "../lib/toast";

const ICONS = { success: CheckCircle2, error: XCircle, info: Info };
const COLORS = {
  success: "border-[var(--ok-green)] text-[var(--ok-green)]",
  error: "border-[var(--err-red)] text-[var(--err-red)]",
  info: "border-[var(--blueprint-glow)] text-[var(--blueprint-glow)]",
};

export default function ToastStack() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    return subscribe((entry) => {
      setToasts((prev) => [...prev, entry]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== entry.id));
      }, entry.duration);
    });
  }, []);

  function dismiss(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info;
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 24, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96 }}
              transition={{ duration: 0.18 }}
              className={`bracket-frame relative flex items-start gap-2 px-3 py-2.5 rounded-sm bg-[var(--graphite-900)] border ${COLORS[t.type]} shadow-lg`}
            >
              <Icon size={15} className="shrink-0 mt-0.5" />
              <p className="text-xs text-[var(--paper)] leading-snug pr-2">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                className="ml-auto text-[var(--paper-faint)] hover:text-[var(--paper)] shrink-0"
              >
                <X size={13} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
