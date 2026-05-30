import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import {
  AlertTriangle,
  Brain,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Play,
  Shield,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useMachines } from "@/hooks/useMachines";
import {
  useFleetPredictiveInsights,
  type PredictiveInsight,
} from "@/hooks/useFleetPredictiveInsights";
import { apiFetch } from "@/lib/api";
import { getBudgetReferenceCost, LABOR_RATE_PER_HOUR } from "@/lib/costModel";
import {
  getMachinePublicLabel,
  replaceMachineCodesForDisplay,
} from "@/lib/machinePresentation";
import { repairText } from "@/lib/repairText";
import {
  createGmaoTache,
  listGmaoTaches,
  type GmaoTache,
} from "@/lib/runtimeDataRepository";

interface RiskEntry {
  machine_code: string;
  nom: string;
  region: string;
  hi: number | null;
  rul_days: number | null;
  zone: string | null;
  risk_score: number;
  risk_level: "critical" | "priority" | "watch" | "stable";
  risk_label: string;
  summary: string;
  recommended_action: string;
  maintenance_window: string | null;
  open_tasks: number;
  data_source: string;
  updated_at: string | null;
  is_stale: boolean;
}

interface ProposedTask {
  machine_code: string;
  titre: string;
  type: "preventive" | "corrective" | "inspection";
  priorite: "haute" | "moyenne" | "basse";
  date_planifiee: string;
  cout_estime: number | null;
  description: string;
  technicien: string;
}

interface PlannerFleetRow extends RiskEntry {
  plain_reason: string;
  impact: string;
  evidence: string[];
  field_checks: string[];
  projected_cost: number;
  delayed_cost: number;
  delay_penalty: number;
  task_context?: string | null;
  similar_open_tasks?: number;
  recent_completed_tasks?: number;
  repeat_cooldown_active?: boolean;
  task_suggestion?: ProposedTask;
}

interface GeneratePlanResponse {
  generated_at: string;
  focus_machine: string | null;
  markdown: string;
  tasks: ProposedTask[];
  fleet: PlannerFleetRow[];
}

interface ApproveTaskResponse {
  status: string;
  message: string;
  machine_code: string;
  repeat_note?: string | null;
}

interface PlannerPageProps {
  embedded?: boolean;
}

const RISK_CONFIG = {
  critical: {
    color: "text-destructive",
    bg: "bg-destructive/10",
    panel: "border-destructive/20 bg-destructive/5",
    icon: AlertTriangle,
  },
  priority: {
    color: "text-warning",
    bg: "bg-warning/10",
    panel: "border-warning/20 bg-warning/5",
    icon: AlertTriangle,
  },
  watch: {
    color: "text-primary",
    bg: "bg-primary/10",
    panel: "border-primary/20 bg-primary/5",
    icon: Shield,
  },
  stable: {
    color: "text-success",
    bg: "bg-success/10",
    panel: "border-success/20 bg-success/5",
    icon: CheckCircle,
  },
} as const;

const OPEN_TASK_STATUSES = new Set(["planifiee", "en_cours"]);
const TASK_TYPE_LABELS = {
  preventive: "maintenance preventive",
  corrective: "intervention corrective",
  inspection: "inspection",
} as const;
const RECENT_TASK_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;
const FALLBACK_COOLDOWN_BY_TYPE: Record<ProposedTask["type"], number> = {
  preventive: 14,
  corrective: 3,
  inspection: 21,
};

function formatHi(hi: number | null) {
  if (typeof hi !== "number") return "Indisponible";
  return `HI ${Math.round(hi * 100)}%`;
}

function formatRul(rulDays: number | null) {
  if (typeof rulDays !== "number") return "RUL indisponible";
  return `RUL ${Math.round(rulDays)} j`;
}

