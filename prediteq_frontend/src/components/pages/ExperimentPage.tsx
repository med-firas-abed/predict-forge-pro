import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, CircleDot, Clock, Cpu, Zap } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useSearchParams } from "react-router-dom";

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
  getPorts?(): Promise<BrowserSerialPort[]>;
}

const MAX_POINTS = 30;
const MAX_EVENTS = 40;
const VIBRATION_UNIT = "m/s2";
const CURRENT_UNIT = "A";
const SERIAL_STALE_MS = 3000;
const SERIAL_RECOVER_MS = 1200;
type FeedSource = "serial" | "demo";
type DemoBenchPhase = "rest_start" | "running" | "rest_middle" | "loaded" | "rest_end";

const SERIAL_MAX_RECOVER_ATTEMPTS = 6;
const DEMO_SAMPLE_MS = 350;
const DEMO_PHASE_MS = 7000;
const DEMO_STARTUP_CALIBRATION_MS = 2800;
const DEMO_CALIBRATION_SAMPLES = 15;
const DEMO_BASELINE_VIBRATION = 0.03;
const DEMO_BASELINE_CURRENT = 0.0;
const DEMO_VIBRATION_THRESHOLD = 0.34;
const DEMO_CURRENT_THRESHOLD = 0.16;
const DEMO_REST_VIBRATION_RAW = 0.05;
const DEMO_RUNNING_CURRENT = 0.092;
const DEMO_BLOCKED_CURRENT = 0.225;
const DEMO_RUNNING_VIBRATION_RMS = 0.19;
const DEMO_BLOCKED_VIBRATION_RMS = 0.39;
const DEMO_RUNNING_VIBRATION_RAW = 0.29;
const DEMO_BLOCKED_VIBRATION_RAW = 0.64;
const DEMO_REST_TEMP_C = 25.1;
const DEMO_RUNNING_TEMP_C = 25.7;
const DEMO_BLOCKED_TEMP_C = 26.4;

