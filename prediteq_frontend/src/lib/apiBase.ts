const configuredApiBase = String(import.meta.env.VITE_API_URL ?? "").trim();
const isBrowser = typeof window !== "undefined";
const isLocalHost =
  isBrowser && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);

export const API_BASE = isBrowser && !isLocalHost ? "/api" : configuredApiBase;
