import { useQuery } from "@tanstack/react-query";

import {
  listAlertEmailHistory,
  type EmailAlertLog,
} from "@/lib/runtimeDataRepository";

export type { EmailAlertLog } from "@/lib/runtimeDataRepository";

export function useAlertEmailHistory(machineId?: string) {
  const query = useQuery({
    queryKey: ["alert-email-history", machineId ?? "all"],
    queryFn: () => listAlertEmailHistory(machineId),
    refetchInterval: 5000,
  });

  return {
    emailHistory: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
