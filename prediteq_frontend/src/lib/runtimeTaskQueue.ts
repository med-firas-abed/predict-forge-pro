import { safeStorageGet, safeStorageSet } from "@/lib/browserStorage";
import { repairText } from "@/lib/repairText";

import type {
  GmaoTache,
  GmaoTacheCreateInput,
  GmaoTacheUpdateInput,
  TacheStatut,
} from "@/lib/runtimeDataRepository";

const TASK_CACHE_KEY_PREFIX = "prediteq-task-cache-v1";
const TASK_QUEUE_KEY = "prediteq-task-queue-v1";
const MACHINE_CACHE_KEY_PREFIX = "prediteq-machine-cache-v5";
const LOCAL_TASK_ID_PREFIX = "queue-task-";

export const TASK_QUEUE_EVENT_NAME = "prediteq-task-queue-changed";

export interface TaskMutationResult {
  mode: "api" | "supabase" | "queued";
}

interface QueuedTaskOperation {
  id: string;
  kind: "create" | "update" | "delete";
  taskId: string;
  machineId: string | null;
  createdAt: string;
  payload: GmaoTacheCreateInput | GmaoTacheUpdateInput | { id: string };
  shadowTask: GmaoTache | null;
}

export interface TaskQueueFlushResult {
  syncedCount: number;
  remainingCount: number;
  lastError: string | null;
}

export interface TaskQueueExecutor {
  create: (input: GmaoTacheCreateInput) => Promise<void>;
  update: (input: GmaoTacheUpdateInput) => Promise<void>;
  delete: (id: string) => Promise<void>;
}

function emitTaskQueueChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TASK_QUEUE_EVENT_NAME));
}

function taskCacheKey(machineId?: string) {
  return `${TASK_CACHE_KEY_PREFIX}:${machineId ?? "all"}`;
}

function generateQueueId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseTaskArray(raw: string | null): GmaoTache[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GmaoTache[]) : [];
  } catch {
    return [];
  }
}

function normalizeTask(task: GmaoTache): GmaoTache {
  return {
    ...task,
    titre: repairText(task.titre),
    description: repairText(task.description),
    technicien: repairText(task.technicien),
    machineCode: repairText(task.machineCode),
  };
}