function formatUpdatedAt(value: string | null) {
  if (!value) return "Lecture en attente";
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSourceLabel(source: string) {
  switch (source) {
    case "live_runtime":
      return "Flux en direct";
    case "simulator_demo":
      return "Source simulée";
    case "persisted_reference":
      return "Référence stable";
    default:
      return "Lecture partielle";
  }
}

function formatCurrency(value: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "Coût indisponible";
  return `${Math.round(value).toLocaleString("fr-FR")} TND`;
}

function formatMachineLabel(machineCode: string | null | undefined, machineName?: string | null) {
  return getMachinePublicLabel({ id: machineCode ?? undefined, name: machineName ?? undefined });
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown, fallback = "") {
  return repairText(typeof value === "string" ? value : fallback);
}

function nullableStringValue(value: unknown) {
  return typeof value === "string" ? repairText(value) : null;
}

function numberValue(value: unknown, fallback = 0) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function stringArrayValue(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string").map((entry) => repairText(entry))
    : [];
}

function trimPlannerText(value: string | null | undefined, maxLength = 72) {
  const compact = replaceMachineCodesForDisplay(
    repairText((value ?? "").replace(/\s+/g, " ").trim()),
  );
  if (!compact) return null;
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 3).trimEnd()}...`;
}

function parseApiError(error: unknown) {
  if (!(error instanceof Error)) {
    return { status: null as number | null, message: null as string | null };
  }

  const match = error.message.match(/^API\s+(\d+):\s*(.*)$/s);
  if (!match) {
    const message = repairText(error.message.trim());
    return { status: null as number | null, message: message || null };
  }

  const status = Number(match[1]);
  const message = repairText(match[2].trim());
  return {
    status: Number.isFinite(status) ? status : null,
    message: message || null,
  };
}

function normalizeRiskLevel(value: unknown): PlannerFleetRow["risk_level"] {
  if (value === "critical" || value === "priority" || value === "watch" || value === "stable") {
    return value;
  }
  return "stable";
}

function _suggestedDate(daysFromNow: number) {
  const date = new Date();
  date.setDate(date.getDate() + Math.max(0, daysFromNow));
  return date.toISOString().slice(0, 10);
}

function _priorityFromBand(band: RiskEntry["risk_level"]): ProposedTask["priorite"] {
  if (band === "critical") return "haute";
  if (band === "priority") return "moyenne";
  return "basse";
}

function buildLocalTaskTitle(
  insight: PredictiveInsight,
  options?: {
    hasSimilarOpenTasks?: boolean;
  },
) {
  const machineLabel = formatMachineLabel(insight.machine.id, insight.machine.name);
  const baseTitle = trimPlannerText(
    insight.taskTemplate.title || `Intervention ${machineLabel}`,
    120,
  ) ?? `Intervention ${machineLabel}`;
  const titleWithMachine = baseTitle.includes(machineLabel)
    ? baseTitle
    : `${baseTitle} ${machineLabel}`;
  const qualifiers: string[] = [];
  const driver = trimPlannerText(insight.topDriver ?? insight.dominantAxis ?? null, 38);
  if (driver) qualifiers.push(driver);
  if ((insight.urgencyBand === "critical" || insight.urgencyBand === "priority") && typeof insight.rulDays === "number") {
    qualifiers.push(`RUL ${Math.round(insight.rulDays)} j`);
  } else if ((insight.urgencyBand === "critical" || insight.urgencyBand === "watch") && typeof insight.machine.hi === "number") {
    qualifiers.push(`HI ${Math.round(insight.machine.hi * 100)}%`);
  }
  const hasSimilarOpenTasks =
    options?.hasSimilarOpenTasks ?? (insight.machine.decision?.openTasks ?? 0) > 0;
  if (hasSimilarOpenTasks) {
    qualifiers.push("reprise");
  }

  let title = titleWithMachine;
  for (const qualifier of qualifiers) {
    const candidate = `${title} - ${qualifier}`;
    if (candidate.length > 200) break;
    title = candidate;
  }

  return title;
}

function buildLocalTaskDescription(
  insight: PredictiveInsight,
  options?: {
    taskContext?: string | null;
    useDefaultOpenTaskContext?: boolean;
  },
) {
  const parts: string[] = [];
  const stateParts: string[] = [];
  const recommendedAction = trimPlannerText(insight.recommendedAction, 260);
  const plainReason = trimPlannerText(insight.plainReason, 320);
  const hi = typeof insight.machine.hi === "number" ? `HI ${Math.round(insight.machine.hi * 100)}%` : null;
  const rul = typeof insight.rulDays === "number" ? `RUL ${Math.round(insight.rulDays)} j` : null;
  const zone = trimPlannerText(insight.machine.decision?.zone ?? null, 32);
  const driver = trimPlannerText(insight.topDriver ?? insight.dominantAxis ?? null, 50);
  const maintenanceWindow = trimPlannerText(insight.maintenanceWindow, 120);
  const impact = trimPlannerText(insight.impact, 220);
  const fieldCheck = trimPlannerText(insight.fieldChecks[0] ?? null, 140);
  const evidence = insight.evidence
    .slice(0, 3)
    .map((entry) => trimPlannerText(entry, 90))
    .filter((entry): entry is string => Boolean(entry));
  const openTasks = insight.machine.decision?.openTasks ?? 0;

  if (hi) stateParts.push(hi);
  if (rul) stateParts.push(rul);
  if (zone) stateParts.push(`zone ${zone}`);
  stateParts.push(`score ${Math.round(insight.urgencyScore)}/100`);
  if (driver) stateParts.push(`signal dominant ${driver}`);

  if (recommendedAction) parts.push(`Action: ${recommendedAction}.`);
  if (stateParts.length > 0) parts.push(`État: ${stateParts.join(", ")}.`);
  if (plainReason) parts.push(`Motif: ${plainReason}.`);
  if (maintenanceWindow) parts.push(`Fenêtre: ${maintenanceWindow}.`);
  if (impact) parts.push(`Impact: ${impact}.`);
  if (evidence.length > 0) parts.push(`Preuves: ${evidence.join(" | ")}.`);
  if (fieldCheck) parts.push(`Contrôle terrain: ${fieldCheck}.`);
  if (options && "taskContext" in options) {
    if (options.taskContext) parts.push(options.taskContext);
  } else if ((options?.useDefaultOpenTaskContext ?? true) && openTasks > 0) {
    parts.push(
      `Contexte calendrier: ${openTasks} tâche(s) déjà ouverte(s) sur cette machine; aucune nouvelle suggestion calendrier n'est créée tant qu'elles ne sont pas clôturées.`,
    );
  }

  return parts.join(" ").trim();
}

function buildLocalTaskSuggestion(
  insight: PredictiveInsight,
  projectedCost: number,
  options?: {
    similarOpenTasks?: number;
    repeatCooldownActive?: boolean;
    taskContext?: string | null;
    useDefaultOpenTaskContext?: boolean;
  },
): ProposedTask | undefined {
  const similarOpenTasks = options?.similarOpenTasks ?? (insight.machine.decision?.openTasks ?? 0);
  if (insight.urgencyBand === "stable" || similarOpenTasks > 0 || options?.repeatCooldownActive) {
    return undefined;
  }

  return {
    machine_code: insight.machine.id,
    titre: buildLocalTaskTitle(insight, {
      hasSimilarOpenTasks: similarOpenTasks > 0,
    }),
    type: insight.taskTemplate.type,
    priorite: _priorityFromBand(insight.urgencyBand),
    date_planifiee: _suggestedDate(insight.taskTemplate.leadDays),
    cout_estime: projectedCost,
    description: buildLocalTaskDescription(insight, {
      taskContext: options?.taskContext,
      useDefaultOpenTaskContext: options?.useDefaultOpenTaskContext,
    }),
    technicien: "",
  };
}

interface LocalTaskHistorySummary {
  openSameType: number;
  recentCompletedSameType: number;
  completedSameType: number;
  latestCompletedAt: Date | null;
}

interface LocalRepeatGuard {
  blocked: boolean;
  cooldownDays: number;
  remainingDays: number;
  latestCompletedAt: Date | null;
}

function parsePlannerTaskDate(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.length === 10 ? `${value}T00:00:00Z` : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildTaskHistoryIndex(tasks: GmaoTache[]) {
  return tasks.reduce<Record<string, GmaoTache[]>>((acc, task) => {
    const machineCode = repairText(task.machineCode).trim().toUpperCase();
    if (!machineCode) return acc;
    if (!acc[machineCode]) acc[machineCode] = [];
    acc[machineCode].push(task);
    return acc;
  }, {});
}

function summarizeLocalTaskHistory(
  machineTasks: GmaoTache[],
  taskType: ProposedTask["type"],
): LocalTaskHistorySummary {
  const recentCutoff = Date.now() - RECENT_TASK_WINDOW_MS;
  let openSameType = 0;
  let recentCompletedSameType = 0;
  let completedSameType = 0;
  let latestCompletedAt: Date | null = null;

  for (const task of machineTasks) {
    if (task.type !== taskType) continue;

    const when = parsePlannerTaskDate(task.datePlanifiee ?? task.createdAt);
    if (OPEN_TASK_STATUSES.has(task.statut)) {
      openSameType += 1;
      continue;
    }

    if (task.statut !== "terminee") continue;

    completedSameType += 1;
    if (when && when.getTime() >= recentCutoff) {
      recentCompletedSameType += 1;
    }
    if (when && (!latestCompletedAt || when > latestCompletedAt)) {
      latestCompletedAt = when;
    }
  }

  return {
    openSameType,
    recentCompletedSameType,
    completedSameType,
    latestCompletedAt,
  };
}

function getLocalCooldownDays(insight: PredictiveInsight) {
  const explicitCooldown = insight.taskTemplate.cooldownDays;
  if (typeof explicitCooldown === "number" && Number.isFinite(explicitCooldown) && explicitCooldown > 0) {
    return explicitCooldown;
  }
  return FALLBACK_COOLDOWN_BY_TYPE[insight.taskTemplate.type];
}

function evaluateLocalRepeatGuard(
  insight: PredictiveInsight,
  historySummary: LocalTaskHistorySummary,
): LocalRepeatGuard {
  const latestCompletedAt = historySummary.latestCompletedAt;
  const cooldownDays = getLocalCooldownDays(insight);
  if (!latestCompletedAt || cooldownDays <= 0) {
    return {
      blocked: false,
      cooldownDays,
      remainingDays: 0,
      latestCompletedAt,
    };
  }

  const expiresAt = new Date(latestCompletedAt.getTime() + cooldownDays * 24 * 60 * 60 * 1000);
  const now = new Date();
  if (expiresAt <= now) {
    return {
      blocked: false,
      cooldownDays,
      remainingDays: 0,
      latestCompletedAt,
    };
  }

  const alerts24h = insight.machine.decision?.alerts24h ?? insight.machine.anom ?? 0;
  const telemetryTrust = insight.machine.decision?.policyContext?.telemetry?.trustScore ?? 0;
  const scenarioPressure = insight.machine.decision?.policyContext?.scenario?.pressure ?? 0;
  const escalated =
    insight.urgencyBand === "critical" ||
    insight.stopRecommended ||
    alerts24h >= 6 ||
    insight.urgencyScore >= 82 ||
    (insight.urgencyBand === "priority" && telemetryTrust >= 72 && scenarioPressure >= 0.65);

  if (escalated) {
    return {
      blocked: false,
      cooldownDays,
      remainingDays: 0,
      latestCompletedAt,
    };
  }

  const remainingMs = Math.max(expiresAt.getTime() - now.getTime(), 0);
  const remainingDays = Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
  return {
    blocked: true,
    cooldownDays,
    remainingDays,
    latestCompletedAt,
  };
}

function buildLocalTaskHistoryNote(
  taskType: ProposedTask["type"],
  historySummary: LocalTaskHistorySummary,
  repeatGuard?: LocalRepeatGuard,
) {
  const taskLabel = TASK_TYPE_LABELS[taskType] ?? taskType;

  if (historySummary.openSameType > 0) {
    return (
      `Contexte calendrier: ${historySummary.openSameType} tâche(s) de ${taskLabel} sont déjà ouvertes sur cette machine; ` +
      "aucune nouvelle suggestion calendrier n'est émise tant qu'elles ne sont pas clôturées."
    );
  }

  if (repeatGuard?.blocked) {
    const latest = repeatGuard.latestCompletedAt
      ? repeatGuard.latestCompletedAt.toLocaleDateString("fr-FR")
      : "date récente";
    return (
      `Historique planner: une action similaire a été clôturée le ${latest}; ` +
      `le planner attend encore ${repeatGuard.remainingDays} j ou une escalade nette avant de reproposer la même intervention.`
    );
  }

  if (historySummary.recentCompletedSameType > 0) {
    const latest = historySummary.latestCompletedAt
      ? historySummary.latestCompletedAt.toLocaleDateString("fr-FR")
      : "date récente";
    return (
      `Historique: ${historySummary.recentCompletedSameType} action(s) similaires ont déjà été clôturées récemment ` +
      `(dernière le ${latest}); la répétition reste cohérente si les signaux n'ont pas disparu.`
    );
  }

  if (historySummary.completedSameType > 0 && historySummary.latestCompletedAt) {
    return (
      `Historique: une action comparable a déjà été menée (dernière le ` +
      `${historySummary.latestCompletedAt.toLocaleDateString("fr-FR")}).`
    );
  }

  return null;
}

