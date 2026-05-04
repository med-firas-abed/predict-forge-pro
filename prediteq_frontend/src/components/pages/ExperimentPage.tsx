import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, CircleDot, Clock, Cpu, Thermometer, Zap } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { KpiCard } from "@/components/industrial/KpiCard";
import { SVGGauge } from "@/components/industrial/SVGGauge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/AppContext";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface MachineState {
  hi_smooth?: number;
  zone?: string;
  rul_days?: number;
}

interface BenchSensors {
  rms_mms?: number;
  vibration_rms?: number;
  vibration_raw?: number;
  current_a?: number;
  temp_c?: number;
  humidity_rh?: number;
  status?: string;
  timestamp_ms?: number;
  calib_count?: number;
  calib_total?: number;
  baseline_vib?: number;
  baseline_current?: number;
  thresh_vib?: number;
  thresh_current?: number;
}

interface MachineRecord {
  code: string;
  hi_courant?: number | null;
  statut?: string | null;
  rul_courant?: number | null;
  last_sensors?: BenchSensors;
}

interface SensorPoint {
  time: string;
  value: number;
}

interface EventEntry {
  id: number;
  time: string;
  title: string;
  detail: string;
  tone: "info" | "success" | "warning" | "danger";
}

interface StatusSnapshot {
  calibrating: boolean;
  vibrationAbove: boolean;
  currentAbove: boolean;
}

interface BrowserSerialPort {
  readable: ReadableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
}

interface BrowserSerial {
  requestPort(): Promise<BrowserSerialPort>;
}

const MACHINE_CODE = "ASC-A1";
const MAX_POINTS = 30;
const MAX_EVENTS = 40;
const VIBRATION_UNIT = "m/s2";
const CURRENT_UNIT = "A";

function pushPoint(prev: SensorPoint[], value: number, digits: number, time: string) {
  return [...prev, { time, value: Number(value.toFixed(digits)) }].slice(-MAX_POINTS);
}

function formatClock(date = new Date()) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function resolveGaugeMax(
  value: number | null | undefined,
  baseline: number | null | undefined,
  threshold: number | null | undefined,
  minimum: number,
  padding = 1.8,
) {
  const highest = Math.max(value ?? 0, baseline ?? 0, threshold ?? 0, minimum);
  const digits = highest < 10 ? 2 : 1;
  return Number((highest * padding).toFixed(digits));
}

