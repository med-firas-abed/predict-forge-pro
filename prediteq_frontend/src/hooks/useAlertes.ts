import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export interface Alerte {
  id: string;
  machineId: string;
  machineCode: string;
  titre: string;
  description: string;
  severite: "urgence" | "surveillance" | "info";
  acquitte: boolean;
  createdAt: string;
}

function mapAlerte(row: Record<string, unknown>): Alerte {
  const machine = row.machines as Record<string, unknown> | null;
  return {
    id: row.id as string,
    machineId: (row.machine_id ?? "") as string,
    machineCode: machine ? (machine.code as string) : "",
    titre: (row.titre ?? "") as string,
    description: (row.description ?? "") as string,
    severite: (row.severite ?? "info") as Alerte["severite"],
    acquitte: (row.acquitte ?? false) as boolean,
    createdAt: (row.created_at ?? "") as string,
  };
}

export function useAlertes(machineId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["alertes", machineId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("alertes")
        .select("*, machines(code)")
        .order("created_at", { ascending: false });
      if (machineId) {
        q = q.eq("machine_id", machineId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(mapAlerte);
    },
  });

  // Realtime subscription — notify on new alerts
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      const channelName = `alertes-changes-${machineId ?? "all"}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const filter = machineId
        ? { event: "INSERT" as const, schema: "public", table: "alertes", filter: `machine_id=eq.${machineId}` }
        : { event: "INSERT" as const, schema: "public", table: "alertes" };
      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          filter,
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            const sev = (row.severite ?? "info") as string;
            const titre = (row.titre ?? "Nouvelle alerte") as string;
            const desc = (row.description ?? "") as string;

            if (sev === "urgence") {
              toast.error(`🚨 ${titre}`, { description: desc, duration: 8000 });
            } else if (sev === "surveillance") {
              toast.warning(`⚠️ ${titre}`, { description: desc, duration: 6000 });
            } else {
              toast.info(titre, { description: desc });
            }
            queryClient.invalidateQueries({ queryKey: ["alertes"] });
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "alertes" },
          () => {
            queryClient.invalidateQueries({ queryKey: ["alertes"] });
          }
        )
        .subscribe();
    } catch (e) {
      console.warn("[useAlertes] realtime subscribe failed:", e);
    }

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [queryClient, machineId]);

  const acquitterAlerte = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("alertes")
        .update({ acquitte: true })
        .eq("id", id);
      if (error) throw error;
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
  };
}
