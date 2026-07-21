// Client-side-only API key storage. Keys never touch disk on the
// server and are only sent per-request, over the wire to your own
// backend, which forwards them to the provider for that single call.
const STORAGE_KEY = "gad_api_keys_v1";

export function loadKeys() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { openai: "", gemini: "", openrouter: "" };
  } catch {
    return { openai: "", gemini: "", openrouter: "" };
  }
}

export function saveKeys(keys) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

export function clearKeys() {
  localStorage.removeItem(STORAGE_KEY);
}

export function keyForModel(model, keys) {
  if (model.startsWith("gemini")) return keys.gemini || null;
  if (/^(gpt-|o1|o3|o4|text-|chatgpt)/.test(model)) return keys.openai || null;
  return keys.openrouter || null;
}

export function maskKey(key) {
  if (!key) return "";
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 4)}${"•".repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
}
