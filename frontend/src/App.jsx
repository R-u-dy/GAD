import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Hammer, Loader2, AlertCircle } from "lucide-react";
import Header from "./components/Header";
import InputPanel from "./components/InputPanel";
import ControlsPanel from "./components/ControlsPanel";
import SystemLog from "./components/SystemLog";
import ModelViewer from "./components/ModelViewer";
import OutputPanel from "./components/OutputPanel";
import PrinterPanel from "./components/PrinterPanel";
import SettingsModal from "./components/SettingsModal";
import ToastStack from "./components/ToastStack";
import ProgressStepper from "./components/ProgressStepper";
import { getStatus, getModels, getLibraries, generateModel } from "./lib/api";
import { loadKeys, keyForModel } from "./lib/keyStore";
import { toast } from "./lib/toast";

const SETTINGS_KEY = "gad_settings_v1";

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    return {};
  }
}

export default function App() {
  const saved = loadSettings();

  const [status, setStatus] = useState({ mock_mode: true, openscad_available: false, server_keys: {} });
  const [models, setModels] = useState(["gpt-4o"]);
  const [libraries, setLibraries] = useState([]);
  const [userKeys, setUserKeys] = useState(loadKeys());
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Input state
  const [description, setDescription] = useState("");
  const [images, setImages] = useState([]);

  // Controls state (persisted across sessions for convenience)
  const [model, setModel] = useState(saved.model ?? "gpt-4o");
  const [detailLevel, setDetailLevel] = useState(saved.detailLevel ?? "standard");
  const [enableSyntaxLoop, setEnableSyntaxLoop] = useState(saved.enableSyntaxLoop ?? true);
  const [maxSyntaxRetries, setMaxSyntaxRetries] = useState(saved.maxSyntaxRetries ?? 3);
  const [enableInternalLoop, setEnableInternalLoop] = useState(saved.enableInternalLoop ?? true);
  const [maxInternalIterations, setMaxInternalIterations] = useState(saved.maxInternalIterations ?? 3);
  const [selectedLibraries, setSelectedLibraries] = useState([]);
  const [saveStl, setSaveStl] = useState(saved.saveStl ?? true);
  const [generateGcode, setGenerateGcode] = useState(saved.generateGcode ?? false);

  // Run state
  const [logLines, setLogLines] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [runError, setRunError] = useState("");

  useEffect(() => {
    getStatus().then(setStatus).catch(() => toast.error("Couldn't reach the backend. Is it running?"));
    getModels().then(setModels).catch(() => {});
    getLibraries().then(setLibraries).catch(() => {});
  }, []);

  useEffect(() => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        model, detailLevel, enableSyntaxLoop, maxSyntaxRetries, enableInternalLoop,
        maxInternalIterations, saveStl, generateGcode,
      })
    );
  }, [model, detailLevel, enableSyntaxLoop, maxSyntaxRetries, enableInternalLoop, maxInternalIterations, saveStl, generateGcode]);

  const handleGenerate = useCallback(() => {
    if (isRunning) return;
    if (!description.trim() && images.length === 0) {
      setRunError("Provide a description, voice input, and/or reference images.");
      toast.error("Add a description, voice input, or an image first.");
      return;
    }
    setRunError("");
    setResult(null);
    setLogLines([]);
    setIsRunning(true);

    const apiKey = keyForModel(model, userKeys);

    generateModel(
      {
        description,
        images: images.map((i) => i.base64),
        model,
        enable_syntax_loop: enableSyntaxLoop,
        max_syntax_retries: maxSyntaxRetries,
        enable_internal_loop: enableInternalLoop,
        max_internal_iterations: maxInternalIterations,
        libraries: selectedLibraries,
        save_stl: saveStl,
        generate_gcode: generateGcode,
        detail_level: detailLevel,
        api_key: apiKey,
      },
      {
        onLog: (line) => setLogLines((prev) => [...prev, line]),
        onResult: (res) => {
          setIsRunning(false);
          setResult(res);
          if (res.success) {
            toast.success("Model generated successfully.");
          } else {
            setRunError(res.error || "Generation failed.");
            toast.error(res.error || "Generation failed.");
          }
        },
        onError: (msg) => {
          setIsRunning(false);
          setRunError(msg);
          toast.error(msg);
        },
      }
    );
  }, [
    isRunning, description, images, model, userKeys, enableSyntaxLoop, maxSyntaxRetries,
    enableInternalLoop, maxInternalIterations, selectedLibraries, saveStl, generateGcode,
  ]);

  // Cmd/Ctrl+Enter anywhere on the page triggers generation.
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleGenerate();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleGenerate]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        mockMode={status.mock_mode}
        openscadAvailable={status.openscad_available}
        onOpenSettings={() => setSettingsOpen(true)}
        hasUserKey={Object.values(userKeys).some(Boolean)}
      />

      <ToastStack />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        serverKeys={status.server_keys}
        onKeysChanged={setUserKeys}
      />

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[320px_1fr_320px] gap-4 p-4 max-w-[1600px] w-full mx-auto pb-24 lg:pb-4">
        {/* Left column: input + controls */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35 }}
          className="space-y-4"
        >
          <Panel title="Input">
            <InputPanel
              description={description}
              setDescription={setDescription}
              images={images}
              setImages={setImages}
            />
          </Panel>

          <Panel title="Configuration">
            <ControlsPanel
              models={models}
              model={model}
              setModel={setModel}
              detailLevel={detailLevel}
              setDetailLevel={setDetailLevel}
              enableSyntaxLoop={enableSyntaxLoop}
              setEnableSyntaxLoop={setEnableSyntaxLoop}
              maxSyntaxRetries={maxSyntaxRetries}
              setMaxSyntaxRetries={setMaxSyntaxRetries}
              enableInternalLoop={enableInternalLoop}
              setEnableInternalLoop={setEnableInternalLoop}
              maxInternalIterations={maxInternalIterations}
              setMaxInternalIterations={setMaxInternalIterations}
              libraries={libraries}
              selectedLibraries={selectedLibraries}
              setSelectedLibraries={setSelectedLibraries}
              saveStl={saveStl}
              setSaveStl={setSaveStl}
              generateGcode={generateGcode}
              setGenerateGcode={setGenerateGcode}
            />
          </Panel>

          {/* Desktop generate button — hidden on mobile in favor of the sticky bar */}
          <div className="hidden lg:block space-y-2">
            <GenerateButton isRunning={isRunning} onClick={handleGenerate} />
            <AnimatePresence>
              {runError && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-start gap-1.5 font-mono text-[11px] text-[var(--err-red)] px-1"
                >
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  {runError}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Center column: 3D viewer + output */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="space-y-4 min-h-[500px] flex flex-col"
        >
          {(isRunning || logLines.length > 0) && (
            <div className="bracket-frame relative bg-[var(--graphite-900)] border border-[var(--graphite-700)] rounded-sm px-4 py-3">
              <span className="bracket-tl" /><span className="bracket-tr" />
              <span className="bracket-bl" /><span className="bracket-br" />
              <ProgressStepper lines={logLines} isRunning={isRunning} success={result?.success} />
            </div>
          )}
          <div className="flex-1 min-h-[420px]">
            <ModelViewer stlBase64={result?.stl_base64} isLoading={isRunning} />
          </div>
          <AnimatePresence>
            {result?.scad_code && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <OutputPanel result={result} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Right column: log + printer */}
        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="space-y-4 flex flex-col min-h-[500px]"
        >
          <div className="flex-1 min-h-[300px]">
            <SystemLog lines={logLines} isRunning={isRunning} />
          </div>
          <PrinterPanel gcodeBase64={result?.gcode_base64} />
        </motion.div>
      </main>

      {/* Sticky mobile generate bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 p-3 bg-[var(--graphite-900)]/95 backdrop-blur border-t border-[var(--graphite-700)]">
        <GenerateButton isRunning={isRunning} onClick={handleGenerate} />
      </div>

      <footer className="hidden lg:block px-4 py-3 border-t border-[var(--graphite-700)] font-mono text-[10px] text-[var(--paper-faint)] text-center">
        GAD — after Daareyni et al., "Generative AI meets CAD" (2025) · ⌘/Ctrl + Enter to generate
      </footer>
    </div>
  );
}

function GenerateButton({ isRunning, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={isRunning}
      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-sm bg-[var(--safety-orange)] hover:bg-[var(--safety-orange-glow)] active:scale-[0.99] text-[var(--graphite-950)] font-semibold text-sm transition-all disabled:opacity-50 shadow-[0_0_24px_-8px_var(--safety-orange)]"
    >
      {isRunning ? <Loader2 size={16} className="animate-spin" /> : <Hammer size={16} />}
      {isRunning ? "generating…" : "generate scad"}
    </button>
  );
}

function Panel({ title, children }) {
  return (
    <div className="bracket-frame relative bg-[var(--graphite-900)] border border-[var(--graphite-700)] rounded-sm p-3">
      <span className="bracket-tl" /><span className="bracket-tr" />
      <span className="bracket-bl" /><span className="bracket-br" />
      <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--paper-dim)] mb-3">
        {title}
      </p>
      {children}
    </div>
  );
}
