export type AppMode = "demo" | "prod";

function normalizeMode(value: string | undefined): AppMode {
  return value?.trim().toLowerCase() === "prod" ? "prod" : "demo";
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined || value === null || value.trim() === "") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

export const APP_MODE = normalizeMode(import.meta.env.VITE_APP_MODE);
export const IS_DEMO_MODE = APP_MODE === "demo";

export function resolveDemoFlag(
  explicitValue: string | undefined,
  demoDefault = true,
): boolean {
  const parsed = parseOptionalBoolean(explicitValue);
  if (parsed !== undefined) return parsed;
  return IS_DEMO_MODE ? demoDefault : false;
}

export function shouldAllowSupabaseFallback(): boolean {
  return resolveDemoFlag(import.meta.env.VITE_ALLOW_SUPABASE_FALLBACK, true);
}