export function ExperimentPage() {
  const { lang } = useApp();
  const l = useCallback(
    (fr: string, en: string, ar: string) => lang === "fr" ? fr : lang === "en" ? en : ar,
    [lang],
  );
  const serialApi = typeof navigator !== "undefined"
    ? (navigator as Navigator & { serial?: BrowserSerial }).serial
    : undefined;

  const [machineState, setMachineState] = useState<MachineState | null>(null);
  const [apiConnected, setApiConnected] = useState(false);
  const [apiSensors, setApiSensors] = useState<BenchSensors | null>(null);

  const [serialConnected, setSerialConnected] = useState(false);
  const [serialError, setSerialError] = useState<string | null>(null);
  const [serialNote, setSerialNote] = useState<string | null>(null);
  const [serialSensors, setSerialSensors] = useState<BenchSensors | null>(null);
  const [sampleCount, setSampleCount] = useState(0);
  const [lastPacketTime, setLastPacketTime] = useState<string | null>(null);
  const [lastSerialTimestamp, setLastSerialTimestamp] = useState<number | null>(null);

  const [vibrationHistory, setVibrationHistory] = useState<SensorPoint[]>([]);
  const [currentHistory, setCurrentHistory] = useState<SensorPoint[]>([]);
  const [temperatureHistory, setTemperatureHistory] = useState<SensorPoint[]>([]);
  const [baselines, setBaselines] = useState<{ vibration: number | null; current: number | null }>({
    vibration: null,
    current: null,
  });
  const [eventLog, setEventLog] = useState<EventEntry[]>([]);

  const portRef = useRef<BrowserSerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const bufferRef = useRef("");
  const disconnectingRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const calibrationRef = useRef<{ vibration: number[]; current: number[] }>({ vibration: [], current: [] });
  const eventIdRef = useRef(0);
  const statusSnapshotRef = useRef<StatusSnapshot | null>(null);

  const activeSensors = serialSensors ?? apiSensors;
  const vibrationRms = activeSensors?.vibration_rms ?? activeSensors?.rms_mms ?? null;
  const vibrationRaw = activeSensors?.vibration_raw ?? null;
  const currentA = activeSensors?.current_a ?? null;
  const temperatureC = activeSensors?.temp_c ?? null;
  const firmwareStatus = activeSensors?.status ?? null;
  const isCalibrating = firmwareStatus?.includes("CALIBRATING") ?? false;
  const vibrationThreshold = activeSensors?.thresh_vib ?? null;
  const currentThreshold = activeSensors?.thresh_current ?? null;
  const calibrationCount = activeSensors?.calib_count ?? null;
  const calibrationTotal = activeSensors?.calib_total ?? null;
  const calibrationProgressLabel = calibrationCount !== null && calibrationTotal !== null
    ? `${Math.min(calibrationCount, calibrationTotal)} / ${calibrationTotal}`
    : null;
  const vibrationAboveThreshold = vibrationRms !== null && vibrationThreshold !== null && vibrationRms > vibrationThreshold;
  const currentAboveThreshold = currentA !== null && currentThreshold !== null && currentA > currentThreshold;

  useEffect(() => {
    let cancelled = false;

    const fetchMachine = async () => {
      try {
        const machines = await apiFetch<MachineRecord[]>("/machines");
        if (cancelled) return;

        const machine = machines.find((x) => x.code === MACHINE_CODE) || machines[0];
        if (!machine) {
          setApiConnected(false);
          return;
        }

        setMachineState({
          hi_smooth: machine.hi_courant ?? undefined,
          zone: machine.statut ?? undefined,
          rul_days: machine.rul_courant ?? undefined,
        });
        setApiSensors(machine.last_sensors ?? null);
        setApiConnected(Boolean(machine.last_sensors));
      } catch {
        if (!cancelled) setApiConnected(false);
      }
    };

    void fetchMachine();
    pollRef.current = setInterval(() => {
      void fetchMachine();
    }, 4000);

    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      void disconnectSerial();
    };
  }, []);

  function zoneColor(zone?: string) {
    if (!zone) return "bg-muted text-muted-foreground";
    const z = zone.toLowerCase();
    if (z.includes("crit")) return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30";
    if (z.includes("surv") || z.includes("degr")) return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
    return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
  }

  function hiColor(hi?: number) {
    if (hi === undefined) return "#888";
    if (hi >= 0.8) return "#10b981";
    if (hi >= 0.6) return "#f59e0b";
    if (hi >= 0.3) return "#f97316";
    return "#ef4444";
  }

  function formatValue(value: number | null | undefined, digits: number) {
    return value !== null && value !== undefined ? value.toFixed(digits) : "—";
  }

  const formatMetricComparison = useCallback((
    metric: "vibration_rms" | "current_a",
    value: number | null | undefined,
    threshold: number | null | undefined,
    unit: string,
    digits: number,
  ) => {
    if (value === null || value === undefined) return `${metric} (—)`;
    const renderedValue = `${value.toFixed(digits)} ${unit}`;
    if (threshold === null || threshold === undefined) {
      return `${metric} (${renderedValue})`;
    }

    return `${metric} (${renderedValue}) ${value > threshold ? ">" : "<="} ${l("seuil", "threshold", "العتبة")} (${threshold.toFixed(digits)} ${unit})`;
  }, [l]);

  function appendEvent(title: string, detail: string, tone: EventEntry["tone"]) {
    const entry: EventEntry = {
      id: ++eventIdRef.current,
      time: formatClock(),
      title,
      detail,
      tone,
    };

    setEventLog((prev) => [...prev, entry].slice(-MAX_EVENTS));
  }

  function statusBadgeClasses(state: "idle" | "normal" | "anomaly" | "calibrating") {
    switch (state) {
      case "normal":
        return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
      case "anomaly":
        return "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 animate-pulse";
      case "calibrating":
        return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 animate-status-blink";
      default:
        return "border-border bg-muted text-muted-foreground";
    }
  }

  function ledClasses(state: "idle" | "normal" | "anomaly" | "calibrating") {
    switch (state) {
      case "normal":
        return "bg-emerald-500";
      case "anomaly":
        return "bg-red-500 animate-pulse";
      case "calibrating":
        return "bg-amber-500 animate-status-blink";
      default:
        return "bg-muted-foreground/40";
    }
  }

  function eventToneClasses(tone: EventEntry["tone"]) {
    switch (tone) {
      case "success":
        return "border-emerald-500/20 bg-emerald-500/5";
      case "warning":
        return "border-amber-500/20 bg-amber-500/5";
      case "danger":
        return "border-red-500/20 bg-red-500/5";
      default:
        return "border-primary/20 bg-primary/5";
    }
  }

  const baselineSummary = [
    baselines.vibration !== null ? `${l("Baseline vibration", "Vibration baseline", "خط أساس الاهتزاز")}: ${baselines.vibration.toFixed(2)} ${VIBRATION_UNIT}` : null,
    baselines.current !== null ? `${l("Baseline courant", "Current baseline", "خط أساس التيار")}: ${baselines.current.toFixed(3)} ${CURRENT_UNIT}` : null,
  ].filter(Boolean).join(" • ");

  const calibrationSummary = [
    calibrationProgressLabel ? `${l("Calibration", "Calibration", "المعايرة")} ${calibrationProgressLabel}` : null,
    baselineSummary || null,
  ].filter(Boolean).join(" • ");

  const normalReasons = [
    vibrationRms !== null && vibrationThreshold !== null ? formatMetricComparison("vibration_rms", vibrationRms, vibrationThreshold, VIBRATION_UNIT, 2) : null,
    currentA !== null && currentThreshold !== null ? formatMetricComparison("current_a", currentA, currentThreshold, CURRENT_UNIT, 3) : null,
  ].filter(Boolean) as string[];

  const anomalyReasons = [
    vibrationAboveThreshold ? formatMetricComparison("vibration_rms", vibrationRms, vibrationThreshold, VIBRATION_UNIT, 2) : null,
    currentAboveThreshold ? formatMetricComparison("current_a", currentA, currentThreshold, CURRENT_UNIT, 3) : null,
  ].filter(Boolean) as string[];

  const vibrationGaugeMax = resolveGaugeMax(vibrationRms, baselines.vibration, vibrationThreshold, 2);
  const currentGaugeMax = resolveGaugeMax(currentA, baselines.current, currentThreshold, 2, 1.6);

  const explainedStatus = isCalibrating
    ? {
        badge: l("CALIBRATION", "CALIBRATION", "معايرة"),
        label: l("Calibration en cours", "Calibration in progress", "المعايرة جارية"),
        detail: calibrationSummary || l(
          "Calibration en cours pour établir la baseline vibration et courant.",
          "Calibration is running to establish the vibration and current baselines.",
          "المعايرة جارية لتحديد خط أساس الاهتزاز والتيار."
        ),
        led: "calibrating" as const,
        variant: "warn" as const,
        }
    : anomalyReasons.length > 0 || firmwareStatus?.includes("ANOMALY")
      ? {
          badge: l("ANOMALIE", "ANOMALY", "شذوذ"),
          label: l("Anomalie détectée", "Anomaly detected", "تم اكتشاف شذوذ"),
          detail: anomalyReasons.join(l(" et ", " and ", " و ")) || (firmwareStatus ?? l("Dépassement détecté", "Threshold exceeded", "تم تجاوز العتبة")),
          led: "anomaly" as const,
          variant: "danger" as const,
        }
      : firmwareStatus || vibrationRms !== null || currentA !== null
        ? {
            badge: l("NORMAL", "NORMAL", "طبيعي"),
            label: l("Fonctionnement normal", "Normal operation", "تشغيل طبيعي"),
          detail: normalReasons.join(l(" et ", " and ", " و ")) || l(
              "Toutes les mesures restent sous les seuils configurés.",
              "All measurements remain below the configured thresholds.",
              "كل القياسات تبقى تحت العتبات المضبوطة."
            ),
            led: "normal" as const,
            variant: "green" as const,
          }
        : {
            badge: l("EN ATTENTE", "WAITING", "في الانتظار"),
            label: l("En attente de données", "Waiting for data", "في انتظار البيانات"),
            detail: l(
              "Connectez l'ESP32 pour démarrer la calibration et le suivi des seuils.",
              "Connect the ESP32 to start calibration and threshold tracking.",
              "قم بتوصيل ESP32 لبدء المعايرة وتتبع العتبات."
            ),
            led: "idle" as const,
            variant: "warn" as const,
          };

  useEffect(() => {
    if (firmwareStatus === null && vibrationRms === null && currentA === null) return;

    const nextSnapshot: StatusSnapshot = {
      calibrating: explainedStatus.led === "calibrating",
      vibrationAbove: vibrationAboveThreshold,
      currentAbove: currentAboveThreshold,
    };

    const prevSnapshot = statusSnapshotRef.current;
    if (!prevSnapshot) {
      statusSnapshotRef.current = nextSnapshot;
      return;
    }

    if (!prevSnapshot.calibrating && nextSnapshot.calibrating) {
      appendEvent(
        l("Calibration démarrée", "Calibration started", "بدأت المعايرة"),
        l(
          "Collecte des valeurs de référence vibration/courant.",
          "Collecting vibration/current reference values.",
          "يتم جمع قيم الاهتزاز/التيار المرجعية."
        ),
        "warning"
      );
    }

    if (prevSnapshot.calibrating && !nextSnapshot.calibrating) {
      appendEvent(
        l("Calibration terminée", "Calibration completed", "اكتملت المعايرة"),
        baselineSummary || l(
          "Baseline enregistrée pour vibration et courant.",
          "Baseline captured for vibration and current.",
          "تم حفظ خط الأساس للاهتزاز والتيار."
        ),
        "success"
      );
    }

    if (!nextSnapshot.calibrating) {
      if (!prevSnapshot.vibrationAbove && nextSnapshot.vibrationAbove) {
        appendEvent(
          l("Seuil franchi", "Threshold crossed", "تم تجاوز العتبة"),
          formatMetricComparison("vibration_rms", vibrationRms, vibrationThreshold, VIBRATION_UNIT, 2),
          "danger"
        );
      }

      if (!prevSnapshot.currentAbove && nextSnapshot.currentAbove) {
        appendEvent(
          l("Seuil franchi", "Threshold crossed", "تم تجاوز العتبة"),
          formatMetricComparison("current_a", currentA, currentThreshold, CURRENT_UNIT, 3),
          "danger"
        );
      }

      if ((prevSnapshot.vibrationAbove || prevSnapshot.currentAbove) && !nextSnapshot.vibrationAbove && !nextSnapshot.currentAbove) {
        appendEvent(
          l("Retour à la normale", "Returned to normal", "العودة إلى الوضع الطبيعي"),
          explainedStatus.detail,
          "success"
        );
      }
    }

    statusSnapshotRef.current = nextSnapshot;
  }, [
    baselineSummary,
    currentA,
    currentAboveThreshold,
    currentThreshold,
    explainedStatus.detail,
    explainedStatus.led,
    firmwareStatus,
    formatMetricComparison,
    l,
    vibrationAboveThreshold,
    vibrationRms,
    vibrationThreshold,
  ]);

  function resetSerialSeries() {
    setSerialSensors(null);
    setSampleCount(0);
    setLastPacketTime(null);
    setLastSerialTimestamp(null);
    setSerialNote(null);
    setVibrationHistory([]);
    setCurrentHistory([]);
    setTemperatureHistory([]);
      setBaselines({ vibration: null, current: null });
      setEventLog([]);
      calibrationRef.current = { vibration: [], current: [] };
    eventIdRef.current = 0;
    statusSnapshotRef.current = { calibrating: false, vibrationAbove: false, currentAbove: false };
  }

  function applySerialFrame(frame: BenchSensors) {
    const stamp = frame.timestamp_ms ?? Date.now();
    const time = formatClock();

    setSerialSensors(frame);
    setSampleCount((count) => count + 1);
    setLastPacketTime(time);
    setLastSerialTimestamp(stamp);

    if (frame.baseline_vib !== undefined || frame.baseline_current !== undefined) {
      setBaselines((prev) => ({
        vibration: frame.baseline_vib ?? prev.vibration,
        current: frame.baseline_current ?? prev.current,
      }));
    } else if (frame.status?.includes("CALIBRATING")) {
      if (frame.vibration_rms !== undefined) calibrationRef.current.vibration.push(frame.vibration_rms);
      if (frame.current_a !== undefined) calibrationRef.current.current.push(frame.current_a);

      setBaselines({
        vibration: average(calibrationRef.current.vibration),
        current: average(calibrationRef.current.current),
      });
    } else {
      setBaselines((prev) => ({
        vibration: prev.vibration ?? (frame.vibration_rms ?? null),
        current: prev.current ?? (frame.current_a ?? null),
      }));
    }

    if (frame.vibration_rms !== undefined) {
      setVibrationHistory((prev) => pushPoint(prev, frame.vibration_rms as number, 2, time));
    }
    if (frame.current_a !== undefined) {
      setCurrentHistory((prev) => pushPoint(prev, frame.current_a as number, 3, time));
    }
    if (frame.temp_c !== undefined) {
      setTemperatureHistory((prev) => pushPoint(prev, frame.temp_c as number, 1, time));
    }
  }

  function parseSerialLine(rawLine: string) {
    const line = rawLine.trim();
    if (!line) return;

    if (line.startsWith("#")) {
      setSerialNote(line.slice(1).trim());
      return;
    }

    if (line.toLowerCase().startsWith("timestamp_ms")) {
      return;
    }

    const parts = line.split(",");
    if (parts.length < 6) return;

    const timestampMs = Number.parseInt(parts[0], 10);
    const current = Number.parseFloat(parts[1]);
    const vibrationRawValue = Number.parseFloat(parts[2]);
    const vibrationRmsValue = Number.parseFloat(parts[3]);
    const temp = Number.parseFloat(parts[4]);

    if (![current, vibrationRawValue, vibrationRmsValue, temp].every(Number.isFinite)) {
      return;
    }

    if (parts.length >= 12) {
      const status = parts[5].trim();
      const calibCount = Number.parseInt(parts[6], 10);
      const calibTotal = Number.parseInt(parts[7], 10);
      const baselineVib = Number.parseFloat(parts[8]);
      const baselineCurrent = Number.parseFloat(parts[9]);
      const threshVib = Number.parseFloat(parts[10]);
      const threshCurrent = Number.parseFloat(parts[11]);

      applySerialFrame({
        timestamp_ms: Number.isFinite(timestampMs) ? timestampMs : undefined,
        current_a: current,
        vibration_raw: vibrationRawValue,
        vibration_rms: vibrationRmsValue,
        temp_c: temp,
        status,
        calib_count: Number.isFinite(calibCount) ? calibCount : undefined,
        calib_total: Number.isFinite(calibTotal) ? calibTotal : undefined,
        baseline_vib: Number.isFinite(baselineVib) ? baselineVib : undefined,
        baseline_current: Number.isFinite(baselineCurrent) ? baselineCurrent : undefined,
        thresh_vib: Number.isFinite(threshVib) ? threshVib : undefined,
        thresh_current: Number.isFinite(threshCurrent) ? threshCurrent : undefined,
      });
      return;
    }

    const status = parts.slice(5).join(",").trim();

    applySerialFrame({
      timestamp_ms: Number.isFinite(timestampMs) ? timestampMs : undefined,
      current_a: current,
      vibration_raw: vibrationRawValue,
      vibration_rms: vibrationRmsValue,
      temp_c: temp,
      status,
    });
  }

  async function disconnectSerial() {
    disconnectingRef.current = true;

    const reader = readerRef.current;
    readerRef.current = null;
    if (reader) {
      try {
        await reader.cancel();
      } catch {
        // Ignore cancellation failures during teardown.
      }
      try {
        reader.releaseLock();
      } catch {
        // Ignore lock-release failures during teardown.
      }
    }

    const port = portRef.current;
    portRef.current = null;
    if (port) {
      try {
        await port.close();
      } catch {
        // Ignore close failures; the port may already be closed.
      }
    }

    setSerialConnected(false);
    disconnectingRef.current = false;
  }

  async function readSerialLoop(port: BrowserSerialPort) {
    const reader = port.readable?.getReader();
    if (!reader) {
      setSerialError(l("Port série non lisible.", "Serial port is not readable.", "المنفذ التسلسلي غير قابل للقراءة."));
      setSerialConnected(false);
      return;
    }

    readerRef.current = reader;
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        bufferRef.current += decoder.decode(value, { stream: true });
        const lines = bufferRef.current.split(/\r?\n/);
        bufferRef.current = lines.pop() ?? "";

        for (const line of lines) {
          parseSerialLine(line);
        }
      }
    } catch (error) {
      if (!disconnectingRef.current) {
        setSerialError(error instanceof Error ? error.message : l("Lecture série interrompue.", "Serial read interrupted.", "تم قطع القراءة التسلسلية."));
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // Ignore release failure.
      }
      if (readerRef.current === reader) {
        readerRef.current = null;
      }

      if (!disconnectingRef.current) {
        try {
          await port.close();
        } catch {
          // Ignore close failure.
        }
        portRef.current = null;
        setSerialConnected(false);
      }
    }
  }

  async function connectSerial() {
    if (!serialApi) {
      setSerialError(l(
        "Le navigateur ne supporte pas Web Serial. Utilisez Chrome ou Edge sur localhost.",
        "This browser does not support Web Serial. Use Chrome or Edge on localhost.",
        "هذا المتصفح لا يدعم Web Serial. استخدم Chrome أو Edge على localhost."
      ));
      return;
    }

    setSerialError(null);
    bufferRef.current = "";
    resetSerialSeries();

    try {
      const port = await serialApi.requestPort();
      await port.open({ baudRate: 115200 });
      portRef.current = port;
      setSerialConnected(true);
      void readSerialLoop(port);
    } catch (error) {
      setSerialConnected(false);
      setSerialError(error instanceof Error ? error.message : l("Connexion série annulée.", "Serial connection cancelled.", "تم إلغاء الاتصال التسلسلي."));
    }
  }

  const liveSourceLabel = serialConnected
    ? l("USB série", "USB serial", "USB تسلسلي")
    : serialSensors
      ? l("Dernière trame USB", "Last USB frame", "آخر إطار USB")
      : apiConnected
        ? l("API / MQTT", "API / MQTT", "API / MQTT")
        : l("Aucune source", "No source", "لا يوجد مصدر");

  const liveSourceSub = serialConnected
    ? l("Flux direct depuis le port série USB", "Direct feed from the USB serial port", "تغذية مباشرة من منفذ USB التسلسلي")
    : serialSensors
      ? l("Dernière mesure conservée après déconnexion USB", "Last measurement kept after the USB disconnect", "تم الاحتفاظ بآخر قياس بعد فصل USB")
      : l("Bascule automatique vers l'API si aucun flux USB", "Falls back to API when no USB feed is active", "تبديل تلقائي إلى API عند غياب تدفق USB");

  const sampleCountSub = isCalibrating && calibrationProgressLabel
    ? `${l("Calibration", "Calibration", "المعايرة")}: ${calibrationProgressLabel}`
    : l("Compteur de lignes CSV valides lues sur USB", "Count of valid CSV lines read over USB", "عدد أسطر CSV الصحيحة المقروءة عبر USB");

  const sensorCards = [
    {
      key: "vibration",
      label: l("Vibration RMS", "Vibration RMS", "اهتزاز RMS"),
      value: vibrationRms,
      digits: 2,
      max: vibrationGaugeMax,
      unit: VIBRATION_UNIT,
      color: "#4b8b9b",
      icon: <Activity className="w-4 h-4" />,
      history: vibrationHistory,
      threshold: !isCalibrating ? vibrationThreshold ?? undefined : undefined,
      thresholdLabel: l("Seuil vibration", "Vibration threshold", "عتبة الاهتزاز"),
      baseline: baselines.vibration,
      baselineLabel: l("Baseline vibration", "Vibration baseline", "خط أساس الاهتزاز"),
      waiting: l("Connectez l'ESP32 pour alimenter ce graphe en direct.", "Connect the ESP32 to drive this chart live.", "قم بتوصيل ESP32 لتغذية هذا الرسم مباشرة.")
    },
    {
      key: "current",
      label: l("Courant moteur", "Motor current", "تيار المحرك"),
      value: currentA,
      digits: 3,
      max: currentGaugeMax,
      unit: CURRENT_UNIT,
      color: "#d4915a",
      icon: <Zap className="w-4 h-4" />,
      history: currentHistory,
      threshold: !isCalibrating ? currentThreshold ?? undefined : undefined,
      thresholdLabel: l("Seuil courant", "Current threshold", "عتبة التيار"),
      baseline: baselines.current,
      baselineLabel: l("Baseline courant", "Current baseline", "خط أساس التيار"),
      waiting: l("Le courant du capteur de courant apparaîtra ici dès réception série.", "Current-sensor reading will appear here once serial data arrives.", "ستظهر قراءة مستشعر التيار هنا عند وصول البيانات التسلسلية.")
    },
    {
      key: "temperature",
      label: l("Température", "Temperature", "الحرارة"),
      value: temperatureC,
      digits: 1,
      max: 100,
      unit: "°C",
      color: "#c75c5c",
      icon: <Thermometer className="w-4 h-4" />,
      history: temperatureHistory,
      waiting: l("La température du capteur sera tracée ici en direct.", "Temperature-sensor reading will be plotted here live.", "ستُرسم قراءة مستشعر الحرارة هنا مباشرة.")
    },
  ];

  const primaryCharts = [
    {
      key: "vibration-main",
      title: l("Courbe vibration", "Vibration chart", "منحنى الاهتزاز"),
      label: l("Vibration RMS", "Vibration RMS", "اهتزاز RMS"),
      value: vibrationRms,
      digits: 2,
      max: vibrationGaugeMax,
      unit: VIBRATION_UNIT,
      color: "#4b8b9b",
      history: vibrationHistory,
      baseline: baselines.vibration,
      baselineLabel: l("Baseline vibration", "Vibration baseline", "خط أساس الاهتزاز"),
      threshold: !isCalibrating ? vibrationThreshold ?? undefined : undefined,
      thresholdLabel: l("Seuil vibration", "Vibration threshold", "عتبة الاهتزاز"),
      state: isCalibrating ? "calibrating" as const : vibrationAboveThreshold ? "anomaly" as const : "normal" as const,
      stateLabel: isCalibrating
        ? l("Calibration", "Calibration", "معايرة")
        : vibrationAboveThreshold
          ? l("Seuil dépassé", "Threshold exceeded", "تم تجاوز العتبة")
          : l("Sous seuil", "Below threshold", "تحت العتبة"),
      detail: isCalibrating
        ? calibrationSummary || l("Construction de la baseline vibration.", "Building the vibration baseline.", "يتم بناء خط أساس الاهتزاز.")
        : formatMetricComparison("vibration_rms", vibrationRms, vibrationThreshold, VIBRATION_UNIT, 2),
      waiting: l("La courbe vibration apparaîtra après les premières trames série.", "The vibration chart will appear after the first serial frames.", "سيظهر منحنى الاهتزاز بعد أولى الإطارات التسلسلية."),
    },
    {
      key: "current-main",
      title: l("Courbe courant", "Current chart", "منحنى التيار"),
      label: l("Courant moteur", "Motor current", "تيار المحرك"),
      value: currentA,
      digits: 3,
      max: currentGaugeMax,
      unit: CURRENT_UNIT,
      color: "#d4915a",
      history: currentHistory,
      baseline: baselines.current,
      baselineLabel: l("Baseline courant", "Current baseline", "خط أساس التيار"),
      threshold: !isCalibrating ? currentThreshold ?? undefined : undefined,
      thresholdLabel: l("Seuil courant", "Current threshold", "عتبة التيار"),
      state: isCalibrating ? "calibrating" as const : currentAboveThreshold ? "anomaly" as const : "normal" as const,
      stateLabel: isCalibrating
        ? l("Calibration", "Calibration", "معايرة")
        : currentAboveThreshold
          ? l("Seuil dépassé", "Threshold exceeded", "تم تجاوز العتبة")
          : l("Sous seuil", "Below threshold", "تحت العتبة"),
      detail: isCalibrating
        ? calibrationSummary || l("Construction de la baseline courant.", "Building the current baseline.", "يتم بناء خط أساس التيار.")
        : formatMetricComparison("current_a", currentA, currentThreshold, CURRENT_UNIT, 3),
      waiting: l("La courbe courant apparaîtra après les premières trames série.", "The current chart will appear after the first serial frames.", "سيظهر منحنى التيار بعد أولى الإطارات التسلسلية."),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="section-title flex items-center gap-3">
          <CircleDot className="w-5 h-5" />
          {l("Expérience ESP32 — Banc d'essai USB", "ESP32 Experiment — USB Bench Test", "تجربة ESP32 — منصة اختبار USB")}
        </div>
        <div className={cn(
          "inline-flex w-fit items-center gap-3 rounded-full border px-3 py-1.5 text-xs font-semibold tracking-wide",
          explainedStatus.led === "normal"
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : explainedStatus.led === "anomaly"
              ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
              : explainedStatus.led === "calibrating"
                ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "border-border bg-muted text-muted-foreground"
        )}>
          <span className="relative flex h-3.5 w-3.5 items-center justify-center">
            {explainedStatus.led === "anomaly" && <span className="absolute inset-0 rounded-full bg-red-500/25 animate-ping" />}
            <span className={cn("relative h-3.5 w-3.5 rounded-full", ledClasses(explainedStatus.led))} />
          </span>
          <span>{explainedStatus.badge}</span>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 shadow-premium">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="text-sm font-semibold text-foreground">
              {l("Connexion directe ESP32 → PC → navigateur", "Direct ESP32 → PC → browser link", "اتصال مباشر ESP32 → الحاسوب → المتصفح")}
            </div>
            <p className="text-sm text-muted-foreground max-w-3xl">
              {l(
                "Pour ce test, l'ESP32 peut rester seul sur USB et envoyer des lignes CSV. La page lit le port série directement et affiche les mesures dans le même style de jauges et graphes que le tableau de bord.",
                "For this test, the ESP32 can stay alone on USB and send CSV lines. The page reads the serial port directly and renders the measurements using the same gauge and chart style as the dashboard.",
                "لهذا الاختبار، يمكن أن يبقى ESP32 وحده على USB ويرسل أسطر CSV. تقرأ الصفحة المنفذ التسلسلي مباشرة وتعرض القياسات بنفس أسلوب العدادات والرسوم الموجود في لوحة القيادة."
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className={`rounded-lg border px-3 py-1.5 ${serialConnected ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
                {serialConnected
                  ? l("ESP32 connecté en USB", "ESP32 connected over USB", "ESP32 متصل عبر USB")
                  : l("ESP32 non connecté", "ESP32 not connected", "ESP32 غير متصل")}
              </span>
              <span className={`rounded-lg border px-3 py-1.5 ${serialApi ? "border-primary/30 bg-primary/10 text-primary" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
                {serialApi
                  ? l("Web Serial disponible", "Web Serial available", "Web Serial متاح")
                  : l("Utilisez Chrome/Edge sur localhost", "Use Chrome/Edge on localhost", "استخدم Chrome/Edge على localhost")}
              </span>
              <span className="rounded-lg border border-border bg-muted px-3 py-1.5">
                {l("Baud rate attendu: 115200", "Expected baud rate: 115200", "معدل البود المتوقع: 115200")}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {serialConnected ? (
              <Button variant="destructive" onClick={() => void disconnectSerial()}>
                {l("Déconnecter l'ESP32", "Disconnect ESP32", "فصل ESP32")}
              </Button>
            ) : (
              <Button onClick={() => void connectSerial()} disabled={!serialApi}>
                {l("Connecter l'ESP32", "Connect ESP32", "توصيل ESP32")}
              </Button>
            )}
          </div>
        </div>

        {serialError && (
          <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {serialError}
          </div>
        )}

        {serialNote && (
          <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
            <strong className="text-foreground">{l("Note firmware:", "Firmware note:", "ملاحظة البرنامج الثابت:")}</strong> {serialNote}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          icon={<Cpu className="w-5 h-5" />}
          label={l("Source active", "Active source", "المصدر النشط")}
          value={<span className="text-2xl leading-tight">{liveSourceLabel}</span>}
          sub={liveSourceSub}
          variant={serialConnected ? "green" : serialSensors || apiConnected ? "blue" : "warn"}
        />
        <KpiCard
          icon={<Activity className="w-5 h-5" />}
          label={l("Échantillons reçus", "Samples received", "العينات المستلمة")}
          value={<>{sampleCount}<span className="text-base opacity-40"> pkt</span></>}
          sub={sampleCountSub}
          variant={sampleCount > 0 ? "blue" : "warn"}
        />
        <KpiCard
          icon={<Clock className="w-5 h-5" />}
          label={l("Dernier paquet", "Last packet", "آخر حزمة")}
          value={<span className="text-2xl leading-tight">{lastPacketTime ?? "—"}</span>}
          sub={lastSerialTimestamp !== null
            ? `${l("timestamp_ms", "timestamp_ms", "timestamp_ms")}: ${lastSerialTimestamp}`
            : l("En attente de la première mesure série", "Waiting for the first serial measurement", "في انتظار أول قياس تسلسلي")}
          variant={lastPacketTime ? "blue" : "warn"}
        />
        <KpiCard
          icon={<AlertTriangle className="w-5 h-5" />}
          label={l("Statut firmware", "Firmware status", "حالة البرنامج الثابت")}
          value={(
            <div className="space-y-2">
              <div className="text-xl leading-tight">{explainedStatus.label}</div>
              <Badge variant="outline" className={cn("w-fit px-3 py-1 text-[11px] font-semibold tracking-[0.18em]", statusBadgeClasses(explainedStatus.led))}>
                {explainedStatus.badge}
              </Badge>
            </div>
          )}
          sub={explainedStatus.detail}
          variant={explainedStatus.variant}
        >
          {firmwareStatus && (
            <div className="mt-3 text-[11px] text-muted-foreground break-all">
              {l("Code ESP32", "ESP32 code", "رمز ESP32")}: {firmwareStatus}
            </div>
          )}
        </KpiCard>
      </div>

      <div>
        <div className="section-title mb-4">{l("Courbes temps réel", "Real-time charts", "منحنيات الوقت الحقيقي")}</div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {primaryCharts.map((chart) => (
            <div key={chart.key} className="bg-card border border-border rounded-2xl p-5 shadow-premium card-premium">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-4">
                <div>
                  <div className="text-sm font-semibold text-foreground">{chart.title}</div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-bold" style={{ color: chart.color }}>
                      {chart.value !== null && chart.value !== undefined ? chart.value.toFixed(chart.digits) : "—"}
                    </span>
                    <span className="text-sm text-muted-foreground">{chart.unit}</span>
                  </div>
                </div>
                <Badge variant="outline" className={cn("w-fit px-3 py-1 text-[11px] font-semibold tracking-[0.18em]", statusBadgeClasses(chart.state))}>
                  {chart.stateLabel}
                </Badge>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                <Badge variant="outline" className="border-primary/20 bg-primary/5 px-2.5 py-1 text-[10px] text-primary">
                  {chart.baselineLabel}: {chart.baseline !== null && chart.baseline !== undefined ? `${chart.baseline.toFixed(chart.digits)} ${chart.unit}` : "—"}
                </Badge>
                {chart.threshold !== undefined ? (
                  <Badge variant="outline" className="border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[10px] text-destructive">
                    {chart.thresholdLabel}: {chart.threshold.toFixed(chart.digits)} {chart.unit}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-border bg-muted px-2.5 py-1 text-[10px] text-muted-foreground">
                    {l("Seuil après calibration", "Threshold after calibration", "العتبة بعد المعايرة")}
                  </Badge>
                )}
              </div>

              {chart.history.length >= 2 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={chart.history} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id={`esp-focus-${chart.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={chart.color} stopOpacity={0.55} />
                        <stop offset="70%" stopColor={chart.color} stopOpacity={0.16} />
                        <stop offset="100%" stopColor={chart.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="hsl(var(--chart-grid))" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="time"
                      tick={{ fill: "hsl(215,12%,55%)", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={18}
                    />
                    <YAxis
                      domain={[0, chart.max]}
                      tick={{ fill: "hsl(215,12%,55%)", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(value: number) => chart.max < 10 ? value.toFixed(1) : `${Math.round(value)}`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(220,18%,10%)",
                        border: "1px solid hsl(220,14%,20%)",
                        borderRadius: "10px",
                        fontSize: "11px",
                        color: "hsl(215,12%,55%)",
                      }}
                      labelStyle={{ color: chart.color, fontWeight: 600 }}
                      formatter={(value: number | string) => [`${Number(value).toFixed(chart.digits)} ${chart.unit}`, chart.label]}
                    />
                    {chart.baseline !== null && chart.baseline !== undefined && (
                      <ReferenceLine
                        y={chart.baseline}
                        ifOverflow="extendDomain"
                        stroke={chart.color}
                        strokeDasharray="4 4"
                        strokeOpacity={0.45}
                        label={{
                          value: `${l("Baseline", "Baseline", "خط الأساس")} ${chart.baseline.toFixed(chart.digits)}`,
                          position: "insideTopLeft",
                          fill: chart.color,
                          fontSize: 10,
                        }}
                      />
                    )}
                    {chart.threshold !== undefined && (
                      <>
                        <ReferenceArea
                          y1={chart.threshold}
                          y2={chart.max}
                          ifOverflow="extendDomain"
                          fill="#e04060"
                          fillOpacity={0.08}
                        />
                        <ReferenceLine
                          y={chart.threshold}
                          ifOverflow="extendDomain"
                          stroke="#e04060"
                          strokeDasharray="5 5"
                          strokeWidth={2}
                          strokeOpacity={0.95}
                          label={{
                            value: `${l("Seuil", "Threshold", "العتبة")} ${chart.threshold.toFixed(chart.digits)}`,
                            position: "insideTopRight",
                            fill: "#e04060",
                            fontSize: 10,
                          }}
                        />
                      </>
                    )}
                    {chart.threshold !== undefined && chart.history
                      .filter((point, index, history) => index > 0 && history[index - 1].value <= chart.threshold && point.value > chart.threshold)
                      .map((point) => (
                        <ReferenceLine
                          key={`${chart.key}-${point.time}`}
                          x={point.time}
                          stroke="#e04060"
                          strokeDasharray="3 3"
                          strokeOpacity={0.55}
                        />
                      ))}
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={chart.color}
                      strokeWidth={3}
                      fill={`url(#esp-focus-${chart.key})`}
                      activeDot={{ r: 5, fill: chart.color, stroke: "#fff", strokeWidth: 2 }}
                      dot={(props: { cx?: number; cy?: number; index?: number }) => {
                        if (chart.threshold === undefined || props.cx === undefined || props.cy === undefined || props.index === undefined) {
                          return null;
                        }

                        const point = chart.history[props.index];
                        if (!point || point.value <= chart.threshold) return null;

                        const previousPoint = props.index > 0 ? chart.history[props.index - 1] : null;
                        const isCrossing = !previousPoint || previousPoint.value <= chart.threshold;

                        return (
                          <circle
                            cx={props.cx}
                            cy={props.cy}
                            r={isCrossing ? 6 : 4}
                            fill={isCrossing ? "#ffffff" : "#e04060"}
                            stroke="#e04060"
                            strokeWidth={2.5}
                          />
                        );
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[240px] flex items-center justify-center rounded-xl border border-dashed border-border text-center text-sm text-muted-foreground px-4">
                  {chart.waiting}
                </div>
              )}

              <div className="mt-4 rounded-xl border border-border/70 bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                {chart.detail}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="section-title mb-4">{l("Mesures en direct", "Live measurements", "القياسات المباشرة")}</div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {sensorCards.map((sensor) => (
            <div key={sensor.key} className="bg-card border border-border rounded-2xl p-4 card-premium">
              <div className="flex items-center justify-center gap-2 mb-4">
                <span style={{ color: sensor.color }}>{sensor.icon}</span>
                <span className="font-bold text-sm uppercase tracking-wider" style={{ color: sensor.color }}>
                  {sensor.label}
                </span>
              </div>
              <div className="flex justify-center mb-4">
                <div className="w-[180px]">
                  <SVGGauge value={sensor.value ?? 0} max={sensor.max} color={sensor.color} label="" unit={sensor.unit} />
                </div>
              </div>
              {sensor.history.length >= 2 ? (
                <ResponsiveContainer width="100%" height={100}>
                  <AreaChart data={sensor.history} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id={`esp-${sensor.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={sensor.color} stopOpacity={0.5} />
                        <stop offset="70%" stopColor={sensor.color} stopOpacity={0.15} />
                        <stop offset="100%" stopColor={sensor.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" stroke={sensor.color} strokeOpacity={0.15} />
                    <XAxis dataKey="time" tick={{ fill: sensor.color, fontSize: 9, opacity: 0.8 }} axisLine={false} tickLine={false} minTickGap={20} />
                    <YAxis tick={{ fill: sensor.color, fontSize: 9, opacity: 0.8 }} axisLine={false} tickLine={false} />
                    {sensor.threshold !== undefined && (
                      <ReferenceLine
                        y={sensor.threshold}
                        ifOverflow="extendDomain"
                        stroke="#e04060"
                        strokeDasharray="4 4"
                        strokeOpacity={0.85}
                        label={{
                          value: `${l("Seuil", "Threshold", "العتبة")} ${sensor.threshold.toFixed(sensor.digits)}`,
                          position: "right",
                          fill: "#e04060",
                          fontSize: 9,
                        }}
                      />
                    )}
                    {sensor.threshold !== undefined && sensor.history
                      .filter((point, index, history) => index > 0 && history[index - 1].value <= sensor.threshold && point.value > sensor.threshold)
                      .map((point) => (
                        <ReferenceLine
                          key={`${sensor.key}-${point.time}`}
                          x={point.time}
                          stroke="#e04060"
                          strokeDasharray="3 3"
                          strokeOpacity={0.4}
                        />
                      ))}
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={sensor.color}
                      strokeWidth={2.5}
                      fill={`url(#esp-${sensor.key})`}
                      dot={(props: { cx?: number; cy?: number; index?: number }) => {
                        if (sensor.threshold === undefined || props.cx === undefined || props.cy === undefined || props.index === undefined) {
                          return null;
                        }

                        const point = sensor.history[props.index];
                        if (!point || point.value <= sensor.threshold) return null;

                        const previousPoint = props.index > 0 ? sensor.history[props.index - 1] : null;
                        const isCrossing = !previousPoint || previousPoint.value <= sensor.threshold;

                        return (
                          <circle
                            cx={props.cx}
                            cy={props.cy}
                            r={isCrossing ? 4.5 : 3.25}
                            fill={isCrossing ? "#ffffff" : "#e04060"}
                            stroke="#e04060"
                            strokeWidth={2}
                          />
                        );
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[100px] flex items-center justify-center rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground px-4">
                  {sensor.waiting}
                </div>
              )}
              {(sensor.baselineLabel || sensor.thresholdLabel) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {sensor.baselineLabel && (
                    <Badge variant="outline" className="border-primary/20 bg-primary/5 px-2.5 py-1 text-[10px] text-primary">
                      {sensor.baselineLabel}: {sensor.baseline !== null && sensor.baseline !== undefined ? `${sensor.baseline.toFixed(sensor.digits)} ${sensor.unit}` : "—"}
                    </Badge>
                  )}
                  {sensor.threshold !== undefined && sensor.thresholdLabel && (
                    <Badge variant="outline" className="border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[10px] text-destructive">
                      {sensor.thresholdLabel}: {sensor.threshold.toFixed(sensor.digits)} {sensor.unit}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 shadow-premium">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="text-sm font-semibold text-foreground">{l("Journal d'événements", "Event log", "سجل الأحداث")}</div>
          <div className="text-xs text-muted-foreground">{l("Horodatage en temps réel", "Real-time timestamps", "طوابع زمنية فورية")}</div>
        </div>
        <div className="max-h-64 overflow-y-auto pr-2 space-y-3">
          {eventLog.length > 0 ? eventLog.map((event) => (
            <div key={event.id} className={cn("rounded-xl border px-4 py-3", eventToneClasses(event.tone))}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-foreground">{event.title}</div>
                  <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{event.detail}</div>
                </div>
                <div className="text-[11px] font-mono text-muted-foreground whitespace-nowrap">{event.time}</div>
              </div>
            </div>
          )) : (
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              {l(
                "Les événements de calibration et de franchissement apparaîtront ici dès la première trame série.",
                "Calibration and threshold events will appear here as soon as the first serial frame arrives.",
                "ستظهر هنا أحداث المعايرة وتجاوز العتبات فور وصول أول إطار تسلسلي."
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-2xl p-5 shadow-premium">
          <div className="text-sm font-semibold text-foreground mb-3">{l("Détails banc d'essai", "Bench-test details", "تفاصيل منصة الاختبار")}</div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="industrial-label mb-1">{l("Vibration crête", "Peak vibration", "ذروة الاهتزاز")}</div>
              <div className="text-2xl font-bold text-foreground">{formatValue(vibrationRaw, 2)}</div>
            </div>
            <div>
              <div className="industrial-label mb-1">{l("Température", "Temperature", "الحرارة")}</div>
              <div className="text-2xl font-bold text-foreground">{formatValue(temperatureC, 1)}<span className="text-sm text-muted-foreground"> °C</span></div>
            </div>
            <div>
              <div className="industrial-label mb-1">{l("Courant", "Current", "التيار")}</div>
              <div className="text-2xl font-bold text-foreground">{formatValue(currentA, 3)}<span className="text-sm text-muted-foreground"> A</span></div>
            </div>
            <div>
              <div className="industrial-label mb-1">{l("Statut", "Status", "الحالة")}</div>
              <div className="space-y-2">
                <Badge variant="outline" className={cn("w-fit px-3 py-1.5 text-[11px] font-semibold tracking-[0.18em]", statusBadgeClasses(explainedStatus.led))}>
                  {explainedStatus.badge}
                </Badge>
                <div className="text-xs leading-relaxed text-muted-foreground">{explainedStatus.detail}</div>
                <div className="text-[11px] text-muted-foreground break-all">
                  {firmwareStatus ?? l("NON PUBLIÉ", "NOT PUBLISHED", "غير منشور")}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 shadow-premium">
          <div className="text-sm font-semibold text-foreground mb-3">{l("Format série attendu", "Expected serial format", "تنسيق السيريال المتوقع")}</div>
          <div className="text-xs text-muted-foreground space-y-2">
            <p>{l(
              "La page ignore l'en-tête CSV et lit les lignes de cette forme :",
              "The page ignores the CSV header and reads lines in this format:",
              "تتجاهل الصفحة ترويسة CSV وتقرأ الأسطر بهذا التنسيق:"
            )}</p>
            <code className="block rounded-xl bg-muted px-3 py-2 text-[11px] text-foreground break-all">
              timestamp_ms,current_a,vibration_raw,vibration_rms,temp_c,status,calib_count,calib_total,baseline_vib,baseline_current,thresh_vib,thresh_current
            </code>
            <p>{l(
              "Les lignes commençant par `#` sont traitées comme notes firmware, utile pour les messages de calibration.",
              "Lines starting with `#` are treated as firmware notes, which is useful for calibration messages.",
              "يتم التعامل مع الأسطر التي تبدأ بـ `#` كملاحظات من البرنامج الثابت، وهذا مفيد لرسائل المعايرة."
            )}</p>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 shadow-premium">
        <div className="text-sm font-semibold text-foreground mb-3">{l("Sortie pipeline ML (optionnelle)", "ML pipeline output (optional)", "مخرجات خط أنابيب ML (اختيارية)")}</div>
        <p className="text-xs text-muted-foreground mb-4">
          {l(
            "Ces cartes restent séparées du test USB. Elles dépendent des données backend déjà présentes dans l'application.",
            "These cards remain separate from the USB test. They depend on backend data already present in the app.",
            "تبقى هذه البطاقات منفصلة عن اختبار USB. وهي تعتمد على بيانات الخلفية الموجودة مسبقًا في التطبيق."
          )}
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-2xl p-5 shadow-premium text-center">
            <div className="text-xs text-muted-foreground mb-2">{l("Indice de Santé", "Health Index", "مؤشر الصحة")}</div>
            <div className="text-4xl font-bold" style={{ color: hiColor(machineState?.hi_smooth) }}>
              {machineState?.hi_smooth !== undefined ? (machineState.hi_smooth * 100).toFixed(0) : "—"}
              <span className="text-lg font-normal text-muted-foreground"> %</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">Isolation Forest → Hybrid → HI</div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5 shadow-premium text-center">
            <div className="text-xs text-muted-foreground mb-2">{l("Zone", "Zone", "المنطقة")}</div>
            <div className={`inline-block rounded-lg border px-4 py-2 text-sm font-semibold ${zoneColor(machineState?.zone)}`}>
              {machineState?.zone ?? "—"}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5 shadow-premium text-center">
            <div className="text-xs text-muted-foreground mb-2">{l("Durée de Vie Résiduelle", "Remaining Useful Life", "العمر المتبقي")}</div>
            <div className="text-4xl font-bold text-foreground">
              {machineState?.rul_days !== undefined && machineState.rul_days !== null ? machineState.rul_days.toFixed(0) : "—"}
              <span className="text-lg font-normal text-muted-foreground"> {l("jours", "days", "أيام")}</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">Random Forest (300 arbres)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
