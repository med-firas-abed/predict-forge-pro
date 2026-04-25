import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import { Machine } from "@/data/machines";
import { toast } from "sonner";

const STATUT_MAP: Record<string, Machine["status"]> = {
  operational: "ok",
  degraded: "degraded",
  critical: "critical",
  maintenance: "maintenance",
};

const REVERSE_STATUT: Record<string, string> = {
  ok: "operational",
  degraded: "degraded",
  critical: "critical",
  maintenance: "maintenance",
};

// Motor: SITI FC100L1-4 — 3-phase 400V, cosφ=0.80
// I = P(kW)×1000 / (√3 × 400 × 0.80) ≈ P × 1.8042
const KW_TO_AMPS = 1000 / (Math.sqrt(3) * 400 * 0.80);

function supabaseRowToMachine(row: Record<string, unknown>): Machine {
  const code = (row.code ?? "") as string;
  const statut = (row.statut ?? "operational") as string;
  const sensors = row.last_sensors as Record<string, number> | undefined;
  const powerKw = sensors?.power_kw ?? 0;
  return {
    id: code,
    uuid: (row.id ?? "") as string,
    name: (row.nom ?? code) as string,
    loc: `Région ${(row.region ?? "") as string}`,
    city: (row.region ?? "") as string,
    lat: (row.latitude ?? 0) as number,
    lon: (row.longitude ?? 0) as number,
    hi: (row.hi_courant ?? 0.5) as number,
    rul: (row.rul_courant ?? null) as number | null,
    rulci: null,
    status: STATUT_MAP[statut] || "ok",
    vib: sensors?.rms_mms ?? 0,
    curr: Math.round(powerKw * KW_TO_AMPS * 100) / 100,
    temp: sensors?.temp_c ?? 0,
    anom: (row.anom_count ?? 0) as number,
    cycles: (row.cycles_today ?? 0) as number,
    model: "SITI FC100L1-4",
    floors: 19,
    last: row.derniere_maj
      ? new Date(row.derniere_maj as string).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : "",
  };
}

async function fetchMachines(machineId?: string): Promise<Machine[]> {
  // Try API first (returns live sensor data from engine)
  try {
    const data = await apiFetch<Record<string, unknown>[]>("/machines");
    let machines = (data ?? []).map(supabaseRowToMachine);
    if (machineId) {
      machines = machines.filter(m => m.uuid === machineId);
    }
    return machines;
  } catch (err) {
    console.warn('[useMachines] API fetch failed, falling back to Supabase:', err);
    // Fallback to direct Supabase query (no live sensors)
    let query = supabase.from("machines").select("*").order("code");
    if (machineId) {
      query = query.eq("id", machineId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(supabaseRowToMachine);
  }
}

export function useMachines(machineId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["machines", machineId ?? "all"],
    queryFn: () => fetchMachines(machineId),
    refetchInterval: 30_000,  // auto-refresh every 30s
  });

  // Realtime subscription
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      const channelName = `machines-changes-${machineId ?? "all"}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "machines" },
          () => {
            queryClient.invalidateQueries({ queryKey: ["machines"] });
          }
        )
        .subscribe();
    } catch (e) {
      console.warn("[useMachines] realtime subscribe failed:", e);
    }

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [queryClient, machineId]);

  const addMachine = useMutation({
    mutationFn: async (m: Partial<Machine>) => {
      const { error } = await supabase.from("machines").insert({
        code: m.id,
        nom: m.name,
        region: m.city,
        latitude: m.lat,
        longitude: m.lon,
        statut: REVERSE_STATUT[m.status ?? "ok"] ?? "operational",
        hi_courant: m.hi ?? 0.5,
        rul_courant: m.rul,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["machines"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const updateMachine = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Machine> }) => {
      const payload: Record<string, unknown> = {};
      if (updates.name !== undefined) payload.nom = updates.name;
      if (updates.city !== undefined) payload.region = updates.city;
      if (updates.lat !== undefined) payload.latitude = updates.lat;
      if (updates.lon !== undefined) payload.longitude = updates.lon;
      if (updates.hi !== undefined) payload.hi_courant = updates.hi;
      if (updates.rul !== undefined) payload.rul_courant = updates.rul;
      if (updates.status !== undefined)
        payload.statut = REVERSE_STATUT[updates.status] ?? "operational";
      const { error } = await supabase
        .from("machines")
        .update(payload)
        .eq("code", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["machines"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const deleteMachine = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("machines").delete().eq("code", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["machines"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return {
    machines: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    addMachine,
    updateMachine,
    deleteMachine,
  };
}
