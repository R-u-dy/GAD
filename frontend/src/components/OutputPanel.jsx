import { useState } from "react";
import { Copy, Check, Download, FileCode } from "lucide-react";

function downloadBase64(base64, filename, mime) {
  const link = document.createElement("a");
  link.href = `data:${mime};base64,${base64}`;
  link.download = filename;
  link.click();
}

function downloadText(text, filename) {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function OutputPanel({ result }) {
  const [copied, setCopied] = useState(false);

  if (!result) return null;

  function copyCode() {
    navigator.clipboard.writeText(result.scad_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="bracket-frame relative bg-[var(--graphite-900)] border border-[var(--graphite-700)] rounded-sm overflow-hidden">
      <span className="bracket-tl" /><span className="bracket-tr" />
      <span className="bracket-bl" /><span className="bracket-br" />

      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--graphite-700)] bg-[var(--graphite-800)]">
        <FileCode size={13} className="text-[var(--paper-faint)]" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--paper-dim)]">
          generated openscad
        </span>
        <div className="ml-auto flex gap-1.5">
          <button
            onClick={copyCode}
            className="flex items-center gap-1 px-2 py-1 rounded-sm border border-[var(--graphite-600)] text-[10px] font-mono text-[var(--paper-dim)] hover:text-[var(--paper)] hover:border-[var(--blueprint-glow)] transition-colors"
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? "copied" : "copy"}
          </button>
          <button
            onClick={() => downloadText(result.scad_code, "model.scad")}
            className="flex items-center gap-1 px-2 py-1 rounded-sm border border-[var(--graphite-600)] text-[10px] font-mono text-[var(--paper-dim)] hover:text-[var(--paper)] hover:border-[var(--blueprint-glow)] transition-colors"
          >
            <Download size={11} /> .scad
          </button>
          {result.stl_base64 && (
            <button
              onClick={() => downloadBase64(result.stl_base64, "model.stl", "model/stl")}
              className="flex items-center gap-1 px-2 py-1 rounded-sm border border-[var(--graphite-600)] text-[10px] font-mono text-[var(--paper-dim)] hover:text-[var(--paper)] hover:border-[var(--blueprint-glow)] transition-colors"
            >
              <Download size={11} /> .stl
            </button>
          )}
          {result.gcode_base64 && (
            <button
              onClick={() => downloadBase64(result.gcode_base64, "model.gcode", "text/plain")}
              className="flex items-center gap-1 px-2 py-1 rounded-sm border border-[var(--graphite-600)] text-[10px] font-mono text-[var(--paper-dim)] hover:text-[var(--paper)] hover:border-[var(--blueprint-glow)] transition-colors"
            >
              <Download size={11} /> .gcode
            </button>
          )}
        </div>
      </div>

      <pre className="p-3 text-[11px] leading-relaxed font-mono text-[var(--blueprint-glow)] overflow-x-auto max-h-56 overflow-y-auto">
        {result.scad_code}
      </pre>

      {result.stl_error && (
        <p className="px-3 pb-2 text-[11px] font-mono text-[var(--err-red)]">
          STL render failed: {result.stl_error}
        </p>
      )}
      {result.gcode_error && (
        <p className="px-3 pb-2 text-[11px] font-mono text-[var(--err-red)]">
          G-code generation failed: {result.gcode_error}
        </p>
      )}
    </div>
  );
}
