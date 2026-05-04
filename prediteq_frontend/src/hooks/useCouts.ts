import { useQuery } from "@tanstack/react-query";

import { listCostRows } from "@/lib/runtimeDataRepository";

export type { CostRow } from "@/lib/runtimeDataRepository";

export function useCouts(machineId?: string) {
  const query = useQuery({
    queryKey: ["couts", machineId ?? "all"],
    queryFn: () => listCostRows(machineId),
    refetchInterval: 60_000,
  });

  return {
    couts: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
