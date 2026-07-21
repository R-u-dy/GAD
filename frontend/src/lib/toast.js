// Minimal pub-sub toast system — no extra dependency needed.
const listeners = new Set();
let idCounter = 0;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function toast(message, { type = "info", duration = 4000 } = {}) {
  const id = ++idCounter;
  const entry = { id, message, type, duration };
  listeners.forEach((fn) => fn(entry));
  return id;
}

toast.success = (msg, opts) => toast(msg, { ...opts, type: "success" });
toast.error = (msg, opts) => toast(msg, { ...opts, type: "error" });
toast.info = (msg, opts) => toast(msg, { ...opts, type: "info" });
