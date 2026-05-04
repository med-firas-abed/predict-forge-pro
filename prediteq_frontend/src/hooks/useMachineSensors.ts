import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

const KW_TO_AMPS = 1000 / (Math.sqrt(3) * 400 * 0.8);

export interface MachineSensorPoint {
  ts?: string;
  rms_mms: number | null;
  power_kw: number | null;
  temp_c: number | null;
  current_a?: number | null;
  tick?: number;
}

export interface DashboardSensorPoint {
  time: string;
  vib: number | null;
  curr: number | null;
  temp: number | null;
}

function toNumberOrNull(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getSensorSpanMinutes(points: MachineSensorPoint[]): number {
  if (points.length < 2) {
    return 0;
  }

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  if (typeof firstPoint?.tick === "number" && typeof lastPoint?.tick === "number") {
    return Math.max(0, Math.round((lastPoint.tick - firstPoint.tick) / 60));
  }

  const firstTs = parseSensorTimestamp(firstPoint?.ts);
  const lastTs = parseSensorTimestamp(lastPoint?.ts);
  if (firstTs !== null && lastTs !== null) {
    return Math.max(0, Math.round((lastTs - firstTs) / 60_000));
  }

  return Math.max(0, points.length - 1);
}

function parseSensorTimestamp(ts?: string): number | null {
  if (!ts) {
    return null;
  }

  const parsed = new Date(ts);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function getRelativeMinutesAgo(point: MachineSensorPoint, index: number, points: MachineSensorPoint[]): number {
  const latestPoint = points[points.length - 1];

  if (typeof point.tick === "number" && typeof latestPoint?.tick === "number") {
    return Math.max(0, Math.round((latestPoint.tick - point.tick) / 60));
  }

  return Math.max(0, points.length - index - 1);
}

function shouldUseWallClock(points: MachineSensorPoint[]): boolean {
  if (points.length < 2) {
    return true;
  }

  const parsedTimes = points
    .map((point) => parseSensorTimestamp(point.ts))
    .filter((value): value is number => value !== null);

  if (parsedTimes.length < 2) {
    return false;
  }

  const wallClockSpanMinutes = Math.max(
    0,
    (parsedTimes[parsedTimes.length - 1] - parsedTimes[0]) / 60_000,
  );

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const simulatedSpanMinutes =
    typeof firstPoint?.tick === "number" && typeof lastPoint?.tick === "number"
      ? Math.max(0, Math.round((lastPoint.tick - firstPoint.tick) / 60))
      : Math.max(0, points.length - 1);

  if (simulatedSpanMinutes <= 1) {
    return true;
  }

  return wallClockSpanMinutes >= Math.max(2, simulatedSpanMinutes * 0.5);
}

function formatSensorTime(
  point: MachineSensorPoint,
  index: number,
  points: MachineSensorPoint[],
  useWallClock: boolean,
): string {
  if (useWallClock) {
    const parsedMs = parseSensorTimestamp(point.ts);
    if (parsedMs !== null) {
      return new Date(parsedMs).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }

  const minutesAgo = getRelativeMinutesAgo(point, index, points);
  return minutesAgo === 0 ? "0m" : `-${minutesAgo}m`;
}

export async function fetchMachineSensorHistory(machineCode: string): Promise<MachineSensorPoint[]> {
  const data = await apiFetch<MachineSensorPoint[]>(
    `/machines/${encodeURIComponent(machineCode)}/sensors`
  );

  return (data ?? []).map((point) => ({
    ...point,
    rms_mms: toNumberOrNull(point.rms_mms),
    power_kw: toNumberOrNull(point.power_kw),
    temp_c: toNumberOrNull(point.temp_c),
    current_a:
      point.current_a != null
        ? toNumberOrNull(point.current_a)
        : point.power_kw != null
          ? Number(point.power_kw) * KW_TO_AMPS
          : null,
  }));
}

export function useMachineSensors(machineCode?: string) {
  const query = useQuery({
    queryKey: ["machine-sensors", machineCode ?? ""],
    queryFn: () => fetchMachineSensorHistory(machineCode ?? ""),
    enabled: Boolean(machineCode),
    refetchInterval: 5_000,
  });

  const points = query.data ?? [];
  const useWallClock = shouldUseWallClock(points);
  const spanMinutes = getSensorSpanMinutes(points);
  const history: DashboardSensorPoint[] = points.map((point, index) => ({
    time: formatSensorTime(point, index, points, useWallClock),
    vib: point.rms_mms != null ? Number(point.rms_mms.toFixed(2)) : null,
    curr: point.current_a != null ? Number(point.current_a.toFixed(2)) : null,
    temp: point.temp_c != null ? Number(point.temp_c.toFixed(1)) : null,
  }));

  const latest = history.length > 0 ? history[history.length - 1] : null;

  return {
    history,
    latest,
    spanMinutes,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
