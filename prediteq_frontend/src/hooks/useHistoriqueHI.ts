import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface HistoriqueHIPoint {
  id: string;
  machineId: string;
  hi: number;
  createdAt: string;
}

export function useHistoriqueHI(machineId: string, days = 90) {
  const query = useQuery({
    queryKey: ["historique_hi", machineId, days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 86_400_000);

      const { data, error } = await supabase
        .from("historique_hi")
        .select("*")
        .eq("machine_id", machineId)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(
        (row: Record<string, unknown>): HistoriqueHIPoint => ({
          id: row.id as string,
          machineId: (row.machine_id ?? "") as string,
          hi: (row.valeur_hi ?? row.hi ?? 0) as number,
          createdAt: (row.created_at ?? "") as string,
        })
      );
    },
    enabled: !!machineId,
    refetchInterval: 60_000,  // auto-refresh every 60s
  });

  return {
    historiqueHI: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
