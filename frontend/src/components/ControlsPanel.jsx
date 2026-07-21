
function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-8 h-4.5 rounded-full transition-colors shrink-0 ${
        checked ? "bg-[var(--safety-orange)]" : "bg-[var(--graphite-600)]"
      }`}
      style={{ height: 18, width: 32 }}
    >
      <span
        className="absolute top-0.5 w-3.5 h-3.5 rounded-full bg-[var(--paper)] transition-transform"
        style={{ left: checked ? 16 : 2 }}
      />
    </button>
  );
}

function NumberField({ value, onChange, max = 10 }) {
  return (
    <input
      type="number"
      min={0}
      max={max}
      value={value}
      onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value))))}
      className="w-12 bg-[var(--graphite-800)] border border-[var(--graphite-600)] rounded-sm px-1.5 py-0.5 text-xs text-center font-mono text-[var(--paper)] focus:border-[var(--blueprint-glow)] outline-none"
    />
  );
}

export default function ControlsPanel({
  models,
  model,
  setModel,
  detailLevel,
  setDetailLevel,
  enableSyntaxLoop,
  setEnableSyntaxLoop,
  maxSyntaxRetries,
  setMaxSyntaxRetries,
  enableInternalLoop,
  setEnableInternalLoop,
  maxInternalIterations,
  setMaxInternalIterations,
  libraries,
  selectedLibraries,
  setSelectedLibraries,
  saveStl,
  setSaveStl,
  generateGcode,
  setGenerateGcode,
}) {
  const DETAIL_LEVELS = [
    { id: "draft", label: "draft", hint: "fast, rough concept" },
    { id: "standard", label: "standard", hint: "clean, smooth curves" },
    { id: "production", label: "production", hint: "fillets, tolerances, modular code" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--paper-dim)]">
          Model
        </label>
        <input
          list="model-options"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="mt-1 w-full bg-[var(--graphite-800)] border border-[var(--graphite-600)] rounded-sm px-3 py-1.5 text-sm text-[var(--paper)] focus:border-[var(--blueprint-glow)] outline-none"
        />
        <datalist id="model-options">
          {models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <p className="mt-1 font-mono text-[9px] text-[var(--paper-faint)]">
          pick a preset or type any model id your configured provider supports
        </p>
      </div>

      <div>
        <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--paper-dim)]">
          Detail level
        </label>
        <div className="mt-1 flex gap-1">
          {DETAIL_LEVELS.map((d) => (
            <button
              key={d.id}
              onClick={() => setDetailLevel(d.id)}
              title={d.hint}
              className={`flex-1 px-2 py-1.5 rounded-sm border text-[11px] font-mono transition-colors ${
                detailLevel === d.id
                  ? "bg-[var(--safety-orange)]/15 border-[var(--safety-orange)] text-[var(--safety-orange-glow)]"
                  : "bg-[var(--graphite-800)] border-[var(--graphite-600)] text-[var(--paper-faint)] hover:text-[var(--paper)]"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <p className="mt-1 font-mono text-[9px] text-[var(--paper-faint)]">
          {DETAIL_LEVELS.find((d) => d.id === detailLevel)?.hint}
        </p>
      </div>

      <div className="space-y-2.5 pt-1 border-t border-[var(--graphite-700)]">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--paper-dim)] pt-3">
          Feedback loops
        </p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--paper)]">Retry on syntax error</span>
          <div className="flex items-center gap-2">
            {enableSyntaxLoop && <NumberField value={maxSyntaxRetries} onChange={setMaxSyntaxRetries} />}
            <Toggle checked={enableSyntaxLoop} onChange={setEnableSyntaxLoop} />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--paper)]">Self-evaluation loop</span>
          <div className="flex items-center gap-2">
            {enableInternalLoop && <NumberField value={maxInternalIterations} onChange={setMaxInternalIterations} />}
            <Toggle checked={enableInternalLoop} onChange={setEnableInternalLoop} />
          </div>
        </div>
      </div>

      {libraries.length > 0 && (
        <div className="space-y-2 pt-1 border-t border-[var(--graphite-700)]">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--paper-dim)] pt-3">
            External libraries
          </p>
          <div className="flex flex-wrap gap-1.5">
            {libraries.map((lib) => {
              const active = selectedLibraries.includes(lib);
              return (
                <button
                  key={lib}
                  onClick={() =>
                    setSelectedLibraries((prev) =>
                      active ? prev.filter((l) => l !== lib) : [...prev, lib]
                    )
                  }
                  className={`px-2 py-1 rounded-sm border text-[11px] font-mono transition-colors ${
                    active
                      ? "bg-[var(--blueprint-dim)] border-[var(--blueprint-glow)] text-[var(--paper)]"
                      : "bg-[var(--graphite-800)] border-[var(--graphite-600)] text-[var(--paper-faint)]"
                  }`}
                >
                  {lib}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-2.5 pt-1 border-t border-[var(--graphite-700)]">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--paper-dim)] pt-3">
          Output
        </p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--paper)]">Save .stl</span>
          <Toggle checked={saveStl} onChange={setSaveStl} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--paper)]">Generate G-code</span>
          <Toggle checked={generateGcode} onChange={setGenerateGcode} />
        </div>
      </div>
    </div>
  );
}
