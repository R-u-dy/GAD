import { useEffect, useRef } from "react";
import { Terminal } from "lucide-react";

export default function SystemLog({ lines, isRunning }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div className="bracket-frame relative flex flex-col h-full bg-[var(--graphite-900)] border border-[var(--graphite-700)] rounded-sm overflow-hidden">
      <span className="bracket-tl" /><span className="bracket-tr" />
      <span className="bracket-bl" /><span className="bracket-br" />

      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--graphite-700)] bg-[var(--graphite-800)]">
        <Terminal size={13} className="text-[var(--paper-faint)]" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--paper-dim)]">
          system log
        </span>
        {isRunning && (
          <span className="ml-auto flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--safety-orange)] animate-pulse" />
            <span className="font-mono text-[10px] text-[var(--safety-orange-glow)]">running</span>
          </span>
        )}
      </div>

      <div ref={scrollRef} className="relative flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
        {isRunning && <div className="scan-line" />}
        {lines.length === 0 && (
          <p className="text-[var(--paper-faint)] italic">Waiting for a job to run…</p>
        )}
        {lines.map((line, i) => (
          <div key={i} className="text-[var(--paper-dim)] whitespace-pre-wrap break-words">
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
