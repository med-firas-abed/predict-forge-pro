import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export type TacheStatut = "planifiee" | "en_cours" | "terminee";
export type TacheType = "preventive" | "corrective" | "inspection";

export interface GmaoTache {
  id: string;
  machineId: string;
  machineCode: string;
  titre: string;
  description: string;
  statut: TacheStatut;
  technicien: string;
  datePlanifiee: string | null;
  coutEstime: number | null;
  type: TacheType;
  createdAt: string;
}

function mapTache(row: Record<string, unknown>): GmaoTache {
  const machine = row.machines as Record<string, unknown> | null;
  return {
    id: row.id as string,
    machineId: (row.machine_id ?? "") as string,
    machineCode: machine ? (machine.code as string) : "",
    titre: (row.titre ?? "") as string,
    description: (row.description ?? "") as string,
    statut: (row.statut ?? "planifiee") as TacheStatut,
    technicien: (row.technicien ?? "") as string,
    datePlanifiee: (row.date_planifiee as string) || null,
    coutEstime: (row.cout_estime as number) ?? null,
    type: (row.type ?? "preventive") as TacheType,
    createdAt: (row.created_at ?? "") as string,
  };
}

export function useGmaoTaches(machineId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["gmao_taches", machineId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("gmao_taches")
        .select("*, machines(code)")
        .order("created_at", { ascending: false });
      if (machineId) {
        q = q.eq("machine_id", machineId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(mapTache);
    },
    refetchInterval: 60_000,
  });

  const addTache = useMutation({
    mutationFn: async (tache: {
      machine_id: string;
      titre: string;
      description?: string;
      statut?: TacheStatut;
      technicien?: string;
      date_planifiee?: string;
      cout_estime?: number;
      type?: TacheType;
    }) => {
      const { error } = await supabase.from("gmao_taches").insert(tache);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gmao_taches"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const updateTacheStatut = useMutation({
    mutationFn: async ({ id, statut }: { id: string; statut: TacheStatut }) => {
      const { error } = await supabase
        .from("gmao_taches")
        .update({ statut })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gmao_taches"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const updateTache = useMutation({
    mutationFn: async ({ id, ...fields }: {
      id: string;
      technicien?: string;
      date_planifiee?: string;
      statut?: TacheStatut;
      type?: TacheType;
      cout_estime?: number | null;
      description?: string;
    }) => {
      const { error } = await supabase
        .from("gmao_taches")
        .update(fields)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gmao_taches"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const deleteTache = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("gmao_taches")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gmao_taches"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return {
    taches: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    addTache,
    updateTacheStatut,
    updateTache,
    deleteTache,
  };
}
