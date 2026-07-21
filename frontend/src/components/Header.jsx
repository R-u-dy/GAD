import { KeyRound } from "lucide-react";

export default function Header({ mockMode, openscadAvailable, onOpenSettings, hasUserKey }) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <header className="flex items-stretch border-b border-[var(--graphite-700)] bg-[var(--graphite-900)]">
      <div className="flex items-center gap-3 px-5 py-3">
        <div className="w-8 h-8 rounded-sm border-2 border-[var(--safety-orange)] flex items-center justify-center">
          <div className="w-2.5 h-2.5 bg-[var(--safety-orange)] rotate-45" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-[var(--paper)] leading-none">
            GAD
          </h1>
          <p className="font-mono text-[9px] uppercase tracking-widest text-[var(--paper-faint)] mt-0.5">
            generative-ai assisted design
          </p>
        </div>
      </div>

      <button
        onClick={onOpenSettings}
        className={`flex items-center gap-1.5 px-3 my-2 rounded-sm border text-[10px] font-mono uppercase tracking-wide transition-colors ${
          hasUserKey
            ? "border-[var(--ok-green)] text-[var(--ok-green)] bg-[var(--ok-green)]/10"
            : "border-[var(--graphite-600)] text-[var(--paper-dim)] hover:text-[var(--paper)] hover:border-[var(--blueprint-glow)]"
        }`}
        title="Manage your own API keys — stored only in this browser"
      >
        <KeyRound size={12} />
        {hasUserKey ? "your key active" : "add api key"}
      </button>

      {/* Title block, styled after the field-box in the corner of a real
          engineering drawing — DWG NO / SCALE / DATE fields. */}
      <div className="ml-auto flex font-mono text-[10px] uppercase tracking-wide">
        <TitleField label="Dwg No" value="GAD-001" />
        <TitleField label="Scale" value="1 : 1" />
        <TitleField label="Date" value={today} />
        <TitleField
          label="Mode"
          value={mockMode ? "mock" : "live"}
          accent={mockMode ? "var(--warn-amber)" : "var(--ok-green)"}
        />
        <TitleField
          label="OpenSCAD"
          value={openscadAvailable ? "ready" : "missing"}
          accent={openscadAvailable ? "var(--ok-green)" : "var(--err-red)"}
          last
        />
      </div>
    </header>
  );
}

function TitleField({ label, value, accent, last }) {
  return (
    <div className={`flex flex-col justify-center px-3 border-l border-[var(--graphite-700)] ${last ? "border-r" : ""}`}>
      <span className="text-[var(--paper-faint)]">{label}</span>
      <span className="font-semibold" style={{ color: accent || "var(--paper)" }}>
        {value}
      </span>
    </div>
  );
}
