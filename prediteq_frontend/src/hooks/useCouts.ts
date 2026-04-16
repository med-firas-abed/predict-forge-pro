import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface CostRow {
  id: string;
  machineCode: string;
  mois: number;
  annee: number;
  mainOeuvre: number;
  pieces: number;
  total: number;
}

function mapCost(row: Record<string, unknown>): CostRow {
  const machine = row.machines as Record<string, unknown> | null;
  return {
    id: row.id as string,
    machineCode: machine ? (machine.code as string) : "",
    mois: (row.mois ?? 1) as number,
    annee: (row.annee ?? 2026) as number,
    mainOeuvre: (row.main_oeuvre ?? 0) as number,
    pieces: (row.pieces ?? 0) as number,
    total: (row.total ?? 0) as number,
  };
}

export function useCouts(machineId?: string) {
  const query = useQuery({
    queryKey: ["couts", machineId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("couts")
        .select("*, machines(code)")
        .order("annee", { ascending: true })
        .order("mois", { ascending: true });
      if (machineId) {
        q = q.eq("machine_id", machineId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(mapCost);
    },
  });

  return {
    couts: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
