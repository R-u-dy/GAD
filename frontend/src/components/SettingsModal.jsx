import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, KeyRound, Eye, EyeOff, Trash2, ShieldCheck } from "lucide-react";
import { loadKeys, saveKeys, clearKeys } from "../lib/keyStore";

const PROVIDERS = [
  { id: "openai", label: "OpenAI", placeholder: "sk-...", help: "platform.openai.com/api-keys" },
  { id: "gemini", label: "Gemini", placeholder: "AIza...", help: "aistudio.google.com/apikey" },
  { id: "openrouter", label: "OpenRouter", placeholder: "sk-or-...", help: "openrouter.ai/keys" },
];

export default function SettingsModal({ open, onClose, serverKeys, onKeysChanged }) {
  const [keys, setKeys] = useState({ openai: "", gemini: "", openrouter: "" });
  const [visible, setVisible] = useState({});

  useEffect(() => {
    if (open) setKeys(loadKeys());
  }, [open]);

  function handleSave() {
    saveKeys(keys);
    onKeysChanged?.(keys);
    onClose();
  }

  function handleClear() {
    clearKeys();
    setKeys({ openai: "", gemini: "", openrouter: "" });
    onKeysChanged?.({ openai: "", gemini: "", openrouter: "" });
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="bracket-frame relative w-full max-w-md bg-[var(--graphite-900)] border border-[var(--graphite-700)] rounded-sm overflow-hidden"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="bracket-tl" /><span className="bracket-tr" />
            <span className="bracket-bl" /><span className="bracket-br" />

            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--graphite-700)] bg-[var(--graphite-800)]">
              <KeyRound size={14} className="text-[var(--paper-faint)]" />
              <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--paper-dim)]">
                api keys
              </span>
              <button onClick={onClose} className="ml-auto text-[var(--paper-faint)] hover:text-[var(--paper)]">
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <p className="flex items-start gap-2 text-[11px] text-[var(--paper-dim)] leading-relaxed">
                <ShieldCheck size={26} className="text-[var(--ok-green)] shrink-0" />
                Keys are stored only in this browser (localStorage) and sent directly to your own
                backend per-request. Nothing is written to disk on the server, logged, or persisted.
              </p>

              {PROVIDERS.map((p) => {
                const hasServerKey = serverKeys?.[p.id];
                return (
                  <div key={p.id}>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--paper-dim)]">
                        {p.label}
                      </label>
                      {hasServerKey && (
                        <span className="font-mono text-[9px] text-[var(--ok-green)]">
                          server key configured
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type={visible[p.id] ? "text" : "password"}
                        value={keys[p.id]}
                        onChange={(e) => setKeys((k) => ({ ...k, [p.id]: e.target.value }))}
                        placeholder={hasServerKey ? "using server key (optional override)" : p.placeholder}
                        className="w-full bg-[var(--graphite-800)] border border-[var(--graphite-600)] rounded-sm px-3 py-1.5 pr-9 text-xs font-mono text-[var(--paper)] placeholder:text-[var(--paper-faint)] focus:border-[var(--blueprint-glow)] outline-none"
                      />
                      <button
                        onClick={() => setVisible((v) => ({ ...v, [p.id]: !v[p.id] }))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--paper-faint)] hover:text-[var(--paper)]"
                        tabIndex={-1}
                      >
                        {visible[p.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                    <p className="mt-1 font-mono text-[9px] text-[var(--paper-faint)]">get a key: {p.help}</p>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 px-4 py-3 border-t border-[var(--graphite-700)] bg-[var(--graphite-800)]">
              <button
                onClick={handleClear}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-[var(--graphite-600)] text-xs font-medium text-[var(--paper-dim)] hover:text-[var(--err-red)] hover:border-[var(--err-red)] transition-colors"
              >
                <Trash2 size={12} /> clear
              </button>
              <button
                onClick={handleSave}
                className="ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded-sm bg-[var(--safety-orange)] hover:bg-[var(--safety-orange-glow)] text-[var(--graphite-950)] text-xs font-semibold transition-colors"
              >
                save
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