function findLocalDuplicateMessage(tasks: GmaoTache[], task: ProposedTask) {
  const normalizedMachineCode = task.machine_code.trim().toUpperCase();
  const machineTasks = tasks.filter(
    (entry) => repairText(entry.machineCode).trim().toUpperCase() === normalizedMachineCode,
  );
  const normalizedTitle = task.titre.trim().toLowerCase();
  let sameTitleOpen = 0;
  let sameTypeOpen = 0;

  for (const entry of machineTasks) {
    if (!OPEN_TASK_STATUSES.has(entry.statut)) continue;
    if (entry.titre.trim().toLowerCase() === normalizedTitle) sameTitleOpen += 1;
    if (entry.type === task.type) sameTypeOpen += 1;
  }

  if (sameTitleOpen > 0) {
    return (
      replaceMachineCodesForDisplay(
        `Une tâche ouverte avec le titre "${task.titre}" existe déjà dans le calendrier pour ${task.machine_code}. ` +
          "Fermez ou modifiez la tâche existante avant d'en créer une nouvelle.",
      )
    );
  }

  if (sameTypeOpen > 0) {
    const taskLabel = TASK_TYPE_LABELS[task.type] ?? task.type;
    return (
      replaceMachineCodesForDisplay(
        `Une tâche ouverte de ${taskLabel} existe déjà dans le calendrier pour ${task.machine_code}. ` +
          "Fermez ou modifiez la tâche existante avant d'en créer une nouvelle.",
      )
    );
  }

  return null;
}

function normalizeProposedTask(raw: unknown): ProposedTask | null {
  if (!raw || typeof raw !== "object") return null;
  const task = raw as Record<string, unknown>;

  const type = task.type;
  const priorite = task.priorite;
  if (type !== "preventive" && type !== "corrective" && type !== "inspection") return null;
  if (priorite !== "haute" && priorite !== "moyenne" && priorite !== "basse") return null;

  return {
    machine_code: stringValue(task.machine_code),
    titre: stringValue(task.titre),
    type,
    priorite,
    date_planifiee: stringValue(task.date_planifiee),
    cout_estime: numberOrNull(task.cout_estime),
    description: stringValue(task.description),
    technicien: stringValue(task.technicien),
  };
}

function normalizePlannerFleetRow(raw: unknown): PlannerFleetRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;

  const machineCode = stringValue(row.machine_code);
  if (!machineCode) return null;

  return {
    machine_code: machineCode,
    nom: stringValue(row.nom),
    region: stringValue(row.region),
    hi: numberOrNull(row.hi),
    rul_days: numberOrNull(row.rul_days),
    zone: nullableStringValue(row.zone),
    risk_score: numberValue(row.risk_score ?? row.urgency_score, 0),
    risk_level: normalizeRiskLevel(row.risk_level ?? row.urgency_band),
    risk_label: stringValue(row.risk_label ?? row.urgency_label, "Stable"),
    summary: stringValue(row.summary),
    recommended_action: stringValue(row.recommended_action),
    maintenance_window: nullableStringValue(row.maintenance_window),
    open_tasks: numberValue(row.open_tasks, 0),
    data_source: stringValue(row.data_source, "no_data"),
    updated_at: nullableStringValue(row.updated_at),
    is_stale: Boolean(row.is_stale),
    plain_reason: stringValue(row.plain_reason),
    impact: stringValue(row.impact),
    evidence: stringArrayValue(row.evidence),
    field_checks: stringArrayValue(row.field_checks),
    projected_cost: numberValue(row.projected_cost, 0),
    delayed_cost: numberValue(row.delayed_cost, 0),
    delay_penalty: numberValue(row.delay_penalty, 0),
    task_context: nullableStringValue(row.task_context),
    similar_open_tasks: numberValue(row.similar_open_tasks, 0),
    recent_completed_tasks: numberValue(row.recent_completed_tasks, 0),
    repeat_cooldown_active: Boolean(row.repeat_cooldown_active),
    task_suggestion: normalizeProposedTask(row.task_suggestion),
  };
}

function normalizeGeneratePlanResponse(raw: unknown): GeneratePlanResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const response = raw as Record<string, unknown>;
  const fleet = Array.isArray(response.fleet)
    ? response.fleet
        .map((entry) => normalizePlannerFleetRow(entry))
        .filter((entry): entry is PlannerFleetRow => Boolean(entry))
    : [];
  const tasks = Array.isArray(response.tasks)
    ? response.tasks
        .map((entry) => normalizeProposedTask(entry))
        .filter((entry): entry is ProposedTask => Boolean(entry))
    : fleet
        .map((entry) => entry.task_suggestion)
        .filter((entry): entry is ProposedTask => Boolean(entry));

  return {
    generated_at: stringValue(response.generated_at, new Date().toISOString()),
    focus_machine: nullableStringValue(response.focus_machine),
    markdown: stringValue(response.markdown),
    tasks,
    fleet,
  };
}

function buildLocalGeneratePlanResponse(
  rows: PlannerFleetRow[],
  focusMachine: string | null,
  l: (fr: string, en: string, ar: string) => string,
): GeneratePlanResponse {
  return {
    generated_at: new Date().toISOString(),
    focus_machine: focusMachine,
    markdown: buildPlanNarrative(rows, focusMachine, l),
    tasks: rows
      .map((row) => row.task_suggestion)
      .filter((task): task is ProposedTask => Boolean(task)),
    fleet: rows,
  };
}

