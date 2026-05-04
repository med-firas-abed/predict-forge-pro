import { useQuery } from "@tanstack/react-query";

import {
  listHistoriqueHIPoints,
} from "@/lib/runtimeDataRepository";

export type { HistoriqueHIPoint } from "@/lib/runtimeDataRepository";

export function useHistoriqueHI(machineId: string, days = 90) {
  const query = useQuery({
    queryKey: ["historique_hi", machineId, days],
    queryFn: () => listHistoriqueHIPoints(machineId, days),
    enabled: !!machineId,
    refetchInterval: 60_000,
  });

  return {
    historiqueHI: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
