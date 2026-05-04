import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createGmaoTache,
  deleteGmaoTache,
  listGmaoTaches,
  updateGmaoTache,
  updateGmaoTacheStatut,
  type GmaoTacheCreateInput,
  type GmaoTacheUpdateInput,
  type TacheStatut,
} from "@/lib/runtimeDataRepository";

export type {
  GmaoTache,
  TacheStatut,
  TacheType,
} from "@/lib/runtimeDataRepository";

export function useGmaoTaches(machineId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["gmao_taches", machineId ?? "all"],
    queryFn: () => listGmaoTaches(machineId),
    refetchInterval: 60_000,
  });

  const addTache = useMutation({
    mutationFn: (tache: GmaoTacheCreateInput) => createGmaoTache(tache),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gmao_taches"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const updateTacheStatut = useMutation({
    mutationFn: ({ id, statut }: { id: string; statut: TacheStatut }) =>
      updateGmaoTacheStatut(id, statut),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gmao_taches"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const updateTacheMutation = useMutation({
    mutationFn: (input: GmaoTacheUpdateInput) => updateGmaoTache(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gmao_taches"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const deleteTache = useMutation({
    mutationFn: (id: string) => deleteGmaoTache(id),
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
    updateTache: updateTacheMutation,
    deleteTache,
  };
}
