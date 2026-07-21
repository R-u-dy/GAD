import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";

const STEPS = [
  { key: "generate", label: "generate", match: /requesting scad generation/i },
  { key: "syntax", label: "validate", match: /syntax check/i },
  { key: "render", label: "render views", match: /rendered \d+\/6 projection/i },
  { key: "evaluate", label: "self-evaluate", match: /self-evaluating/i },
  { key: "export", label: "export", match: /stl rendered|model passed self-evaluation/i },
];

function currentStepIndex(lines) {
  let idx = -1;
  for (const line of lines) {
    STEPS.forEach((step, i) => {
      if (step.match.test(line) && i > idx) idx = i;
    });
  }
  return idx;
}

export default function ProgressStepper({ lines, isRunning, success }) {
  if (!isRunning && lines.length === 0) return null;

  const activeIdx = currentStepIndex(lines);

  return (
    <div className="flex items-center gap-1.5">
      {STEPS.map((step, i) => {
        const isDone = i < activeIdx || (!isRunning && success && i <= activeIdx);
        const isActive = i === activeIdx && isRunning;
        const isPending = i > activeIdx;

        return (
          <div key={step.key} className="flex items-center gap-1.5 flex-1">
            <div className="flex flex-col items-center gap-1 flex-1">
              <div
                className={`w-full h-1 rounded-full transition-colors duration-300 ${
                  isDone
                    ? "bg-[var(--ok-green)]"
                    : isActive
                    ? "bg-[var(--safety-orange)]"
                    : "bg-[var(--graphite-700)]"
                }`}
              />
              <span
                className={`font-mono text-[9px] uppercase tracking-wide flex items-center gap-1 ${
                  isDone
                    ? "text-[var(--ok-green)]"
                    : isActive
                    ? "text-[var(--safety-orange-glow)]"
                    : "text-[var(--paper-faint)]"
                }`}
              >
                {isDone && <Check size={9} />}
                {isActive && <Loader2 size={9} className="animate-spin" />}
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
