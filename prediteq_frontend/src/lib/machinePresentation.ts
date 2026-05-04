import { repairText } from "@/lib/repairText";

interface FloorLabelOptions {
  singular?: string;
  plural?: string;
  fallback?: string;
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
    singular = "étage",
    plural = "étages",
    fallback = "Étages non renseignés",
  } = options;

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  const rounded = Math.round(value);
  return `${rounded} ${rounded > 1 ? plural : singular}`;
}