function buildFallbackPlannerRows(
  insights: PredictiveInsight[],
  taskHistoryByMachine?: Record<string, GmaoTache[]>,
): PlannerFleetRow[] {
  return [...insights]
    .sort((left, right) => right.urgencyScore - left.urgencyScore)
    .map((insight) => {
      const avgCost = getBudgetReferenceCost(insight.taskTemplate.type);
      const projectedCost = Math.round(avgCost * insight.budgetMultiplier);
      const delayedCost = Math.round(projectedCost * insight.delayMultiplier);
      const openTasks = insight.machine.decision?.openTasks ?? 0;
      const machineTasks = taskHistoryByMachine?.[insight.machine.id] ?? [];
      const hasTaskHistory = machineTasks.length > 0;
      const historySummary = hasTaskHistory
        ? summarizeLocalTaskHistory(machineTasks, insight.taskTemplate.type)
        : null;
      const repeatGuard = historySummary ? evaluateLocalRepeatGuard(insight, historySummary) : null;
      const similarOpenTasks = historySummary ? historySummary.openSameType : openTasks;
      const taskContext = historySummary
        ? buildLocalTaskHistoryNote(insight.taskTemplate.type, historySummary, repeatGuard ?? undefined)
        : openTasks > 0
          ? `Contexte calendrier: ${openTasks} tâche(s) déjà ouverte(s) sur cette machine; aucune nouvelle suggestion calendrier n'est créée tant qu'elles ne sont pas clôturées.`
          : null;
      const row: PlannerFleetRow = {
        machine_code: insight.machine.id,
        nom: insight.machine.name,
        region: insight.machine.city,
        hi: insight.machine.hi,
        rul_days: insight.rulDays,
        zone: insight.machine.decision?.zone ?? null,
        risk_score: insight.urgencyScore,
        risk_level: insight.urgencyBand,
        risk_label: insight.urgencyLabel,
        summary: insight.summary,
        recommended_action: insight.recommendedAction,
        maintenance_window: insight.maintenanceWindow,
        open_tasks: openTasks,
        data_source: insight.dataSource,
        updated_at: insight.updatedAt,
        is_stale: insight.isStale,
        plain_reason: insight.plainReason,
        impact: insight.impact,
        evidence: insight.evidence,
        field_checks: insight.fieldChecks,
        projected_cost: projectedCost,
        delayed_cost: delayedCost,
        delay_penalty: delayedCost - projectedCost,
        task_context: taskContext,
        similar_open_tasks: similarOpenTasks,
        recent_completed_tasks: historySummary?.recentCompletedSameType ?? 0,
        repeat_cooldown_active: Boolean(repeatGuard?.blocked),
        task_suggestion: buildLocalTaskSuggestion(insight, projectedCost, {
          similarOpenTasks,
          repeatCooldownActive: Boolean(repeatGuard?.blocked),
          taskContext,
          useDefaultOpenTaskContext: !hasTaskHistory,
        }),
      };
      return row;
    });
}

function buildPlanNarrative(
  rows: PlannerFleetRow[],
  focusMachine: string | null,
  l: (fr: string, en: string, ar: string) => string,
) {
  const criticalRows = rows.filter((row) => row.risk_level === "critical");
  const priorityRows = rows.filter((row) => row.risk_level === "priority");
  const watchRows = rows.filter((row) => row.risk_level === "watch");
  const totalProjected = rows.reduce((sum, row) => sum + row.projected_cost, 0);
  const totalPenalty = rows.reduce((sum, row) => sum + row.delay_penalty, 0);

  const lines: string[] = [];
  lines.push(
    focusMachine
      ? l(
          `Synthèse ciblée: ${formatMachineLabel(focusMachine)}`,
          `Focused summary: ${formatMachineLabel(focusMachine)}`,
          `Focused summary: ${formatMachineLabel(focusMachine)}`,
        )
      : l("Synthèse flotte", "Fleet summary", "Fleet summary"),
  );
  lines.push("");
  lines.push(
    l(
      `${criticalRows.length} machine(s) urgentes, ${priorityRows.length} à programmer, ${watchRows.length} à suivre.`,
      `${criticalRows.length} critical, ${priorityRows.length} to schedule, ${watchRows.length} to watch.`,
      `${criticalRows.length} critical, ${priorityRows.length} to schedule, ${watchRows.length} to watch.`,
    ),
  );
  lines.push("");
  lines.push(l("Priorités retenues :", "Selected priorities:", "Selected priorities:"));

  for (const row of rows) {
    lines.push(`- ${formatMachineLabel(row.machine_code, row.nom)} (${row.risk_label}) : ${row.summary}`);
    lines.push(`  ${row.recommended_action}`);
    if (row.maintenance_window) {
      lines.push(
        `  ${l("Fenêtre", "Window", "Window")}: ${row.maintenance_window}`,
      );
    }
    if (row.evidence.length > 0) {
      lines.push(`  ${l("Preuves", "Evidence", "Evidence")}: ${row.evidence.slice(0, 3).join(" | ")}`);
    }
  }

  lines.push("");
  lines.push(
    l(
      `Coût projeté total: ${Math.round(totalProjected).toLocaleString("fr-FR")} TND`,
      `Projected cost: ${Math.round(totalProjected).toLocaleString("fr-FR")} TND`,
      `Projected cost: ${Math.round(totalProjected).toLocaleString("fr-FR")} TND`,
    ),
  );
  lines.push(
    l(
      `Surcoût potentiel si l'on attend: ${Math.round(totalPenalty).toLocaleString("fr-FR")} TND`,
      `Potential delay penalty: ${Math.round(totalPenalty).toLocaleString("fr-FR")} TND`,
      `Potential delay penalty: ${Math.round(totalPenalty).toLocaleString("fr-FR")} TND`,
    ),
  );
  lines.push(
    l(
      `Base de calcul sans historique: main-d'oeuvre ${LABOR_RATE_PER_HOUR} DT/h + forfait pièces par type d'action.`,
      `Fallback estimate without history: labor ${LABOR_RATE_PER_HOUR} TND/hour + a parts allowance per task type.`,
      `Fallback estimate without history: labor ${LABOR_RATE_PER_HOUR} TND/hour + a parts allowance per task type.`,
    ),
  );

  return replaceMachineCodesForDisplay(lines.join("\n"));
}