function readQueue(): QueuedTaskOperation[] {
  const raw = safeStorageGet(TASK_QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedTaskOperation[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedTaskOperation[]) {
  safeStorageSet(TASK_QUEUE_KEY, JSON.stringify(queue));
  emitTaskQueueChanged();
}

function mergeUpdatePayload(
  previous: GmaoTacheUpdateInput,
  next: GmaoTacheUpdateInput,
): GmaoTacheUpdateInput {
  return {
    ...previous,
    ...Object.fromEntries(
      Object.entries(next).filter(([, value]) => value !== undefined),
    ),
    id: previous.id,
  };
}

function mergeCreateWithUpdate(
  createInput: GmaoTacheCreateInput,
  updateInput: GmaoTacheUpdateInput,
): GmaoTacheCreateInput {
  const merged: GmaoTacheCreateInput = { ...createInput };

  if (updateInput.technicien !== undefined) merged.technicien = updateInput.technicien;
  if (updateInput.date_planifiee !== undefined) merged.date_planifiee = updateInput.date_planifiee;
  if (updateInput.statut !== undefined) merged.statut = updateInput.statut;
  if (updateInput.type !== undefined) merged.type = updateInput.type;
  if (updateInput.description !== undefined) merged.description = updateInput.description;
  if (updateInput.cout_estime !== undefined) {
    if (updateInput.cout_estime === null) {
      delete merged.cout_estime;
    } else {
      merged.cout_estime = updateInput.cout_estime;
    }
  }

  return merged;
}

function sortTasks(tasks: GmaoTache[]) {
  return [...tasks].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function resolveMachineCode(machineId: string) {
  if (typeof window === "undefined") return machineId;

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(MACHINE_CACHE_KEY_PREFIX)) continue;

    const machinesRaw = safeStorageGet(key);
    if (!machinesRaw) continue;

    try {
      const machines = JSON.parse(machinesRaw);
      if (!Array.isArray(machines)) continue;
      const match = machines.find(
        (machine) =>
          machine &&
          typeof machine === "object" &&
          ((machine.uuid && String(machine.uuid) === machineId) ||
            (machine.id && String(machine.id) === machineId)),
      ) as { id?: string } | undefined;
      if (match?.id) {
        return repairText(match.id);
      }
    } catch {
      // Ignore malformed cache entries.
    }
  }

  return machineId;
}

function buildShadowTask(
  input: GmaoTacheCreateInput,
  overrides?: Partial<GmaoTache>,
): GmaoTache {
  const createdAt = overrides?.createdAt ?? new Date().toISOString();
  const id = overrides?.id ?? generateQueueId(LOCAL_TASK_ID_PREFIX);

  return normalizeTask({
    id,
    machineId: overrides?.machineId ?? input.machine_id,
    machineCode: overrides?.machineCode ?? resolveMachineCode(input.machine_id),
    titre: overrides?.titre ?? input.titre,
    description: overrides?.description ?? input.description ?? "",
    statut: overrides?.statut ?? input.statut ?? "planifiee",
    technicien: overrides?.technicien ?? input.technicien ?? "",
    datePlanifiee: overrides?.datePlanifiee ?? input.date_planifiee ?? null,
    coutEstime:
      overrides?.coutEstime ?? (typeof input.cout_estime === "number" ? input.cout_estime : null),
    type: overrides?.type ?? input.type ?? "preventive",
    createdAt,
  });
}

function applyUpdateToTask(task: GmaoTache, input: GmaoTacheUpdateInput): GmaoTache {
  return normalizeTask({
    ...task,
    technicien: input.technicien ?? task.technicien,
    datePlanifiee:
      input.date_planifiee !== undefined ? input.date_planifiee ?? null : task.datePlanifiee,
    statut: input.statut ?? task.statut,
    type: input.type ?? task.type,
    coutEstime:
      input.cout_estime !== undefined ? input.cout_estime ?? null : task.coutEstime,
    description: input.description ?? task.description,
  });
}

function readQueueAwareTask(taskId: string, queue = readQueue()): GmaoTache | null {
  const cached = readTaskCache();
  const merged = mergeQueuedTasks(cached, undefined, queue);
  return merged.find((task) => task.id === taskId) ?? null;
}

function findQueuedCreateIndex(queue: QueuedTaskOperation[], taskId: string) {
  return queue.findIndex((entry) => entry.kind === "create" && entry.taskId === taskId);
}

function findQueuedUpdateIndex(queue: QueuedTaskOperation[], taskId: string) {
  return queue.findIndex((entry) => entry.kind === "update" && entry.taskId === taskId);
}

export function readTaskCache(machineId?: string): GmaoTache[] {
  const scoped = parseTaskArray(safeStorageGet(taskCacheKey(machineId)));
  if (scoped.length > 0) {
    return sortTasks(scoped.map(normalizeTask));
  }
  const all = parseTaskArray(safeStorageGet(taskCacheKey()));
  return sortTasks(all.map(normalizeTask));
}

export function writeTaskCache(tasks: GmaoTache[], machineId?: string) {
  safeStorageSet(taskCacheKey(machineId), JSON.stringify(sortTasks(tasks.map(normalizeTask))));
}

export function hasLocallyQueuedTask(taskId: string) {
  return taskId.startsWith(LOCAL_TASK_ID_PREFIX) || findQueuedCreateIndex(readQueue(), taskId) !== -1;
}

export function getPendingTaskQueueCount() {
  return readQueue().length;
}

export function mergeQueuedTasks(
  baseTasks: GmaoTache[],
  machineId?: string,
  queue = readQueue(),
): GmaoTache[] {
  const taskMap = new Map(baseTasks.map((task) => [task.id, normalizeTask(task)]));

  for (const operation of [...queue].sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
    if (operation.kind === "delete") {
      taskMap.delete(operation.taskId);
      continue;
    }

    if (operation.shadowTask) {
      taskMap.set(operation.taskId, normalizeTask(operation.shadowTask));
    }
  }

  const merged = sortTasks([...taskMap.values()]);
  if (!machineId) return merged;
  return merged.filter((task) => task.machineId === machineId);
}

export function queueCreateTask(input: GmaoTacheCreateInput): TaskMutationResult {
  const queue = readQueue();
  const shadowTask = buildShadowTask(input);

  queue.push({
    id: generateQueueId("task-op"),
    kind: "create",
    taskId: shadowTask.id,
    machineId: input.machine_id,
    createdAt: shadowTask.createdAt,
    payload: {
      ...input,
      description: input.description ?? "",
      technicien: input.technicien ?? "",
      type: input.type ?? "preventive",
      statut: input.statut ?? "planifiee",
    },
    shadowTask,
  });
  writeQueue(queue);
  return { mode: "queued" };
}

export function queueUpdateTask(input: GmaoTacheUpdateInput): TaskMutationResult {
  const queue = readQueue();
  const currentTask = readQueueAwareTask(input.id, queue);
  const shadowTask = currentTask ? applyUpdateToTask(currentTask, input) : null;
  const createIndex = findQueuedCreateIndex(queue, input.id);
  const updateIndex = findQueuedUpdateIndex(queue, input.id);

  if (createIndex !== -1) {
    const currentCreate = queue[createIndex];
    currentCreate.payload = mergeCreateWithUpdate(
      currentCreate.payload as GmaoTacheCreateInput,
      input,
    );
    currentCreate.shadowTask = shadowTask ?? currentCreate.shadowTask;
    writeQueue(queue);
    return { mode: "queued" };
  }

  if (updateIndex !== -1) {
    const currentUpdate = queue[updateIndex];
    currentUpdate.payload = mergeUpdatePayload(
      currentUpdate.payload as GmaoTacheUpdateInput,
      input,
    );
    currentUpdate.shadowTask = shadowTask ?? currentUpdate.shadowTask;
    writeQueue(queue);
    return { mode: "queued" };
  }

  queue.push({
    id: generateQueueId("task-op"),
    kind: "update",
    taskId: input.id,
    machineId: currentTask?.machineId ?? null,
    createdAt: new Date().toISOString(),
    payload: input,
    shadowTask,
  });
  writeQueue(queue);
  return { mode: "queued" };
}

export function queueUpdateTaskStatus(id: string, statut: TacheStatut): TaskMutationResult {
  return queueUpdateTask({ id, statut });
}

export function queueDeleteTask(id: string): TaskMutationResult {
  const queue = readQueue();
  const createIndex = findQueuedCreateIndex(queue, id);

  if (createIndex !== -1) {
    const filtered = queue.filter((entry) => entry.taskId !== id);
    writeQueue(filtered);
    return { mode: "queued" };
  }

  const withoutPreviousTaskOps = queue.filter(
    (entry) => !(entry.taskId === id && (entry.kind === "update" || entry.kind === "delete")),
  );
  withoutPreviousTaskOps.push({
    id: generateQueueId("task-op"),
    kind: "delete",
    taskId: id,
    machineId: null,
    createdAt: new Date().toISOString(),
    payload: { id },
    shadowTask: null,
  });
  writeQueue(withoutPreviousTaskOps);
  return { mode: "queued" };
}

export async function flushPendingTaskQueue(
  executor: TaskQueueExecutor,
): Promise<TaskQueueFlushResult> {
  const queue = [...readQueue()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const remaining: QueuedTaskOperation[] = [];
  let syncedCount = 0;
  let lastError: string | null = null;

  for (const operation of queue) {
    try {
      if (operation.kind === "create") {
        await executor.create(operation.payload as GmaoTacheCreateInput);
      } else if (operation.kind === "update") {
        await executor.update(operation.payload as GmaoTacheUpdateInput);
      } else {
        await executor.delete(operation.taskId);
      }
      syncedCount += 1;
    } catch (error) {
      remaining.push(operation);
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  writeQueue(remaining);
  return {
    syncedCount,
    remainingCount: remaining.length,
    lastError,
  };
}
