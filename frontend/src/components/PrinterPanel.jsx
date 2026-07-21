import { useEffect, useState } from "react";
import { Printer, Plug, Unplug, Play, Loader2, Info } from "lucide-react";
import { getPrinterPorts, connectPrinter, disconnectPrinter, printGcode, isLocalBackend } from "../lib/api";

export default function PrinterPanel({ gcodeBase64 }) {
  const [ports, setPorts] = useState([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [baudrate, setBaudrate] = useState(115200);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const local = isLocalBackend();

  useEffect(() => {
    if (!local) return; // remote backend can't reach a USB printer on this device anyway
    getPrinterPorts()
      .then((p) => {
        setPorts(p);
        if (p.length && !selectedPort) setSelectedPort(p[0]);
      })
      .catch(() => {});
  }, [local]);

  async function handleConnect() {
    setError("");
    setConnecting(true);
    try {
      await connectPrinter(selectedPort, Number(baudrate));
      setConnected(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    await disconnectPrinter();
    setConnected(false);
  }

  function handlePrint() {
    if (!gcodeBase64) return;
    setPrinting(true);
    setError("");
    printGcode(gcodeBase64, {
      onLog: (line) => setProgress(line),
      onResult: (res) => {
        setPrinting(false);
        if (!res.success) setError(res.error || "Print failed");
      },
      onError: (msg) => {
        setPrinting(false);
        setError(msg);
      },
    });
  }

  return (
    <div className="bracket-frame relative bg-[var(--graphite-900)] border border-[var(--graphite-700)] rounded-sm overflow-hidden">
      <span className="bracket-tl" /><span className="bracket-tr" />
      <span className="bracket-bl" /><span className="bracket-br" />

      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--graphite-700)] bg-[var(--graphite-800)]">
        <Printer size={13} className="text-[var(--paper-faint)]" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--paper-dim)]">
          3d printer
        </span>
        {connected && (
          <span className="ml-auto flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok-green)]" />
            <span className="font-mono text-[10px] text-[var(--ok-green)]">connected</span>
          </span>
        )}
      </div>

      <div className="p-3 space-y-2.5">
        {!local && (
          <p className="flex items-start gap-1.5 font-mono text-[10px] text-[var(--warn-amber)] leading-relaxed">
            <Info size={13} className="shrink-0 mt-0.5" />
            Printer control needs GAD running on your own computer — this
            site can't reach a printer plugged into your device. Download
            the .stl/.gcode above and print it with your usual printer
            software instead.
          </p>
        )}
        {!connected ? (
          <>
            <div className="flex gap-2">
              <select
                value={selectedPort}
                onChange={(e) => setSelectedPort(e.target.value)}
                disabled={!local}
                className="flex-1 bg-[var(--graphite-800)] border border-[var(--graphite-600)] rounded-sm px-2 py-1.5 text-xs text-[var(--paper)] outline-none focus:border-[var(--blueprint-glow)] disabled:opacity-40"
              >
                {ports.length === 0 && <option value="">no ports detected</option>}
                {ports.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <input
                type="number"
                value={baudrate}
                onChange={(e) => setBaudrate(e.target.value)}
                disabled={!local}
                className="w-24 bg-[var(--graphite-800)] border border-[var(--graphite-600)] rounded-sm px-2 py-1.5 text-xs font-mono text-[var(--paper)] outline-none focus:border-[var(--blueprint-glow)] disabled:opacity-40"
              />
            </div>
            <button
              onClick={handleConnect}
              disabled={!local || !selectedPort || connecting}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm bg-[var(--blueprint-dim)] hover:bg-[var(--blueprint)] border border-[var(--blueprint-glow)] text-xs font-medium text-[var(--paper)] transition-colors disabled:opacity-40"
            >
              {connecting ? <Loader2 size={13} className="animate-spin" /> : <Plug size={13} />}
              connect
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handlePrint}
              disabled={!gcodeBase64 || printing}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm bg-[var(--safety-orange-dim)] hover:bg-[var(--safety-orange)] border border-[var(--safety-orange-glow)] text-xs font-medium text-[var(--paper)] transition-colors disabled:opacity-40"
            >
              {printing ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              {printing ? "printing…" : "start printing"}
            </button>
            <button
              onClick={handleDisconnect}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm border border-[var(--graphite-600)] text-xs font-medium text-[var(--paper-dim)] hover:text-[var(--paper)] transition-colors"
            >
              <Unplug size={13} /> disconnect
            </button>
          </>
        )}

        {!gcodeBase64 && connected && (
          <p className="font-mono text-[10px] text-[var(--paper-faint)]">
            enable "generate g-code" and generate a model first.
          </p>
        )}
        {progress && <p className="font-mono text-[10px] text-[var(--paper-faint)] truncate">{progress}</p>}
        {error && <p className="font-mono text-[10px] text-[var(--err-red)]">{error}</p>}
      </div>
    </div>
  );
}