export function PlannerPage({ embedded = false }: PlannerPageProps) {
  const { lang } = useApp();
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const { machines, isLoading: loadingMachines } = useMachines(currentUser?.machineId);
  const { insights } = useFleetPredictiveInsights(machines);
  const location = useLocation();
  const isAdmin = currentUser?.role === "admin";
  const [riskData, setRiskData] = useState<RiskEntry[]>([]);
  const [loadingRisk, setLoadingRisk] = useState(false);
  const [planText, setPlanText] = useState("");
  const [planGeneratedAt, setPlanGeneratedAt] = useState<string | null>(null);
  const [generatedFleet, setGeneratedFleet] = useState<PlannerFleetRow[]>([]);
  const [generating, setGenerating] = useState(false);
  const [proposedTasks, setProposedTasks] = useState<ProposedTask[]>([]);
  const [approvingIdx, setApprovingIdx] = useState<number | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [focusMachine, setFocusMachine] = useState<string | null>(null);
  const [showRisk, setShowRisk] = useState(true);
  const l = (fr: string, en: string, ar: string) =>
    repairText(lang === "fr" ? fr : lang === "en" ? en : ar);
  const requestedFocusMachine = useMemo(
    () => new URLSearchParams(location.search).get("machine"),
    [location.search],
  );
  const fallbackPlannerRows = useMemo(
    () => buildFallbackPlannerRows(insights),
    [insights],
  );
  const blockedCalendarRows = useMemo(
    () =>
      generatedFleet.filter(
        (row) =>
          !row.task_suggestion &&
          ((row.similar_open_tasks ?? 0) > 0 || Boolean(row.repeat_cooldown_active)),
      ),
    [generatedFleet],
  );

  const plannerTitle = l(
    "Choisir quoi traiter en premier",
    "Fleet priority control",
    "Fleet priority control",
  );
  const plannerSubtitle = l(
    "La page classe les machines, propose les actions utiles, puis envoie les taches validees au calendrier maintenance.",
    "Ranks the fleet, suggests useful actions, and sends validated tasks to the maintenance calendar.",
    "Ranks the fleet, suggests useful actions, and sends validated tasks to the maintenance calendar.",
  );
  const workflowTitle = l("3 étapes simples", "3 simple steps", "3 simple steps");
  const workflowSubtitle = l(
    "1. Cliquez une machine si vous voulez la cibler. 2. Preparez les actions. 3. Validez les taches a envoyer au calendrier.",
    "1. Focus a machine if needed. 2. Prepare the actions. 3. Validate each task to send it to the calendar.",
    "1. Focus a machine if needed. 2. Prepare the actions. 3. Validate each task to send it to the calendar.",
  );
  const fleetRiskTitle = l(
    "Machines à traiter d'abord",
    "Machine priority order",
    "Machine priority order",
  );
  const fullPlanTitle = l("Actions proposees", "Suggested actions", "Suggested actions");
  const generateLabel = l(
    "Preparer les actions",
    "Prepare actions",
    "Prepare actions",
  );
  const generatingLabel = l("Preparation...", "Preparing...", "Preparing...");
  const proposedTasksTitle = l(
    "Tâches à envoyer au calendrier",
    "Actions to validate for the calendar",
    "Actions to validate for the calendar",
  );
  const loadingRiskLabel = l("Chargement...", "Loading...", "Loading...");
  const noDataLabel = l(
    "Aucune lecture disponible - démarrez le simulateur",
    "No data - start the simulator",
    "No data - start the simulator",
  );
  const openTasksLabel = l("tâche(s) ouverte(s)", "open task(s)", "open task(s)");
  const alreadyScheduledLabel = l(
    "action(s) déjà planifiée(s)",
    "similar task(s) already open",
    "similar task(s) already open",
  );
  const autoRefreshLabel = l("Mise à jour auto 5 s", "Auto refresh 5 s", "Auto refresh 5 s");

  const notifyPlanGeneration = (taskCount: number, blockedCount: number) => {
    if (taskCount > 0) {
      toast.success(
        l(
          `${taskCount} tâche(s) prete(s) a validation.`,
          `${taskCount} task(s) ready for validation.`,
          `${taskCount} task(s) ready for validation.`,
        ),
      );
      return;
    }

    if (blockedCount > 0) {
      toast.warning(
        l(
          "Aucune nouvelle tâche à valider : une action équivalente est déjà ouverte ou vient d'être réalisée récemment.",
          "No new task to approve: an equivalent action is already open or was completed recently.",
          "No new task to approve: an equivalent action is already open or was completed recently.",
        ),
      );
      return;
    }

    toast.success(
      l(
        "Aucune nouvelle tâche à proposer pour le moment.",
        "No new task to propose right now.",
        "No new task to propose right now.",
      ),
    );
  };

  const loadFallbackPlannerRowsWithHistory = async () => {
    try {
      const tasks = await listGmaoTaches(isAdmin ? undefined : currentUser?.machineId);
      return buildFallbackPlannerRows(insights, buildTaskHistoryIndex(tasks));
    } catch {
      return buildFallbackPlannerRows(insights);
    }
  };

  const hydrateLocalPlan = async () => {
    const localRows = await loadFallbackPlannerRowsWithHistory();
    const scopedRows = focusMachine
      ? localRows.filter((row) => row.machine_code === focusMachine)
      : localRows;

    if (scopedRows.length === 0) {
      return false;
    }

    const fallbackData = buildLocalGeneratePlanResponse(scopedRows, focusMachine, l);
    setPlanText(fallbackData.markdown);
    setPlanGeneratedAt(fallbackData.generated_at);
    setGeneratedFleet(fallbackData.fleet);
    setProposedTasks(fallbackData.tasks);
    notifyPlanGeneration(
      fallbackData.tasks.length,
      fallbackData.fleet.filter(
        (row) =>
          !row.task_suggestion &&
          ((row.similar_open_tasks ?? 0) > 0 || Boolean(row.repeat_cooldown_active)),
      ).length,
    );
    return true;
  };

  useEffect(() => {
    setLoadingRisk(loadingMachines && fallbackPlannerRows.length === 0);
    setRiskData(
      fallbackPlannerRows.map((row) => ({
        machine_code: row.machine_code,
        nom: row.nom,
        region: row.region,
        hi: row.hi,
        rul_days: row.rul_days,
        zone: row.zone,
        risk_score: row.risk_score,
        risk_level: row.risk_level,
        risk_label: row.risk_label,
        summary: row.summary,
        recommended_action: row.recommended_action,
        maintenance_window: row.maintenance_window,
        open_tasks: row.open_tasks,
        data_source: row.data_source,
        updated_at: row.updated_at,
        is_stale: row.is_stale,
      })),
    );
  }, [fallbackPlannerRows, loadingMachines]);

  useEffect(() => {
    setFocusMachine(requestedFocusMachine);
  }, [requestedFocusMachine]);

  const generatePlan = async () => {
    setGenerating(true);
    setPlanText("");
    setPlanGeneratedAt(null);
    setGeneratedFleet([]);
    setProposedTasks([]);
    setEditingIdx(null);

    if (!isAdmin) {
      try {
        const hasLocalPlan = await hydrateLocalPlan();
        if (!hasLocalPlan) {
          throw new Error("planner_empty");
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : l(
                "Erreur lors de la gÃ©nÃ©ration de la synthÃ¨se",
                "Failed to generate the summary",
                "Failed to generate the summary",
              ),
        );
      } finally {
        setGenerating(false);
      }
      return;
    }

    try {
      const scopedRows = focusMachine
        ? fallbackPlannerRows.filter((row) => row.machine_code === focusMachine)
        : fallbackPlannerRows;

      const backendResponse = await apiFetch("/planner/generate", {
        method: "POST",
        body: JSON.stringify({ focus_machine: focusMachine }),
      });
      const data = normalizeGeneratePlanResponse(backendResponse);
      if (!data || (data.fleet.length === 0 && scopedRows.length === 0)) {
        throw new Error("planner_empty");
      }

      setPlanText(data.markdown);
      setPlanGeneratedAt(data.generated_at);
      setGeneratedFleet(data.fleet);
      setProposedTasks(data.tasks);
      notifyPlanGeneration(
        data.tasks.length,
        data.fleet.filter(
          (row) =>
            !row.task_suggestion &&
            ((row.similar_open_tasks ?? 0) > 0 || Boolean(row.repeat_cooldown_active)),
        ).length,
      );
    } catch (error) {
      const hasLocalPlan = await hydrateLocalPlan();
      if (hasLocalPlan) {
        toast.warning(
          l(
            "Service de plan indisponible - une version locale a été préparée avec les données chargées.",
            "Planning service unavailable - a local version was prepared from the loaded data.",
            "Planning service unavailable - a local version was prepared from the loaded data.",
          ),
        );
      } else {
        toast.error(
          error instanceof Error
            ? error.message
            : l(
                "Erreur lors de la génération de la synthèse",
                "Failed to generate the summary",
                "Failed to generate the summary",
              ),
        );
      }
    } finally {
      setGenerating(false);
    }
  };

  const finalizeApprovedTask = (idx: number, task: ProposedTask) => {
    setRiskData((previous) =>
      previous.map((entry) =>
        entry.machine_code === task.machine_code
          ? { ...entry, open_tasks: entry.open_tasks + 1 }
          : entry,
      ),
    );
    setGeneratedFleet((previous) =>
      previous.map((entry) =>
        entry.machine_code === task.machine_code
          ? {
              ...entry,
              open_tasks: entry.open_tasks + 1,
              similar_open_tasks: (entry.similar_open_tasks ?? 0) + 1,
            }
          : entry,
      ),
    );
    setProposedTasks((previous) => previous.filter((_, index) => index !== idx));
    setEditingIdx((previous) => {
      if (previous == null) return previous;
      if (previous === idx) return null;
      return previous > idx ? previous - 1 : previous;
    });
    void queryClient.invalidateQueries({ queryKey: ["gmao_taches"] });
    void queryClient.invalidateQueries({ queryKey: ["machines"] });
  };

  const approveTask = async (idx: number) => {
    const task = proposedTasks[idx];
    if (!task) return;
    setApprovingIdx(idx);

    try {
      const response = (await apiFetch("/planner/approve", {
        method: "POST",
        body: JSON.stringify(task),
      })) as ApproveTaskResponse;
      toast.success(
        replaceMachineCodesForDisplay(
          l(
          `Tâche "${task.titre}" créée dans la GMAO`,
          `Task "${task.titre}" created in the GMAO`,
          `Task "${task.titre}" created in the GMAO`,
          ),
        ),
      );
      if (response?.repeat_note) {
        toast.warning(replaceMachineCodesForDisplay(response.repeat_note));
      }
      finalizeApprovedTask(idx, task);
    } catch (error) {
      const apiError = parseApiError(error);
      if (apiError.status === 409) {
        toast.warning(
          replaceMachineCodesForDisplay(
            apiError.message ||
              l(
                "Une action équivalente est déjà ouverte dans le calendrier.",
                "An equivalent action is already open in the calendar.",
                "An equivalent action is already open in the calendar.",
              ),
          ),
        );
        return;
      }
      if (apiError.status !== null && apiError.status < 500) {
        toast.error(
          replaceMachineCodesForDisplay(
            apiError.message ||
              l(
                "Impossible de valider la tâche.",
                "Unable to approve the task.",
                "Unable to approve the task.",
              ),
          ),
        );
        return;
      }

      try {
        try {
          const existingTasks = await listGmaoTaches();
          const duplicateMessage = findLocalDuplicateMessage(existingTasks, task);
          if (duplicateMessage) {
            toast.warning(duplicateMessage);
            return;
          }
        } catch {
          // Continue to the write fallback when task history cannot be loaded.
        }

        const targetMachine = machines.find((machine) => machine.id === task.machine_code);
        const fallbackResult = await createGmaoTache({
          machine_id: targetMachine?.uuid ?? targetMachine?.id ?? task.machine_code,
          titre: task.titre,
          description: task.description,
          statut: "planifiee",
          technicien: task.technicien || undefined,
          date_planifiee: task.date_planifiee || undefined,
          cout_estime: task.cout_estime ?? undefined,
          type: task.type,
        });

        finalizeApprovedTask(idx, task);
        if (fallbackResult.mode === "queued") {
          toast.warning(
            replaceMachineCodesForDisplay(
              l(
                `Backend GMAO indisponible - tâche "${task.titre}" gardée localement et prête à être synchronisée.`,
                `GMAO backend unavailable - task "${task.titre}" was queued locally for sync.`,
                `تعذر الوصول إلى GMAO - تم حفظ المهمة "${task.titre}" محليا إلى حين المزامنة.`,
              ),
            ),
          );
        } else {
          toast.success(
            replaceMachineCodesForDisplay(
              l(
                `Tâche "${task.titre}" créée via le plan B GMAO`,
                `Task "${task.titre}" created through the GMAO fallback`,
                `تم إنشاء المهمة "${task.titre}" عبر المسار الاحتياطي`,
              ),
            ),
          );
        }
      } catch (fallbackError) {
        toast.error(
          fallbackError instanceof Error
            ? replaceMachineCodesForDisplay(fallbackError.message)
            : error instanceof Error
              ? replaceMachineCodesForDisplay(error.message)
              : l("Erreur d'approbation", "Approval failed", "Approval failed"),
        );
      }
    } finally {
      setApprovingIdx(null);
    }
  };

  const displayText = replaceMachineCodesForDisplay(planText.trim());
  const rankedRisk = useMemo(
    () => [...riskData].sort((left, right) => right.risk_score - left.risk_score),
    [riskData],
  );
  const selectedRisk = useMemo(
    () => rankedRisk.find((entry) => entry.machine_code === focusMachine) ?? null,
    [focusMachine, rankedRisk],
  );
  const criticalCount = rankedRisk.filter((entry) => entry.risk_level === "critical").length;
  const priorityCount = rankedRisk.filter((entry) => entry.risk_level === "priority").length;
  const staleCount = rankedRisk.filter((entry) => entry.is_stale).length;

  const riskCounters = [
    {
      label: l("Urgent", "Critical", "Critical"),
      value: criticalCount,
      valueClass: "text-destructive",
      caption: l("agir vite", "Fast action", "Fast action"),
    },
    {
      label: l("À programmer", "To schedule", "To schedule"),
      value: priorityCount,
      valueClass: "text-warning",
      caption: l("à planifier", "Useful window", "Useful window"),
    },
    {
      label: l("À vérifier", "To confirm", "To confirm"),
      value: staleCount,
      valueClass: "text-primary",
      caption: l("lecture à revoir", "Stream to recheck", "Stream to recheck"),
    },
  ];

  const planTitle = focusMachine
    ? l(
        `Actions proposees pour ${formatMachineLabel(focusMachine)}`,
        `Suggested actions for ${formatMachineLabel(focusMachine)}`,
        `Suggested actions for ${formatMachineLabel(focusMachine)}`,
      )
    : fullPlanTitle;
  const planSubtitle = selectedRisk
    ? l(
        `Lisez le resume pour ${formatMachineLabel(selectedRisk.machine_code, selectedRisk.nom)}, puis validez seulement les actions utiles ci-dessous.`,
        `Review the summary for ${formatMachineLabel(selectedRisk.machine_code, selectedRisk.nom)} before validating the useful actions below.`,
        `Review the summary for ${formatMachineLabel(selectedRisk.machine_code, selectedRisk.nom)} before validating the useful actions below.`,
      )
    : l(
        "Lisez le resume, puis validez les actions a envoyer au calendrier.",
        "Review the summary, then validate the actions to send to the calendar.",
        "Review the summary, then validate the actions to send to the calendar.",
      );

  const workflowSteps = [
    {
      id: "focus",
      step: "1",
      title: l("Cliquer une machine", "Click a machine", "Click a machine"),
      detail: focusMachine
        ? l(
            `Machine choisie : ${formatMachineLabel(focusMachine)}. Recliquez sur sa carte ou utilisez "Voir toute la flotte" pour revenir à la vue globale.`,
            `Focused machine: ${formatMachineLabel(focusMachine)}`,
            `Focused machine: ${formatMachineLabel(focusMachine)}`,
          )
        : l(
            "Cliquez une carte dans la liste ci-dessous pour cibler une machine. Sans sélection, le plan reste global pour toute la flotte.",
            "Optional: keep the fleet view or choose a machine in the list below.",
            "Optional: keep the fleet view or choose a machine in the list below.",
          ),
      active: Boolean(focusMachine),
    },
    {
      id: "generate",
      step: "2",
      title: l("Preparer les actions", "Prepare actions", "Prepare actions"),
      detail: displayText
        ? l(
            "Les actions sont pretes. Verifiez-les avant de valider les taches.",
            "The actions are ready. Review them before validating the tasks.",
            "The actions are ready. Review them before validating the tasks.",
          )
        : l(
            "Cliquez sur le bouton vert pour preparer les actions.",
            "Use the green button to prepare the actions.",
            "Use the green button to prepare the actions.",
          ),
      active: generating || Boolean(displayText),
    },
    {
      id: "validate",
      step: "3",
      title: l("Envoyer au calendrier", "Send to calendar", "Send to calendar"),
      detail:
        proposedTasks.length > 0
          ? l(
              `${proposedTasks.length} tâche(s) sont prêtes à être envoyées au calendrier.`,
              `${proposedTasks.length} action(s) waiting for calendar validation.`,
              `${proposedTasks.length} action(s) waiting for calendar validation.`,
            )
          : l(
              "Après génération, chaque validation ajoute la tâche au calendrier maintenance.",
              "Each validation creates the task directly in the maintenance calendar.",
              "Each validation creates the task directly in the maintenance calendar.",
            ),
      active: proposedTasks.length > 0,
    },
  ];

  return (
    <div className={embedded ? "space-y-5" : "space-y-6"}>
      {!embedded && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Brain className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-foreground">{plannerTitle}</h2>
                <p className="text-xs text-muted-foreground">{plannerSubtitle}</p>
              </div>
            </div>
            <span className="rounded-full border border-border bg-card px-3 py-1 text-[0.65rem] font-semibold text-muted-foreground">
              {autoRefreshLabel}
            </span>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="section-title">{workflowTitle}</div>
            <p className="mt-1 text-xs text-muted-foreground">{workflowSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={generatePlan}
            disabled={generating}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {generating ? generatingLabel : generateLabel}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {workflowSteps.map((item) => (
            <div
              key={item.id}
              className={`rounded-2xl border px-4 py-3 ${
                item.active ? "border-primary/30 bg-primary/5" : "border-border bg-muted/10"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[0.68rem] font-semibold ${
                    item.active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
                  }`}
                >
                  {item.step}
                </span>
                <span className="text-sm font-semibold text-foreground">{item.title}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <button type="button" onClick={() => setShowRisk(!showRisk)} className="flex min-w-0 items-center gap-2 text-left">
              <span className="section-title flex-1">{fleetRiskTitle}</span>
              {showRisk ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            <p className="mt-1 text-xs text-muted-foreground">
              {l(
                "Cliquez une carte pour cibler cette machine. Recliquez dessus, ou utilisez \"Voir toute la flotte\", pour revenir à la vue globale.",
                "Choose a machine to focus the summary, or keep the fleet view for a global readout.",
                "Choose a machine to focus the summary, or keep the fleet view for a global readout.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {riskCounters.map((card) => (
              <div key={card.label} className="min-w-[104px] rounded-xl border border-border bg-muted/15 px-3 py-2 text-right">
                <div className="industrial-label">{card.label}</div>
                <div className={`mt-1 text-lg font-semibold ${card.valueClass}`}>{card.value}</div>
                <div className="text-[0.68rem] text-muted-foreground">{card.caption}</div>
              </div>
            ))}
            {focusMachine && (
              <button
                type="button"
                onClick={() => setFocusMachine(null)}
                className="rounded-full border border-border px-3 py-1 text-[0.7rem] font-medium text-muted-foreground transition-all hover:bg-muted"
              >
                {l("Voir toute la flotte", "Show full fleet", "Show full fleet")}
              </button>
            )}
          </div>
        </div>

        {showRisk && (
          <div className="mt-4 space-y-3">
            {loadingRisk ? (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {loadingRiskLabel}
              </div>
            ) : rankedRisk.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{noDataLabel}</p>
            ) : (
              rankedRisk.map((entry) => {
                const config = RISK_CONFIG[entry.risk_level] || RISK_CONFIG.stable;
                const Icon = config.icon;
                const active = focusMachine === entry.machine_code;

                return (
                  <button
                    key={entry.machine_code}
                    type="button"
                    onClick={() => setFocusMachine(active ? null : entry.machine_code)}
                    className={`w-full rounded-2xl border p-4 text-left transition-all ${
                      active ? "border-primary bg-primary/5 shadow-premium" : `border-border hover:border-primary/20 ${config.panel}`
                    }`}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${config.bg}`}>
                          <Icon className={`h-4 w-4 ${config.color}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-semibold text-foreground">
                              {formatMachineLabel(entry.machine_code, entry.nom)}
                            </div>
                            <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-semibold ${config.bg} ${config.color}`}>
                              {entry.risk_label}
                            </span>
                            <span className="rounded-full bg-card px-2 py-0.5 text-[0.6rem] text-muted-foreground">
                              {getSourceLabel(entry.data_source)}
                            </span>
                            {active && (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.6rem] font-semibold text-primary">
                                {l("Machine ciblée", "Focused machine", "Focused machine")}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[0.72rem] text-muted-foreground">
                            {entry.region} - {entry.open_tasks} {openTasksLabel} - {formatUpdatedAt(entry.updated_at)}
                          </div>
                          <div className="mt-2 text-sm text-secondary-foreground">{entry.summary}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{entry.recommended_action}</div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right lg:min-w-[92px]">
                        <div className="industrial-label">{l("Score", "Score", "Score")}</div>
                        <div className={`mt-1 text-xl font-semibold ${config.color}`}>{entry.risk_score}</div>
                        <div className="mt-2 space-y-1 text-[0.68rem] text-muted-foreground">
                          <div>{formatHi(entry.hi)}</div>
                          <div>{formatRul(entry.rul_days)}</div>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {(displayText || generating) && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="section-title">{planTitle}</div>
              <p className="mt-1 text-xs text-muted-foreground">{planSubtitle}</p>
            </div>
            {focusMachine && (
              <span className="rounded-full border border-border bg-surface-3 px-3 py-1 text-[0.7rem] font-medium text-muted-foreground">
                {l("Machine ciblée", "Focused machine", "Focused machine")}: {formatMachineLabel(focusMachine)}
              </span>
            )}
          </div>

          {displayText ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {planGeneratedAt && (
                      <span className="rounded-full border border-border bg-surface-3 px-3 py-1">
                    {l("Généré le", "Generated on", "Generated on")} {formatUpdatedAt(planGeneratedAt)}
                      </span>
                    )}
                {focusMachine && (
                  <span className="rounded-full border border-border bg-surface-3 px-3 py-1">
                    {l("Cible", "Focus", "Focus")} {formatMachineLabel(focusMachine)}
                  </span>
                )}
                {generatedFleet.length > 0 && (
                  <span className="rounded-full border border-border bg-surface-3 px-3 py-1">
                    {generatedFleet.length} {l("priorité(s) retenue(s)", "selected priorities", "selected priorities")}
                  </span>
                )}
              </div>

              {generatedFleet.length > 0 && (
                <div className="space-y-3">
                  <div className="industrial-label">{l("Machines retenues", "Selected priorities", "Selected priorities")}</div>
                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {generatedFleet.slice(0, 4).map((row) => {
                      const config = RISK_CONFIG[row.risk_level] || RISK_CONFIG.stable;
                      const reasonText =
                        trimPlannerText(row.plain_reason || row.summary, 110) ??
                        trimPlannerText(row.summary, 110) ??
                        null;
                      const recommendedActionText =
                        trimPlannerText(row.recommended_action, 96) ?? row.recommended_action;
                      const impactText = trimPlannerText(row.impact, 104);
                      const taskContextText = trimPlannerText(row.task_context ?? null, 104);
                      const checks = trimPlannerText(row.field_checks.slice(0, 2).join(" | "), 110);
                      return (
                        <div key={row.machine_code} className={`rounded-2xl border p-4 ${config.panel}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-foreground">
                                {formatMachineLabel(row.machine_code, row.nom)}
                              </div>
                              {reasonText ? (
                                <div className="mt-1 text-xs text-muted-foreground">{reasonText}</div>
                              ) : null}
                            </div>
                            <span className={`rounded-full px-2.5 py-1 text-[0.65rem] font-semibold ${config.bg} ${config.color}`}>
                              {row.risk_label}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-[0.7rem]">
                            <span className="rounded-full bg-card px-2.5 py-1 text-foreground">{formatHi(row.hi)}</span>
                            <span className="rounded-full bg-card px-2.5 py-1 text-foreground">{formatRul(row.rul_days)}</span>
                            <span className="rounded-full bg-card px-2.5 py-1 text-foreground">
                              {getSourceLabel(row.data_source)}
                            </span>
                            <span className="rounded-full bg-card px-2.5 py-1 text-foreground">
                              {formatCurrency(row.projected_cost)}
                            </span>
                            {(row.similar_open_tasks ?? 0) > 0 && (
                              <span className="rounded-full bg-card px-2.5 py-1 text-foreground">
                                {row.similar_open_tasks} {alreadyScheduledLabel}
                              </span>
                            )}
                            {(row.recent_completed_tasks ?? 0) > 0 && (
                              <span className="rounded-full bg-card px-2.5 py-1 text-foreground">
                                {row.recent_completed_tasks} {l("action(s) récente(s)", "recent action(s)", "recent action(s)")}
                              </span>
                            )}
                            {row.repeat_cooldown_active && (
                              <span className="rounded-full bg-card px-2.5 py-1 text-foreground">
                                {l("cooldown récent actif", "recent cooldown active", "recent cooldown active")}
                              </span>
                            )}
                          </div>
                          <div className="mt-3 text-sm text-secondary-foreground">{recommendedActionText}</div>
                          {impactText && <div className="mt-2 text-xs text-muted-foreground">{impactText}</div>}
                          {taskContextText && (
                            <div className="mt-2 text-[0.72rem] text-muted-foreground">{taskContextText}</div>
                          )}
                          {checks && (
                            <div className="mt-2 text-[0.72rem] text-muted-foreground">
                              {l("Contrôle terrain", "Field checks", "Field checks")}: {checks}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="industrial-label mb-2">{l("Résumé", "Planner note", "Planner note")}</div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-secondary-foreground">{displayText}</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted/10 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {generatingLabel}
            </div>
          )}
        </div>
      )}

      {!generating && proposedTasks.length === 0 && blockedCalendarRows.length > 0 && (
        <div className="rounded-2xl border border-warning/20 bg-warning/5 p-5">
          <div className="section-title mb-1">
            {l("Calendrier déjà alimenté", "Calendar already filled", "Calendar already filled")}
          </div>
          <p className="text-sm text-muted-foreground">
            {l(
              "Aucune nouvelle tâche à valider : une action équivalente est déjà ouverte ou vient d'être réalisée récemment sur les machines prioritaires. Vérifiez la tâche existante ou laissez passer la fenêtre de cooldown.",
              "No new task to approve: an equivalent action is already open or was completed recently on the priority machines. Review the existing task or wait for the cooldown window.",
              "No new task to approve: an equivalent action is already open or was completed recently on the priority machines. Review the existing task or wait for the cooldown window.",
            )}
          </p>
        </div>
      )}

      {proposedTasks.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="section-title mb-1">{proposedTasksTitle}</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            {l(
              "Chaque validation crée immédiatement une tâche dans le calendrier de maintenance.",
              "Each approval immediately creates a task in the maintenance calendar.",
              "Each approval immediately creates a task in the maintenance calendar.",
            )}
          </p>
          <div className="space-y-3">
            {proposedTasks.map((task, idx) => (
              <div key={`${task.machine_code}-${idx}`} className="rounded-xl border border-border bg-muted/20 p-4">
                {editingIdx === idx ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[0.65rem] font-medium text-muted-foreground">
                          {l("Titre", "Title", "Title")}
                        </label>
                        <input
                          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                          value={task.titre}
                          onChange={(event) => {
                            const value = event.target.value;
                            setProposedTasks((previous) =>
                              previous.map((entry, index) => (index === idx ? { ...entry, titre: value } : entry)),
                            );
                          }}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[0.65rem] font-medium text-muted-foreground">
                          {l("Machine", "Machine", "Machine")}
                        </label>
                        <input
                          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                          value={task.machine_code}
                          onChange={(event) => {
                            const value = event.target.value;
                            setProposedTasks((previous) =>
                              previous.map((entry, index) => (index === idx ? { ...entry, machine_code: value } : entry)),
                            );
                          }}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[0.65rem] font-medium text-muted-foreground">
                          {l("Type", "Type", "Type")}
                        </label>
                        <select
                          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                          value={task.type}
                          onChange={(event) => {
                            const value = event.target.value as ProposedTask["type"];
                            setProposedTasks((previous) =>
                              previous.map((entry, index) => (index === idx ? { ...entry, type: value } : entry)),
                            );
                          }}
                        >
                          <option value="preventive">{l("Préventive", "Preventive", "Preventive")}</option>
                          <option value="corrective">{l("Corrective", "Corrective", "Corrective")}</option>
                          <option value="inspection">{l("Inspection", "Inspection", "Inspection")}</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[0.65rem] font-medium text-muted-foreground">
                          {l("Priorité", "Priority", "Priority")}
                        </label>
                        <select
                          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                          value={task.priorite}
                          onChange={(event) => {
                            const value = event.target.value as ProposedTask["priorite"];
                            setProposedTasks((previous) =>
                              previous.map((entry, index) => (index === idx ? { ...entry, priorite: value } : entry)),
                            );
                          }}
                        >
                          <option value="haute">{l("Haute", "High", "High")}</option>
                          <option value="moyenne">{l("Moyenne", "Medium", "Medium")}</option>
                          <option value="basse">{l("Basse", "Low", "Low")}</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[0.65rem] font-medium text-muted-foreground">
                          {l("Date planifiée", "Scheduled date", "Scheduled date")}
                        </label>
                        <input
                          type="date"
                          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                          value={task.date_planifiee}
                          onChange={(event) => {
                            const value = event.target.value;
                            setProposedTasks((previous) =>
                              previous.map((entry, index) => (index === idx ? { ...entry, date_planifiee: value } : entry)),
                            );
                          }}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[0.65rem] font-medium text-muted-foreground">
                          {l("Coût estimé (TND)", "Estimated cost (TND)", "Estimated cost (TND)")}
                        </label>
                        <input
                          type="number"
                          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                          value={task.cout_estime ?? ""}
                          onChange={(event) => {
                            const value = event.target.value ? parseFloat(event.target.value) : null;
                            setProposedTasks((previous) =>
                              previous.map((entry, index) => (index === idx ? { ...entry, cout_estime: value } : entry)),
                            );
                          }}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-[0.65rem] font-medium text-muted-foreground">
                          {l("Assigné à (optionnel)", "Assigned to (optional)", "Assigned to (optional)")}
                        </label>
                        <input
                          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                          placeholder={l("Nom du technicien", "Technician name", "Technician name")}
                          value={task.technicien}
                          onChange={(event) => {
                            const value = event.target.value;
                            setProposedTasks((previous) =>
                              previous.map((entry, index) => (index === idx ? { ...entry, technicien: value } : entry)),
                            );
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-[0.65rem] font-medium text-muted-foreground">
                        {l("Description", "Description", "Description")}
                      </label>
                      <textarea
                        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                        rows={2}
                        value={task.description}
                        onChange={(event) => {
                          const value = event.target.value;
                          setProposedTasks((previous) =>
                            previous.map((entry, index) => (index === idx ? { ...entry, description: value } : entry)),
                          );
                        }}
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingIdx(null)}
                        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-all hover:bg-muted"
                      >
                        <X className="h-3 w-3" />
                        {l("Fermer", "Close", "Close")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingIdx(null);
                          toast.success(l("Modifications enregistrees", "Changes saved", "Changes saved"));
                        }}
                        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/90"
                      >
                        <Check className="h-3 w-3" />
                        {l("Enregistrer", "Save", "Save")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {replaceMachineCodesForDisplay(task.titre)}
                        </span>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.6rem] font-medium text-primary">
                          {formatMachineLabel(task.machine_code)}
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[0.6rem] text-muted-foreground">
                          {task.type}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {replaceMachineCodesForDisplay(task.description)}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[0.65rem] text-muted-foreground">
                        {task.date_planifiee && (
                          <span>
                            {l("Date", "Date", "Date")}: {task.date_planifiee}
                          </span>
                        )}
                        {task.cout_estime != null && (
                          <span>
                            {l("Coût", "Cost", "Cost")}: {task.cout_estime} TND
                          </span>
                        )}
                        {task.technicien && (
                          <span>
                            {l("Technicien", "Technician", "Technician")}: {task.technicien}
                          </span>
                        )}
                        <span
                          className={`font-medium ${
                            task.priorite === "haute"
                              ? "text-destructive"
                              : task.priorite === "moyenne"
                                ? "text-warning"
                                : "text-success"
                          }`}
                        >
                          {task.priorite}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingIdx(idx)}
                        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-all hover:bg-muted"
                      >
                        <Pencil className="h-3 w-3" />
                        {l("Editer", "Edit", "Edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void approveTask(idx)}
                        disabled={approvingIdx === idx || !isAdmin}
                        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
                      >
                        {approvingIdx === idx ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        {l(
                          "Valider et creer dans le calendrier",
                          "Approve and create in calendar",
                          "Approve and create in calendar",
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
