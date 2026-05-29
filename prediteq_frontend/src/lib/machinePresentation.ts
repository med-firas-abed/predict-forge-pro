import { repairText } from "@/lib/repairText";

interface FloorLabelOptions {
  singular?: string;
  plural?: string;
  fallback?: string;
}

interface MachinePublicLabelInput {
  id?: string | null;
  code?: string | null;
  name?: string | null;
}

export function normalizeMachineModel(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = repairText(value).trim();
  if (!normalized) {
    return "";
  }

  const lowered = normalized.toLowerCase();
  if (lowered === "null" || lowered === "undefined" || lowered === "nan") {
    return "";
  }

  return normalized;
}

function _normalizeMachineLabelValue(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = repairText(value).trim();
  if (!normalized) {
    return "";
  }

  const lowered = normalized.toLowerCase();
  if (lowered === "null" || lowered === "undefined" || lowered === "nan") {
    return "";
  }

  return normalized;
}

function _escapeMachineLabelPattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function _isDemoStyleMachineCode(value: string | null | undefined): boolean {
  const normalized = _normalizeMachineLabelValue(value).toUpperCase();
  return /^ASC-[A-Z]\d+$/.test(normalized);
}

function _getExplicitPublicMachineLabel(
  value: string | null | undefined,
  fallback = "Machine",
): string | null {
  const normalized = _normalizeMachineLabelValue(value);
  if (!normalized) {
    return null;
  }

  const escapedFallback = fallback.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = normalized.match(new RegExp(`^${escapedFallback}\\s+(.+)$`, "i"));
  if (!match) {
    return null;
  }

  const suffix = match[1]?.trim();
  if (!suffix) {
    return fallback;
  }

  return `${fallback} ${suffix}`;
}

export function extractMachineOrdinal(
  ...values: Array<string | null | undefined>
): number | null {
  for (const value of values) {
    const normalized = _normalizeMachineLabelValue(value);
    if (!normalized) {
      continue;
    }

    const match = normalized.match(/(\d+)(?!.*\d)/);
    if (!match) {
      continue;
    }

    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

export function getMachinePublicLabel(
  input: MachinePublicLabelInput | string | null | undefined,
  fallback = "Machine",
): string {
  if (typeof input === "string" || input == null) {
    const normalized = _normalizeMachineLabelValue(input);
    const explicitLabel = _getExplicitPublicMachineLabel(normalized, fallback);
    if (explicitLabel) {
      return explicitLabel;
    }

    const ordinal = _isDemoStyleMachineCode(normalized)
      ? extractMachineOrdinal(normalized)
      : null;
    if (ordinal != null) {
      return `${fallback} ${ordinal}`;
    }

    return normalized ? `${fallback} ${normalized}` : fallback;
  }

  const code = _normalizeMachineLabelValue(input.id) || _normalizeMachineLabelValue(input.code);
  const name = _normalizeMachineLabelValue(input.name);
  const explicitNameLabel = _getExplicitPublicMachineLabel(name, fallback);
  if (explicitNameLabel) {
    return explicitNameLabel;
  }

  const ordinal =
    _isDemoStyleMachineCode(code) || (!code && name)
      ? extractMachineOrdinal(code, name)
      : null;

  if (ordinal != null) {
    return `${fallback} ${ordinal}`;
  }

  if (code) {
    return `${fallback} ${code}`;
  }

  if (name) {
    return `${fallback} ${name}`;
  }

  return fallback;
}

export function getMachinePublicOptionsLabel(
  input: MachinePublicLabelInput | string | null | undefined,
): string {
  return getMachinePublicLabel(input);
}

export function replaceMachineCodesForDisplay(
  value: string | null | undefined,
  fallback = "Machine",
): string {
  const normalized = _normalizeMachineLabelValue(value);
  if (!normalized) {
    return "";
  }

  const escapedFallback = _escapeMachineLabelPattern(fallback);
  const replaced = normalized.replace(/\bASC-[A-Z]\d+\b/gi, (match) =>
    getMachinePublicLabel(match, fallback),
  );

  return replaced.replace(
    new RegExp(`\\b${escapedFallback}\\s+${escapedFallback}\\s+(\\d+)\\b`, "gi"),
    `${fallback} $1`,
  );
}

export function normalizeMachineFloors(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.round(parsed);
}

export function formatMachineModelValue(
  value: string | null | undefined,
  fallback = "Non renseigné",
): string {
  return normalizeMachineModel(value) || fallback;
}

export function formatMachineFloorCountValue(
  value: number | null | undefined,
  fallback = "Non renseigné",
): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return String(Math.round(value));
}

export function formatMachineFloorLabel(
  value: number | null | undefined,
  options: FloorLabelOptions = {},
): string {
  const {
    singular = "niveau",
    plural = "niveaux",
    fallback = "Niveaux non renseignés",
  } = options;

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  const rounded = Math.round(value);
  return `${rounded} ${rounded > 1 ? plural : singular}`;
}
