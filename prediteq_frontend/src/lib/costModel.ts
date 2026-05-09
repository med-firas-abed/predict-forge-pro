import type { TacheType } from "@/lib/runtimeDataRepository";

export const LABOR_RATE_PER_HOUR = 30;

const TASK_COST_ASSUMPTIONS: Record<
  TacheType,
  { laborHours: number; partsCost: number; label: string }
> = {
  preventive: {
    laborHours: 2,
    partsCost: 200,
    label: "Visite preventive",
  },
  inspection: {
    laborHours: 3,
    partsCost: 230,
    label: "Inspection renforcee",
  },
  corrective: {
    laborHours: 6,
    partsCost: 300,
    label: "Intervention corrective",
  },
};

export function getTaskCostReference(type: TacheType) {
  const assumption = TASK_COST_ASSUMPTIONS[type];
  const laborCost = assumption.laborHours * LABOR_RATE_PER_HOUR;
  const totalCost = laborCost + assumption.partsCost;

  return {
    ...assumption,
    laborRate: LABOR_RATE_PER_HOUR,
    laborCost,
    totalCost,
  };
}

export function getTaskBaselineCost(type: TacheType) {
  return getTaskCostReference(type).totalCost;
}

export function getBudgetReferenceCost(type: TacheType, historicalAverage = 0) {
  return Math.max(historicalAverage, getTaskBaselineCost(type));
}