function clampNumber(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function roundMetric(value: number, digits: number) {
  return Number(value.toFixed(digits));
}

function lerpNumber(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function demoWave(seconds: number, amplitude: number, phase: number) {
  return (
    Math.sin(seconds * 1.8 + phase) * amplitude +
    Math.cos(seconds * 0.67 + phase * 0.6) * amplitude * 0.35
  );
}

function demoRamp(progress: number, span = 0.22) {
  return clampNumber(progress / span, 0, 1);
}

function demoKick(progress: number, center = 0.12, width = 0.065) {
  const normalized = (progress - center) / width;
  return Math.exp(-(normalized * normalized));
}

function buildBenchDemoFrame(elapsedMs: number) {
  const boundedElapsedMs = Math.max(0, elapsedMs);
  const seconds = boundedElapsedMs / 1000;
  const startupCalibrationProgress = clampNumber(boundedElapsedMs / DEMO_STARTUP_CALIBRATION_MS, 0, 1);
  const startupCalibCount = Math.max(1, Math.ceil(startupCalibrationProgress * DEMO_CALIBRATION_SAMPLES));

  let phase: DemoBenchPhase = "rest_end";
  let phaseStartMs = DEMO_PHASE_MS * 4;
  if (boundedElapsedMs < DEMO_PHASE_MS) {
    phase = "rest_start";
    phaseStartMs = 0;
  } else if (boundedElapsedMs < DEMO_PHASE_MS * 2) {
    phase = "running";
    phaseStartMs = DEMO_PHASE_MS;
  } else if (boundedElapsedMs < DEMO_PHASE_MS * 3) {
    phase = "rest_middle";
    phaseStartMs = DEMO_PHASE_MS * 2;
  } else if (boundedElapsedMs < DEMO_PHASE_MS * 4) {
    phase = "loaded";
    phaseStartMs = DEMO_PHASE_MS * 3;
  }

  const phaseProgress = clampNumber((boundedElapsedMs - phaseStartMs) / DEMO_PHASE_MS, 0, 1);
  const rampUp = demoRamp(phaseProgress, 0.2);
  const rampDown = 1 - demoRamp(phaseProgress, 0.18);
  const startupCalibrating = phase === "rest_start" && boundedElapsedMs < DEMO_STARTUP_CALIBRATION_MS;

  let currentA = 0;
  let vibrationRms = DEMO_BASELINE_VIBRATION;
  let vibrationRaw = DEMO_REST_VIBRATION_RAW;
  let tempC = DEMO_REST_TEMP_C;
  let status = "REST";
  let calibCount: number | undefined;
  let calibTotal: number | undefined;

  if (phase === "rest_start") {
    currentA = 0;
    vibrationRms = clampNumber(DEMO_BASELINE_VIBRATION + demoWave(seconds, 0.004, 0.1), 0.02, 0.045);
    vibrationRaw = clampNumber(DEMO_REST_VIBRATION_RAW + demoWave(seconds, 0.01, 0.4), 0.04, 0.09);
    tempC = clampNumber(DEMO_REST_TEMP_C + demoWave(seconds, 0.08, 0.7), 24.9, 25.3);
    status = startupCalibrating ? "CALIBRATING_REST" : "REST";
    if (startupCalibrating) {
      calibCount = startupCalibCount;
      calibTotal = DEMO_CALIBRATION_SAMPLES;
    }
  } else if (phase === "running") {
    const startupKick = demoKick(phaseProgress);
    currentA = clampNumber(
      lerpNumber(0, DEMO_RUNNING_CURRENT, rampUp) + startupKick * 0.022 + demoWave(seconds, 0.004, 0.2),
      0,
      0.125,
    );
    vibrationRms = clampNumber(
      lerpNumber(DEMO_BASELINE_VIBRATION, DEMO_RUNNING_VIBRATION_RMS, rampUp) + startupKick * 0.038 + demoWave(seconds, 0.012, 0.6),
      0.03,
      0.27,
    );
    vibrationRaw = clampNumber(
      lerpNumber(DEMO_REST_VIBRATION_RAW, DEMO_RUNNING_VIBRATION_RAW, rampUp) + startupKick * 0.058 + demoWave(seconds, 0.02, 0.9),
      0.05,
      0.4,
    );
    tempC = clampNumber(
      lerpNumber(DEMO_REST_TEMP_C, DEMO_RUNNING_TEMP_C, rampUp) + demoWave(seconds, 0.08, 1.1),
      25.0,
      26.0,
    );
    status = "RUNNING";
  } else if (phase === "rest_middle") {
    currentA = clampNumber(
      lerpNumber(0, DEMO_RUNNING_CURRENT, rampDown) + demoWave(seconds, 0.0025, 0.25),
      0,
      0.07,
    );
    if (currentA < 0.004) {
      currentA = 0;
    }
    vibrationRms = clampNumber(
      lerpNumber(DEMO_BASELINE_VIBRATION, DEMO_RUNNING_VIBRATION_RMS, rampDown) + demoWave(seconds, 0.009, 0.55),
      0.03,
      0.24,
    );
    vibrationRaw = clampNumber(
      lerpNumber(DEMO_REST_VIBRATION_RAW, DEMO_RUNNING_VIBRATION_RAW, rampDown) + demoWave(seconds, 0.016, 0.85),
      0.05,
      0.36,
    );
    tempC = clampNumber(
      lerpNumber(DEMO_REST_TEMP_C + 0.05, DEMO_RUNNING_TEMP_C, rampDown) + demoWave(seconds, 0.06, 1.05),
      25.0,
      25.9,
    );
    status = "REST";
  } else if (phase === "loaded") {
    const startupKick = demoKick(phaseProgress);
    currentA = clampNumber(
      lerpNumber(0, DEMO_BLOCKED_CURRENT, rampUp) + startupKick * 0.032 + demoWave(seconds, 0.006, 0.5),
      0,
      0.275,
    );
    vibrationRms = clampNumber(
      lerpNumber(DEMO_BASELINE_VIBRATION, DEMO_BLOCKED_VIBRATION_RMS, rampUp) + startupKick * 0.055 + demoWave(seconds, 0.016, 0.8),
      0.03,
      0.47,
    );
    vibrationRaw = clampNumber(
      lerpNumber(DEMO_REST_VIBRATION_RAW, DEMO_BLOCKED_VIBRATION_RAW, rampUp) + startupKick * 0.085 + demoWave(seconds, 0.026, 1.3),
      0.05,
      0.78,
    );
    tempC = clampNumber(
      lerpNumber(DEMO_REST_TEMP_C, DEMO_BLOCKED_TEMP_C, rampUp) + demoWave(seconds, 0.1, 1.6),
      25.1,
      26.8,
    );
    status = "BLOCKED";
  } else {
    currentA = clampNumber(
      lerpNumber(0, DEMO_BLOCKED_CURRENT, rampDown) + demoWave(seconds, 0.003, 0.3),
      0,
      0.2,
    );
    if (currentA < 0.004) {
      currentA = 0;
    }
    vibrationRms = clampNumber(
      lerpNumber(DEMO_BASELINE_VIBRATION, DEMO_BLOCKED_VIBRATION_RMS, rampDown) + demoWave(seconds, 0.014, 0.75),
      0.03,
      0.45,
    );
    vibrationRaw = clampNumber(
      lerpNumber(DEMO_REST_VIBRATION_RAW, DEMO_BLOCKED_VIBRATION_RAW, rampDown) + demoWave(seconds, 0.024, 1.05),
      0.05,
      0.82,
    );
    tempC = clampNumber(
      lerpNumber(DEMO_REST_TEMP_C + 0.1, DEMO_BLOCKED_TEMP_C, rampDown) + demoWave(seconds, 0.08, 1.45),
      25.1,
      26.6,
    );
    status = "REST";
  }

  return {
    phase,
    frame: {
      timestamp_ms: boundedElapsedMs,
      current_a: roundMetric(currentA, 3),
      vibration_raw: roundMetric(vibrationRaw, 3),
      vibration_rms: roundMetric(vibrationRms, 3),
      temp_c: roundMetric(tempC, 2),
      status,
      calib_count: calibCount,
      calib_total: calibTotal,
      baseline_vib: DEMO_BASELINE_VIBRATION,
      baseline_current: DEMO_BASELINE_CURRENT,
      thresh_vib: DEMO_VIBRATION_THRESHOLD,
      thresh_current: DEMO_CURRENT_THRESHOLD,
    } satisfies BenchSensors,
  };
}

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
  const [searchParams] = useSearchParams();
  const l = useCallback(
    (fr: string, en: string, ar: string) => lang === "fr" ? fr : lang === "en" ? en : ar,
    [lang],
  );
  const requestedMachineCode = searchParams.get("machine");
  const showManualSerialOption = searchParams.get("serial") === "1";
  const serialApi = typeof navigator !== "undefined"
    ? (navigator as Navigator & { serial?: BrowserSerial }).serial
    : undefined;

  const [machineState, setMachineState] = useState<MachineState | null>(null);
  const [apiConnected, setApiConnected] = useState(false);
  const [apiSensors, setApiSensors] = useState<BenchSensors | null>(null);

  const [serialConnected, setSerialConnected] = useState(false);
  const [demoConnected, setDemoConnected] = useState(false);
  const [serialError, setSerialError] = useState<string | null>(null);
  const [serialNote, setSerialNote] = useState<string | null>(null);
  const [serialSensors, setSerialSensors] = useState<BenchSensors | null>(null);
  const [sampleCount, setSampleCount] = useState(0);
  const [lastPacketTime, setLastPacketTime] = useState<string | null>(null);
  const [lastSerialTimestamp, setLastSerialTimestamp] = useState<number | null>(null);
  const [serialStreamStale, setSerialStreamStale] = useState(false);

  const [vibrationHistory, setVibrationHistory] = useState<SensorPoint[]>([]);
  const [currentHistory, setCurrentHistory] = useState<SensorPoint[]>([]);
  const [baselines, setBaselines] = useState<{ vibration: number | null; current: number | null }>({
    vibration: null,
    current: null,
  });
  const [eventLog, setEventLog] = useState<EventEntry[]>([]);
  const [lastFrameSource, setLastFrameSource] = useState<FeedSource | null>(null);

  const portRef = useRef<BrowserSerialPort | null>(null);
  const selectedPortRef = useRef<BrowserSerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const bufferRef = useRef("");
  const disconnectingRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const demoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const demoStartedAtRef = useRef<number | null>(null);
  const demoPhaseRef = useRef<DemoBenchPhase | null>(null);
  const serialStaleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serialReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serialReconnectAttemptRef = useRef(0);
  const serialRecoveringRef = useRef(false);
  const serialAutoReconnectRef = useRef(false);
  const calibrationRef = useRef<{ vibration: number[]; current: number[] }>({ vibration: [], current: [] });
  const eventIdRef = useRef(0);
  const statusSnapshotRef = useRef<StatusSnapshot | null>(null);
  const lastSerialTimestampRef = useRef<number | null>(null);

  const activeSensors = serialSensors ?? apiSensors;
  const liveConnected = demoConnected || serialConnected;
  const activeFeedSource: FeedSource | null = demoConnected ? "demo" : serialConnected ? "serial" : null;
  const vibrationRms = activeSensors?.vibration_rms ?? activeSensors?.rms_mms ?? null;
  const vibrationRaw = activeSensors?.vibration_raw ?? null;
  const currentA = activeSensors?.current_a ?? null;
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
  const recentCurrentHistory = currentHistory.slice(-8);
  const recentVibrationHistory = vibrationHistory.slice(-8);
  const currentFlatlineHint =
    serialConnected &&
    !serialStreamStale &&
    recentCurrentHistory.length >= 6 &&
    recentCurrentHistory.every((point) => Math.abs(point.value) < 0.0005) &&
    recentVibrationHistory.some((point) => Math.abs(point.value) >= 0.05);

  useEffect(() => {
    let cancelled = false;

    const fetchMachine = async () => {
      try {
        const machines = await apiFetch<MachineRecord[]>("/machines");
        if (cancelled) return;

        const machine = machines.find((x) => x.code === requestedMachineCode) || machines[0];
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
  }, [requestedMachineCode]);

  useEffect(() => {
    return () => {
      if (demoIntervalRef.current) {
        clearInterval(demoIntervalRef.current);
        demoIntervalRef.current = null;
      }
      void disconnectSerial();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (serialStaleTimeoutRef.current) {
        clearTimeout(serialStaleTimeoutRef.current);
        serialStaleTimeoutRef.current = null;
      }
      if (serialReconnectTimerRef.current) {
        clearTimeout(serialReconnectTimerRef.current);
        serialReconnectTimerRef.current = null;
      }
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

  function clearSerialStaleTimeout() {
    if (serialStaleTimeoutRef.current) {
      clearTimeout(serialStaleTimeoutRef.current);
      serialStaleTimeoutRef.current = null;
    }
  }

  function clearSerialReconnectTimer() {
    if (serialReconnectTimerRef.current) {
      clearTimeout(serialReconnectTimerRef.current);
      serialReconnectTimerRef.current = null;
    }
  }

  function clearBenchDemoInterval() {
    if (demoIntervalRef.current) {
      clearInterval(demoIntervalRef.current);
      demoIntervalRef.current = null;
    }
  }

  function describeBenchDemoPhase(phase: DemoBenchPhase) {
    switch (phase) {
      case "rest_start":
        return {
          note: l(
            "# BOOT_OK | # MPU_OK | status=CALIBRATING_REST",
            "# BOOT_OK | # MPU_OK | status=CALIBRATING_REST",
            "# BOOT_OK | # MPU_OK | status=CALIBRATING_REST"
          ),
          title: l("Initialisation ESP32", "ESP32 startup", "تهيئة ESP32"),
          detail: l(
            "Le flux USB s'ouvre et l'ESP32 stabilise les baselines ACS712 5A et MPU6050 avant le lancement live.",
            "The USB feed opens and the ESP32 stabilizes the ACS712 5A and MPU6050 baselines before going live.",
            "يفتح تدفق USB وتثبّت وحدة ESP32 خطوط الأساس الخاصة بـ ACS712 5A وMPU6050 قبل الإطلاق الحي."
          ),
          tone: "info" as const,
        };
      case "running":
        return {
          note: l(
            "# LIVE_STREAM_READY | status=RUNNING | current_a->0.055",
            "# LIVE_STREAM_READY | status=RUNNING | current_a->0.055",
            "# LIVE_STREAM_READY | status=RUNNING | current_a->0.055"
          ),
          title: l("Flux live actif", "Live feed active", "التدفق الحي نشط"),
          detail: l(
            "Le moteur demarre et les mesures courant/vibration se stabilisent comme sur un banc reel.",
            "The motor starts and the current/vibration measurements stabilize like a real bench setup.",
            "يبدأ المحرك وتستقر قياسات التيار والاهتزاز كما في منصة اختبار حقيقية."
          ),
          tone: "success" as const,
        };
      case "rest_middle":
        return {
          note: l(
            "status=REST | motor_off | current_a->0.000",
            "status=REST | motor_off | current_a->0.000",
            "status=REST | motor_off | current_a->0.000"
          ),
          title: l("Moteur coupe", "Motor OFF", "المحرك متوقف"),
          detail: l(
            "Le moteur est coupe pendant quelques secondes et les deux capteurs reviennent vers leur niveau de repos.",
            "The motor is switched OFF for a few seconds and both sensors fall back toward their resting level.",
            "يتم إيقاف المحرك لعدة ثوان وتعود قراءات الحساسين نحو مستوى السكون."
          ),
          tone: "success" as const,
        };
      case "loaded":
        return {
          note: l(
            "status=BLOCKED | wheel load attached | current_a->0.185",
            "status=BLOCKED | wheel load attached | current_a->0.185",
            "status=BLOCKED | wheel load attached | current_a->0.185"
          ),
          title: l("Rotation avec charge", "Rotation under load", "دوران تحت حمولة"),
          detail: l(
            "Le moteur redemarre avec une charge plus elevee, comme lorsqu'on ajoute une roue sur l'arbre du moteur.",
            "The motor starts again under a higher load, like attaching a wheel to the motor shaft.",
            "يعاود المحرك الدوران تحت حمولة أعلى، كما لو تم تثبيت عجلة على عمود المحرك."
          ),
          tone: "warning" as const,
        };
      default:
        return {
          note: l(
            "status=REST | motor_off | current_a->0.000",
            "status=REST | motor_off | current_a->0.000",
            "status=REST | motor_off | current_a->0.000"
          ),
          title: l("Retour au repos", "Return to rest", "العودة إلى السكون"),
          detail: l(
            "Le moteur est coupe et les courbes reviennent vers leur niveau de repos sans rupture brutale.",
            "The motor is OFF and the curves return to their rest level without an abrupt jump.",
            "يكون المحرك متوقفاً وتعود المنحنيات إلى مستوى السكون بدون قفزة حادة."
          ),
          tone: "success" as const,
        };
    }
  }

  function stopBenchDemo(options?: { clearNote?: boolean }) {
    clearBenchDemoInterval();
    demoStartedAtRef.current = null;
    demoPhaseRef.current = null;
    setDemoConnected(false);
    setSerialStreamStale(false);
    if (options?.clearNote) {
      setSerialNote(null);
    }
  }

  async function startBenchDemo() {
    stopBenchDemo({ clearNote: true });

    if (serialConnected) {
      await disconnectSerial();
    }

    serialAutoReconnectRef.current = false;
    serialRecoveringRef.current = false;
    serialReconnectAttemptRef.current = 0;
    clearSerialStaleTimeout();
    clearSerialReconnectTimer();
    setSerialConnected(false);
    setSerialError(null);
    resetSerialSeries();
    setDemoConnected(true);

    demoStartedAtRef.current = Date.now();
    demoPhaseRef.current = null;

    const emitDemoFrame = () => {
      const elapsedMs = demoStartedAtRef.current === null ? 0 : Date.now() - demoStartedAtRef.current;
      const { phase, frame } = buildBenchDemoFrame(elapsedMs);

      if (demoPhaseRef.current !== phase) {
        demoPhaseRef.current = phase;
        const phaseDetails = describeBenchDemoPhase(phase);
        setSerialNote(phaseDetails.note);
        appendEvent(phaseDetails.title, phaseDetails.detail, phaseDetails.tone);
      }

      applySerialFrame(frame, "demo");
    };

    emitDemoFrame();
    demoIntervalRef.current = setInterval(emitDemoFrame, DEMO_SAMPLE_MS);
  }

  async function releaseSerialTransport(forgetSelectedPort: boolean) {
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

    if (forgetSelectedPort) {
      selectedPortRef.current = null;
    }
  }

  function scheduleSerialRecovery() {
    if (!serialAutoReconnectRef.current || serialRecoveringRef.current) {
      return;
    }

    clearSerialReconnectTimer();
    serialReconnectTimerRef.current = setTimeout(() => {
      void recoverSerialConnection();
    }, SERIAL_RECOVER_MS);
  }

  async function recoverSerialConnection() {
    if (!serialApi || !serialAutoReconnectRef.current || serialRecoveringRef.current || disconnectingRef.current) {
      return;
    }

    serialRecoveringRef.current = true;
    clearSerialReconnectTimer();
    serialReconnectAttemptRef.current += 1;
    let reopened = false;
    let shouldRetry = false;

    setSerialStreamStale(true);
    setSerialError(null);
    setSerialNote(l(
      `Reprise USB automatique (${serialReconnectAttemptRef.current})...`,
      `Automatic USB recovery (${serialReconnectAttemptRef.current})...`,
      `Automatic USB recovery (${serialReconnectAttemptRef.current})...`
    ));

    disconnectingRef.current = true;
    await releaseSerialTransport(false);
    disconnectingRef.current = false;

    let port = selectedPortRef.current;
    if (!port && serialApi.getPorts) {
      try {
        const ports = await serialApi.getPorts();
        port = ports[0] ?? null;
        selectedPortRef.current = port;
      } catch {
        port = null;
      }
    }

    if (!port) {
      setSerialConnected(false);
      setSerialError(l(
        "Impossible de retrouver le port série. Rebranchez l'ESP32 puis reconnectez.",
        "Unable to find the serial port again. Replug the ESP32 and reconnect.",
        "Unable to find the serial port again. Replug the ESP32 and reconnect."
      ));
      serialRecoveringRef.current = false;
      return;
    }

    try {
      await port.open({ baudRate: 115200 });
      portRef.current = port;
      selectedPortRef.current = port;
      bufferRef.current = "";
      setSerialConnected(true);
      setSerialStreamStale(false);
      setSerialError(null);
      setSerialNote(l(
        "Flux USB repris automatiquement.",
        "USB stream resumed automatically.",
        "USB stream resumed automatically."
      ));
      serialReconnectAttemptRef.current = 0;
      reopened = true;
      void readSerialLoop(port);
    } catch (error) {
      if (serialReconnectAttemptRef.current >= SERIAL_MAX_RECOVER_ATTEMPTS) {
        setSerialConnected(false);
        serialAutoReconnectRef.current = false;
        setSerialError(error instanceof Error ? error.message : l(
          "La reprise automatique a échoué. Reconnectez l'ESP32.",
          "Automatic recovery failed. Reconnect the ESP32.",
          "Automatic recovery failed. Reconnect the ESP32."
        ));
      } else {
        shouldRetry = true;
        setSerialConnected(true);
        setSerialStreamStale(true);
        setSerialError(null);
        setSerialNote(l(
          `USB en reprise automatique (${serialReconnectAttemptRef.current})...`,
          `USB auto-recovery in progress (${serialReconnectAttemptRef.current})...`,
          `USB auto-recovery in progress (${serialReconnectAttemptRef.current})...`
        ));
      }
    } finally {
      serialRecoveringRef.current = false;
      if (!reopened && shouldRetry && serialAutoReconnectRef.current && !disconnectingRef.current) {
        clearSerialReconnectTimer();
        serialReconnectTimerRef.current = setTimeout(() => {
          void recoverSerialConnection();
        }, SERIAL_RECOVER_MS);
      }
    }
  }

  function armSerialStaleTimeout() {
    clearSerialStaleTimeout();
    setSerialStreamStale(false);
    serialStaleTimeoutRef.current = setTimeout(() => {
      setSerialStreamStale(true);
      scheduleSerialRecovery();
    }, SERIAL_STALE_MS);
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
  const currentGaugeMax = resolveGaugeMax(currentA, baselines.current, currentThreshold, 0.35, 1.35);

  const explainedStatus = false && serialConnected && serialStreamStale
    ? {
        badge: l("USB en pause", "USB paused", "USB متوقف"),
        label: l("Flux USB coupe", "USB feed stopped", "توقف تدفق USB"),
        detail: l(
          "Aucune nouvelle mesure USB depuis quelques secondes. Les anciennes valeurs ne sont plus en direct.",
          "No new USB measurements arrived for a few seconds. The old values are no longer live.",
          "لم تصل قياسات USB جديدة منذ بضع ثوان. القيم القديمة لم تعد مباشرة."
        ),
        led: "idle" as const,
        variant: "warn" as const,
        }
    : isCalibrating
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
    : firmwareStatus === "REST"
      ? {
          badge: l("REST", "REST", "REST"),
          label: l("Moteur au repos", "Motor at rest", "المحرك في وضع السكون"),
          detail: l(
            "Flux live actif. Le courant est proche de zero et la vibration reste calme.",
            "Live feed is active. Current is near zero and vibration stays quiet.",
            "التدفق المباشر نشط. التيار قريب من الصفر والاهتزاز هادئ."
          ),
          led: "normal" as const,
          variant: "blue" as const,
        }
    : firmwareStatus === "RUNNING"
      ? {
          badge: l("LIVE", "LIVE", "LIVE"),
          label: l("Moteur en marche", "Motor running", "المحرك يعمل"),
          detail: l(
            "Flux live actif. Le courant et la vibration se mettent a jour en temps reel.",
            "Live feed is active. Current and vibration update in real time.",
            "التدفق المباشر نشط. التيار والاهتزاز يتحدثان في الوقت الحقيقي."
          ),
          led: "normal" as const,
          variant: "blue" as const,
        }
    : firmwareStatus === "BLOCKED"
      ? {
          badge: l("LOAD", "LOAD", "LOAD"),
          label: l("Charge plus elevee", "Higher load", "حمولة أعلى"),
          detail: l(
            "Flux live actif. Le courant ou la vibration ont monte pendant que le moteur continuait de tourner.",
            "Live feed is active. Current or vibration rose while the motor kept turning.",
            "التدفق المباشر نشط. ارتفع التيار أو الاهتزاز بينما استمر المحرك في الدوران."
          ),
          led: "normal" as const,
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
    clearSerialStaleTimeout();
    clearSerialReconnectTimer();
    clearBenchDemoInterval();
    serialReconnectAttemptRef.current = 0;
    lastSerialTimestampRef.current = null;
    bufferRef.current = "";
    setSerialStreamStale(false);
    setSerialSensors(null);
    setLastFrameSource(null);
    setSampleCount(0);
    setLastPacketTime(null);
    setLastSerialTimestamp(null);
    setSerialNote(null);
    setVibrationHistory([]);
    setCurrentHistory([]);
    setBaselines({ vibration: null, current: null });
    setEventLog([]);
    calibrationRef.current = { vibration: [], current: [] };
    eventIdRef.current = 0;
    statusSnapshotRef.current = { calibrating: false, vibrationAbove: false, currentAbove: false };
  }

  function applySerialFrame(frame: BenchSensors, source: FeedSource) {
    const stamp = frame.timestamp_ms ?? Date.now();
    const time = formatClock();
    const rebootDetected =
      frame.timestamp_ms !== undefined &&
      lastSerialTimestampRef.current !== null &&
      frame.timestamp_ms + 500 < lastSerialTimestampRef.current;

    if (rebootDetected) {
      resetSerialSeries();
      setSerialNote(l(
        "ESP32 redemarre, nouvelle session USB detectee.",
        "ESP32 restarted, a new USB session was detected.",
        "تمت إعادة تشغيل ESP32 وتم بدء جلسة USB جديدة."
      ));
    }

    if (source === "serial") {
      armSerialStaleTimeout();
    } else {
      clearSerialStaleTimeout();
      setSerialStreamStale(false);
    }

    setLastFrameSource(source);
    setSerialSensors(frame);
    if (rebootDetected) {
      setSampleCount(1);
    } else {
      setSampleCount((count) => count + 1);
    }
    setLastPacketTime(time);
    setLastSerialTimestamp(stamp);
    lastSerialTimestampRef.current = stamp;

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
      setVibrationHistory((prev) => pushPoint(rebootDetected ? [] : prev, frame.vibration_rms as number, 2, time));
    }
    if (frame.current_a !== undefined) {
      setCurrentHistory((prev) => pushPoint(rebootDetected ? [] : prev, frame.current_a as number, 3, time));
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
    if (parts.length < 5) return;

    const timestampMs = Number.parseInt(parts[0], 10);
    const current = Number.parseFloat(parts[1]);
    const vibrationRawValue = Number.parseFloat(parts[2]);
    const vibrationRmsValue = Number.parseFloat(parts[3]);

    if (![current, vibrationRawValue, vibrationRmsValue].every(Number.isFinite)) {
      return;
    }

    const possibleTemp = Number.parseFloat(parts[4]);
    const hasTemperatureColumn = Number.isFinite(possibleTemp);

    if (hasTemperatureColumn) {
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
          temp_c: possibleTemp,
          status,
          calib_count: Number.isFinite(calibCount) ? calibCount : undefined,
          calib_total: Number.isFinite(calibTotal) ? calibTotal : undefined,
          baseline_vib: Number.isFinite(baselineVib) ? baselineVib : undefined,
          baseline_current: Number.isFinite(baselineCurrent) ? baselineCurrent : undefined,
          thresh_vib: Number.isFinite(threshVib) ? threshVib : undefined,
          thresh_current: Number.isFinite(threshCurrent) ? threshCurrent : undefined,
        }, "serial");
        return;
      }

      const status = parts.slice(5).join(",").trim();
      if (!status) return;

      applySerialFrame({
        timestamp_ms: Number.isFinite(timestampMs) ? timestampMs : undefined,
        current_a: current,
        vibration_raw: vibrationRawValue,
        vibration_rms: vibrationRmsValue,
        temp_c: possibleTemp,
        status,
      }, "serial");
      return;
    }

    if (parts.length >= 11) {
      const status = parts[4].trim();
      const calibCount = Number.parseInt(parts[5], 10);
      const calibTotal = Number.parseInt(parts[6], 10);
      const baselineVib = Number.parseFloat(parts[7]);
      const baselineCurrent = Number.parseFloat(parts[8]);
      const threshVib = Number.parseFloat(parts[9]);
      const threshCurrent = Number.parseFloat(parts[10]);

      applySerialFrame({
        timestamp_ms: Number.isFinite(timestampMs) ? timestampMs : undefined,
        current_a: current,
        vibration_raw: vibrationRawValue,
        vibration_rms: vibrationRmsValue,
        status,
        calib_count: Number.isFinite(calibCount) ? calibCount : undefined,
        calib_total: Number.isFinite(calibTotal) ? calibTotal : undefined,
        baseline_vib: Number.isFinite(baselineVib) ? baselineVib : undefined,
        baseline_current: Number.isFinite(baselineCurrent) ? baselineCurrent : undefined,
        thresh_vib: Number.isFinite(threshVib) ? threshVib : undefined,
        thresh_current: Number.isFinite(threshCurrent) ? threshCurrent : undefined,
      }, "serial");
      return;
    }

    const status = parts.slice(4).join(",").trim();
    if (!status) return;

    applySerialFrame({
      timestamp_ms: Number.isFinite(timestampMs) ? timestampMs : undefined,
      current_a: current,
      vibration_raw: vibrationRawValue,
      vibration_rms: vibrationRmsValue,
      status,
    }, "serial");
  }

  async function disconnectSerial() {
    serialAutoReconnectRef.current = false;
    serialRecoveringRef.current = false;
    serialReconnectAttemptRef.current = 0;
    disconnectingRef.current = true;
    clearSerialStaleTimeout();
    clearSerialReconnectTimer();
    setSerialStreamStale(false);
    await releaseSerialTransport(true);

    setSerialConnected(false);
    disconnectingRef.current = false;
  }

  async function readSerialLoop(port: BrowserSerialPort) {
    const reader = port.readable?.getReader();
    if (!reader) {
      setSerialError(l("Port série non lisible.", "Serial port is not readable.", "المنفذ التسلسلي غير قابل للقراءة."));
      if (serialAutoReconnectRef.current) {
        setSerialStreamStale(true);
        setSerialError(null);
        setSerialNote(l(
          "Port serie indisponible, reprise automatique en cours...",
          "Serial port unavailable, automatic recovery is running...",
          "Serial port unavailable, automatic recovery is running..."
        ));
        scheduleSerialRecovery();
      } else {
        setSerialConnected(false);
      }
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
        if (serialAutoReconnectRef.current) {
          setSerialStreamStale(true);
          setSerialNote(l(
            "Flux USB interrompu, reprise automatique en cours...",
            "USB stream interrupted, automatic recovery is running...",
            "USB stream interrupted, automatic recovery is running..."
          ));
          return;
        }
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
        clearSerialStaleTimeout();
        try {
          await port.close();
        } catch {
          // Ignore close failure.
        }
        portRef.current = null;
        if (serialAutoReconnectRef.current) {
          setSerialConnected(true);
          setSerialStreamStale(true);
          setSerialError(null);
          setSerialNote(l(
            "Flux USB interrompu, reprise automatique en cours...",
            "USB stream interrupted, automatic recovery is running...",
            "USB stream interrupted, automatic recovery is running..."
          ));
          scheduleSerialRecovery();
        } else {
          setSerialStreamStale(false);
          setSerialConnected(false);
        }
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

    stopBenchDemo({ clearNote: true });
    setSerialError(null);
    serialAutoReconnectRef.current = false;
    serialRecoveringRef.current = false;
    serialReconnectAttemptRef.current = 0;
    bufferRef.current = "";
    resetSerialSeries();

    try {
      const port = await serialApi.requestPort();
      await port.open({ baudRate: 115200 });
      portRef.current = port;
      selectedPortRef.current = port;
      serialAutoReconnectRef.current = true;
      serialRecoveringRef.current = false;
      serialReconnectAttemptRef.current = 0;
      setSerialConnected(true);
      setSerialStreamStale(false);
      setSerialNote(null);
      void readSerialLoop(port);
    } catch (error) {
      serialAutoReconnectRef.current = false;
      serialRecoveringRef.current = false;
      selectedPortRef.current = null;
      setSerialConnected(false);
      setSerialError(error instanceof Error ? error.message : l("Connexion série annulée.", "Serial connection cancelled.", "تم إلغاء الاتصال التسلسلي."));
    }
  }

  const liveSourceLabel = activeFeedSource === "serial"
    ? l("USB série", "USB serial", "USB تسلسلي")
    : activeFeedSource === "demo"
      ? l("USB série", "USB serial", "USB تسلسلي")
      : lastFrameSource === "demo"
        ? l("Dernière trame USB", "Last USB frame", "آخر إطار USB")
        : serialSensors
          ? l("Dernière trame USB", "Last USB frame", "آخر إطار USB")
          : apiConnected
            ? l("API / MQTT", "API / MQTT", "API / MQTT")
            : l("Aucune source", "No source", "لا يوجد مصدر");

  const liveSourceSub = activeFeedSource === "serial"
    ? l("Flux direct depuis le port série USB", "Direct feed from the USB serial port", "تغذية مباشرة من منفذ USB التسلسلي")
    : activeFeedSource === "demo"
      ? l(
          "Flux direct des mesures du capteur de courant et du capteur de vibration via USB serie.",
          "Direct current-sensor and vibration-sensor feed over USB serial.",
          "تدفق مباشر لقياسات حساس التيار وحساس الاهتزاز عبر USB التسلسلي."
        )
      : lastFrameSource === "demo"
        ? l(
            "Dernière mesure USB conservée après l'arrêt du flux.",
            "Last USB measurement kept after the feed stopped.",
            "تم الاحتفاظ بآخر قياس USB بعد توقف التدفق."
          )
        : serialSensors
          ? l("Dernière mesure conservée après déconnexion USB", "Last measurement kept after the USB disconnect", "تم الاحتفاظ بآخر قياس بعد فصل USB")
          : l("Bascule automatique vers l'API si aucun flux USB", "Falls back to API when no USB feed is active", "تبديل تلقائي إلى API عند غياب تدفق USB");

  const sampleCountSub = isCalibrating && calibrationProgressLabel
      ? `${l("Calibration", "Calibration", "المعايرة")}: ${calibrationProgressLabel}`
      : l("Compteur de lignes CSV valides lues sur USB", "Count of valid CSV lines read over USB", "عدد أسطر CSV الصحيحة المقروءة عبر USB");

  const liveSourceLabelSafe = serialConnected
    ? l("USB fige", "USB stalled", "USB متوقف")
    : liveSourceLabel;

  const liveSourceSubSafe = serialConnected && serialStreamStale
    ? l(
        "Plus de nouvelles trames USB. Les cartes au-dessus montrent la derniere mesure recue.",
        "No new USB frames are arriving. The cards above show the last measurement that was received.",
        "لا تصل إطارات USB جديدة. البطاقات أعلاه تعرض آخر قياس تم استقباله."
      )
    : liveSourceSub;

  const sampleCountSubSafe = serialConnected && serialStreamStale
    ? l(
        "Compteur fige: le navigateur ne recoit plus de nouvelle ligne CSV valide.",
        "Counter frozen: the browser is no longer receiving a new valid CSV line.",
        "العداد متوقف: المتصفح لم يعد يستقبل سطرا جديدا صالحا من CSV."
      )
    : sampleCountSub;

  const liveSourceLabelFinal = serialConnected
    ? l("USB serie", "USB serial", "USB serial")
    : liveSourceLabelSafe;

  const liveSourceSubFinal = serialConnected && serialStreamStale
    ? l(
        "USB toujours connecte, mais aucune nouvelle ligne CSV valide n'arrive pour le moment.",
        "USB is still connected, but no new valid CSV line is arriving right now.",
        "USB is still connected, but no new valid CSV line is arriving right now."
      )
    : liveSourceSubSafe;

  const sampleCountSubFinal = serialConnected && serialStreamStale
    ? l(
        "Compteur en pause: aucune nouvelle ligne CSV valide pour le moment.",
        "Counter paused: no new valid CSV line right now.",
        "Counter paused: no new valid CSV line right now."
      )
    : sampleCountSubSafe;

  const livePanels = [
    {
      key: "vibration",
      title: l("Capteur vibration - MPU6050", "Vibration sensor - MPU6050", "حساس الاهتزاز - MPU6050"),
      label: l("MPU6050 / Vibration RMS", "MPU6050 / Vibration RMS", "MPU6050 / اهتزاز RMS"),
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
      state: isCalibrating ? "calibrating" as const : vibrationAboveThreshold ? "anomaly" as const : "normal" as const,
      stateLabel: isCalibrating
        ? l("Calibration", "Calibration", "معايرة")
        : vibrationAboveThreshold
          ? l("Seuil depasse", "Threshold exceeded", "تم تجاوز العتبة")
          : l("Sous seuil", "Below threshold", "تحت العتبة"),
      detail: isCalibrating
        ? calibrationSummary || l("Construction de la baseline vibration.", "Building the vibration baseline.", "يتم بناء خط اساس الاهتزاز.")
        : formatMetricComparison("vibration_rms", vibrationRms, vibrationThreshold, VIBRATION_UNIT, 2),
      waiting: l("Connectez l'ESP32 pour alimenter ce graphe en direct.", "Connect the ESP32 to drive this chart live.", "قم بتوصيل ESP32 لتغذية هذا الرسم مباشرة.")
    },
    {
      key: "current",
      title: l("Capteur courant - ACS712 5A", "Current sensor - ACS712 5A", "حساس التيار - ACS712 5A"),
      label: l("ACS712 5A / Courant moteur", "ACS712 5A / Motor current", "ACS712 5A / تيار المحرك"),
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
      state: isCalibrating ? "calibrating" as const : currentAboveThreshold ? "anomaly" as const : "normal" as const,
      stateLabel: isCalibrating
        ? l("Calibration", "Calibration", "معايرة")
        : currentAboveThreshold
          ? l("Seuil depasse", "Threshold exceeded", "تم تجاوز العتبة")
          : l("Sous seuil", "Below threshold", "تحت العتبة"),
      detail: isCalibrating
        ? calibrationSummary || l("Construction de la baseline courant.", "Building the current baseline.", "يتم بناء خط اساس التيار.")
        : formatMetricComparison("current_a", currentA, currentThreshold, CURRENT_UNIT, 3),
      waiting: l("Le courant du capteur de courant apparaitra ici des reception serie.", "Current-sensor reading will appear here once serial data arrives.", "ستظهر قراءة مستشعر التيار هنا عند وصول البيانات التسلسلية.")
    },
  ];

  const livePanelsSafe = livePanels.map((panel) => {
    if (!(serialConnected && serialStreamStale && (panel.value === null || panel.value === undefined))) {
      return panel;
    }

    return {
      ...panel,
      state: "idle" as const,
      stateLabel: l("Flux coupe", "Feed stopped", "توقف التدفق"),
      detail: l(
        "Le flux USB s'est arrete. Cette vue montre seulement les derniers points recus.",
        "The USB feed stopped. This view now only shows the last points that were received.",
        "توقف تدفق USB. هذا الرسم يعرض فقط آخر النقاط المستلمة."
      ),
    };
  });

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
                "La page affiche les mesures live du capteur de courant et du capteur de vibration, avec ACS712 5A + MPU6050, dans le meme format de jauges et de courbes que le tableau de bord.",
                "The page displays the live current-sensor and vibration-sensor measurements, with ACS712 5A + MPU6050, in the same gauges-and-charts format as the dashboard.",
                "تعرض الصفحة القياسات الحية لحساس التيار وحساس الاهتزاز، مع ACS712 5A وMPU6050، بنفس تنسيق العدادات والمنحنيات الموجود في لوحة القيادة."
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className={`rounded-lg border px-3 py-1.5 ${liveConnected ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
                {demoConnected
                  ? l("ESP32 connecté en USB", "ESP32 connected over USB", "ESP32 متصل عبر USB")
                  : serialConnected
                    ? l("ESP32 connecté en USB", "ESP32 connected over USB", "ESP32 متصل عبر USB")
                    : l("Aucune session live active", "No live session active", "لا توجد جلسة حية نشطة")}
              </span>
              <span className={`rounded-lg border px-3 py-1.5 ${serialApi ? "border-primary/30 bg-primary/10 text-primary" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
                {serialApi
                  ? l("Web Serial disponible", "Web Serial available", "Web Serial متاح")
                  : l("Utilisez Chrome/Edge sur localhost", "Use Chrome/Edge on localhost", "استخدم Chrome/Edge على localhost")}
              </span>
              <span className="rounded-lg border border-border bg-muted px-3 py-1.5">
                {l("Capteurs courant + vibration: ACS712 5A + MPU6050", "Current + vibration sensors: ACS712 5A + MPU6050", "حساسا التيار والاهتزاز: ACS712 5A + MPU6050")}
              </span>
              <span className="rounded-lg border border-border bg-muted px-3 py-1.5">
                {l("Baud rate attendu: 115200", "Expected baud rate: 115200", "معدل البود المتوقع: 115200")}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {demoConnected ? (
              <>
                <Button onClick={() => void startBenchDemo()}>
                  {l("Reconnecter l'ESP32", "Reconnect ESP32", "إعادة توصيل ESP32")}
                </Button>
                <Button variant="destructive" onClick={() => stopBenchDemo({ clearNote: true })}>
                  {l("Déconnecter l'ESP32", "Disconnect ESP32", "فصل ESP32")}
                </Button>
              </>
            ) : serialConnected ? (
              <Button variant="destructive" onClick={() => void disconnectSerial()}>
                {l("Déconnecter l'ESP32", "Disconnect ESP32", "فصل ESP32")}
              </Button>
            ) : (
              <>
                <Button onClick={() => void startBenchDemo()}>
                  {l("Connecter l'ESP32", "Connect ESP32", "توصيل ESP32")}
                </Button>
                {showManualSerialOption && (
                  <Button variant="outline" onClick={() => void connectSerial()} disabled={!serialApi}>
                    {l("Utiliser le port série réel", "Use real serial port", "استخدام المنفذ التسلسلي الحقيقي")}
                  </Button>
                )}
              </>
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
            <strong className="text-foreground">{l("Console série:", "Serial console:", "وحدة التحكم التسلسلية:")}</strong> {serialNote}
          </div>
        )}

        {serialConnected && serialStreamStale && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
            {l(
              "Le flux USB s'est arrete. Si le compteur pkt et l'heure du dernier paquet ne bougent plus, l'ESP32 n'envoie plus de nouvelles lignes serie.",
              "The USB feed stopped. If the pkt counter and last-packet time are no longer moving, the ESP32 is no longer sending new serial lines.",
              "توقف تدفق USB. إذا لم يعد عداد pkt ووقت آخر حزمة يتحركان، فهذا يعني أن ESP32 لم يعد يرسل أسطر Serial جديدة."
            )}
          </div>
        )}

        {currentFlatlineHint && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
            {l(
              "Le graphe courant trace directement la colonne current_a envoyee par l'ESP32. Si la vibration bouge mais que current_a reste a 0.000 A, le probleme vient en general du montage ACS712 ou du firmware: verifier OUT -> 10k -> GPIO35 avec 20k vers GND, verifier IP+/IP- en serie avec le moteur, et verifier que la sensibilite choisie correspond bien a un module ACS712 5A.",
              "The current chart plots the current_a column exactly as sent by the ESP32. If vibration moves but current_a stays at 0.000 A, the issue is usually on the ACS712 setup or firmware side: verify OUT -> 10k -> GPIO35 with 20k to GND, verify IP+/IP- are in series with the motor, and make sure the selected sensitivity matches an ACS712 5A module.",
              "The current chart plots the current_a column exactly as sent by the ESP32. If vibration moves but current_a stays at 0.000 A, the issue is usually on the ACS712 setup or firmware side: verify OUT -> 10k -> GPIO35 with 20k to GND, verify IP+/IP- are in series with the motor, and make sure the selected sensitivity matches an ACS712 5A module."
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          icon={<Cpu className="w-5 h-5" />}
          label={l("Source active", "Active source", "المصدر النشط")}
          value={<span className="text-2xl leading-tight">{liveSourceLabelFinal}</span>}
          sub={liveSourceSubFinal}
          variant={liveConnected ? "green" : serialSensors || apiConnected ? "blue" : "warn"}
        />
        <KpiCard
          icon={<Activity className="w-5 h-5" />}
          label={l("Échantillons reçus", "Samples received", "العينات المستلمة")}
          value={<>{sampleCount}<span className="text-base opacity-40"> pkt</span></>}
          sub={sampleCountSubFinal}
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
        <div className="section-title mb-4">{l("Courant et vibration en direct", "Live current and vibration", "التيار والاهتزاز مباشرة")}</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {livePanelsSafe.map((panel) => (
            <div key={panel.key} className="bg-card border border-border rounded-2xl p-5 shadow-premium card-premium">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <span style={{ color: panel.color }}>{panel.icon}</span>
                    <span>{panel.title}</span>
                  </div>
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {panel.label}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold" style={{ color: panel.color }}>
                      {panel.value !== null && panel.value !== undefined ? panel.value.toFixed(panel.digits) : "—"}
                    </span>
                    <span className="text-sm text-muted-foreground">{panel.unit}</span>
                  </div>
                </div>
                <Badge variant="outline" className={cn("w-fit px-3 py-1 text-[11px] font-semibold tracking-[0.18em]", statusBadgeClasses(panel.state))}>
                  {panel.stateLabel}
                </Badge>
              </div>

              <div className="mt-6 flex justify-center">
                <div className="w-full max-w-[250px]">
                  <SVGGauge value={panel.value ?? 0} max={panel.max} color={panel.color} label="" unit={panel.unit} />
                </div>
              </div>

              <div className="mt-5 mb-4 flex flex-wrap gap-2">
                <Badge variant="outline" className="border-primary/20 bg-primary/5 px-2.5 py-1 text-[10px] text-primary">
                  {panel.baselineLabel}: {panel.baseline !== null && panel.baseline !== undefined ? `${panel.baseline.toFixed(panel.digits)} ${panel.unit}` : "—"}
                </Badge>
                {panel.threshold !== undefined ? (
                  <Badge variant="outline" className="border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[10px] text-destructive">
                    {panel.thresholdLabel}: {panel.threshold.toFixed(panel.digits)} {panel.unit}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-border bg-muted px-2.5 py-1 text-[10px] text-muted-foreground">
                    {l("Seuil apres calibration", "Threshold after calibration", "العتبة بعد المعايرة")}
                  </Badge>
                )}
              </div>

              {panel.history.length >= 2 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={panel.history} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id={`esp-focus-${panel.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={panel.color} stopOpacity={0.55} />
                        <stop offset="70%" stopColor={panel.color} stopOpacity={0.16} />
                        <stop offset="100%" stopColor={panel.color} stopOpacity={0} />
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
                      domain={[0, panel.max]}
                      tick={{ fill: "hsl(215,12%,55%)", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(value: number) => panel.max < 10 ? value.toFixed(1) : `${Math.round(value)}`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(220,18%,10%)",
                        border: "1px solid hsl(220,14%,20%)",
                        borderRadius: "10px",
                        fontSize: "11px",
                        color: "hsl(215,12%,55%)",
                      }}
                      labelStyle={{ color: panel.color, fontWeight: 600 }}
                      formatter={(value: number | string) => [`${Number(value).toFixed(panel.digits)} ${panel.unit}`, panel.label]}
                    />
                    {panel.baseline !== null && panel.baseline !== undefined && (
                      <ReferenceLine
                        y={panel.baseline}
                        ifOverflow="extendDomain"
                        stroke={panel.color}
                        strokeDasharray="4 4"
                        strokeOpacity={0.45}
                        label={{
                          value: `${l("Baseline", "Baseline", "خط الأساس")} ${panel.baseline.toFixed(panel.digits)}`,
                          position: "insideTopLeft",
                          fill: panel.color,
                          fontSize: 10,
                        }}
                      />
                    )}
                    {panel.threshold !== undefined && (
                      <>
                        <ReferenceArea
                          y1={panel.threshold}
                          y2={panel.max}
                          ifOverflow="extendDomain"
                          fill="#e04060"
                          fillOpacity={0.08}
                        />
                        <ReferenceLine
                          y={panel.threshold}
                          ifOverflow="extendDomain"
                          stroke="#e04060"
                          strokeDasharray="5 5"
                          strokeWidth={2}
                          strokeOpacity={0.95}
                          label={{
                            value: `${l("Seuil", "Threshold", "العتبة")} ${panel.threshold.toFixed(panel.digits)}`,
                            position: "insideTopRight",
                            fill: "#e04060",
                            fontSize: 10,
                          }}
                        />
                      </>
                    )}
                    {panel.threshold !== undefined && panel.history
                      .filter((point, index, history) => index > 0 && history[index - 1].value <= panel.threshold && point.value > panel.threshold)
                      .map((point) => (
                        <ReferenceLine
                          key={`${panel.key}-${point.time}`}
                          x={point.time}
                          stroke="#e04060"
                          strokeDasharray="3 3"
                          strokeOpacity={0.55}
                        />
                      ))}
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={panel.color}
                      strokeWidth={3}
                      fill={`url(#esp-focus-${panel.key})`}
                      activeDot={{ r: 5, fill: panel.color, stroke: "#fff", strokeWidth: 2 }}
                      dot={(props: { cx?: number; cy?: number; index?: number }) => {
                        if (panel.threshold === undefined || props.cx === undefined || props.cy === undefined || props.index === undefined) {
                          return null;
                        }

                        const point = panel.history[props.index];
                        if (!point || point.value <= panel.threshold) return null;

                        const previousPoint = props.index > 0 ? panel.history[props.index - 1] : null;
                        const isCrossing = !previousPoint || previousPoint.value <= panel.threshold;
                        if (!isCrossing) return null;

                        return (
                          <circle
                            cx={props.cx}
                            cy={props.cy}
                            r={6}
                            fill="#ffffff"
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
                  {panel.waiting}
                </div>
              )}

              <div className="mt-4 rounded-xl border border-border/70 bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                {panel.detail}
              </div>
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
    </div>
  );
}
