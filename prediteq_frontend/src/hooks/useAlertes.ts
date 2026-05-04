import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  acknowledgeAlerte,
  listAlertes,
  subscribeToAlertes,
} from "@/lib/runtimeDataRepository";

export type { Alerte } from "@/lib/runtimeDataRepository";

export function useAlertes(machineId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["alertes", machineId ?? "all"],
    queryFn: () => listAlertes(machineId),
  });

  useEffect(() => {
    return subscribeToAlertes(machineId, {
      onInsert: (event) => {
        if (event.severite === "urgence") {
          toast.error(event.titre, { description: event.description, duration: 8000 });
        } else if (event.severite === "surveillance") {
          toast.warning(event.titre, { description: event.description, duration: 6000 });
        } else {
          toast.info(event.titre, { description: event.description });
        }
      },
      onChange: () => {
        queryClient.invalidateQueries({ queryKey: ["alertes"] });
      },
    });
  }, [machineId, queryClient]);

  const acquitterAlerte = useMutation({
    mutationFn: (id: string) => acknowledgeAlerte(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alertes"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const acquitterAlertes = useMutation({
    mutationFn: async (ids: string[]) => {
      const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
      for (const id of uniqueIds) {
        await acknowledgeAlerte(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alertes"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return {
    alertes: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    acquitterAlerte,
    acquitterAlertes,
  };
}
