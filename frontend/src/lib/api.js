// Thin client around the GAD FastAPI backend.
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export async function getStatus() {
  const res = await fetch(`${API_BASE}/api/status`);
  return res.json();
}

export async function getModels() {
  const res = await fetch(`${API_BASE}/api/models`);
  return (await res.json()).models;
}

export async function getLibraries() {
  const res = await fetch(`${API_BASE}/api/libraries`);
  return (await res.json()).libraries;
}

export async function getPrinterPorts() {
  const res = await fetch(`${API_BASE}/api/printer/ports`);
  return (await res.json()).ports;
}

export async function transcribeAudio(blob) {
  const form = new FormData();
  form.append("audio", blob, "recording.wav");
  const res = await fetch(`${API_BASE}/api/transcribe`, { method: "POST", body: form });
  if (!res.ok) throw new Error((await res.json()).detail || "Transcription failed");
  return (await res.json()).text;
}

/**
 * Kicks off a generation job and streams log lines + the final result
 * via Server-Sent Events.
 *
 * onLog(line: string) is called for every log line as it happens.
 * onResult(result: object) is called once, with the final payload.
 * onError(message: string) is called if the job or stream fails.
 * Returns a function you can call to abort the stream early.
 */
export function generateModel(payload, { onLog, onResult, onError }) {
  let closed = false;
  let es;

  (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Request failed (${res.status})`);
      }
      const { job_id } = await res.json();
      if (closed) return;

      es = new EventSource(`${API_BASE}/api/generate/stream/${job_id}`);
      es.addEventListener("log", (e) => onLog?.(JSON.parse(e.data)));
      es.addEventListener("result", (e) => {
        onResult?.(JSON.parse(e.data));
        es.close();
      });
      es.onerror = () => {
        if (!closed) onError?.("Connection to the server was interrupted.");
        es.close();
      };
    } catch (err) {
      if (!closed) onError?.(err.message);
    }
  })();

  return () => {
    closed = true;
    es?.close();
  };
}

export async function connectPrinter(port, baudrate) {
  const res = await fetch(`${API_BASE}/api/printer/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ port, baudrate }),
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Could not connect to printer");
  return res.json();
}

export async function disconnectPrinter() {
  const res = await fetch(`${API_BASE}/api/printer/disconnect`, { method: "POST" });
  return res.json();
}

export function printGcode(gcodeBase64, { onLog, onResult, onError }) {
  let closed = false;
  let es;

  (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/printer/print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gcode_base64: gcodeBase64 }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Request failed (${res.status})`);
      }
      const { job_id } = await res.json();
      if (closed) return;

      es = new EventSource(`${API_BASE}/api/printer/print/stream/${job_id}`);
      es.addEventListener("log", (e) => onLog?.(JSON.parse(e.data)));
      es.addEventListener("result", (e) => {
        onResult?.(JSON.parse(e.data));
        es.close();
      });
      es.onerror = () => {
        if (!closed) onError?.("Connection to the server was interrupted.");
        es.close();
      };
    } catch (err) {
      if (!closed) onError?.(err.message);
    }
  })();

  return () => {
    closed = true;
    es?.close();
  };
}

export function isLocalBackend() {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(API_BASE);
}

export { API_BASE };
