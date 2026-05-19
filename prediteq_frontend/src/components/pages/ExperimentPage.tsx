import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Loader2, TerminalSquare, Zap } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { SVGGauge } from "@/components/industrial/SVGGauge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  HISTORY_POINTS,
  LED_BLINK_OFF_MS,
  LED_BLINK_ON_MS,
  SERIAL_BAUD_RATE,
  VIBRATION_ALARM_OFF,
  VIBRATION_ALARM_ON,
} from "./firmwareConstants";

const FRAME_RE = /I\s*=\s*(-?\d+)\s*mA\s*\|\s*Vib\s*=\s*(-?\d+\.\d+)\s*g\s*\|\s*\|a\|\s*=\s*(-?\d+\.\d+)\s*g/;
const MAX_CONSOLE_LINES = 200;

type ConnectionState = "idle" | "connecting" | "connected" | "error";
type ConsoleTone = "note" | "command" | "status";

interface SensorPoint {
  time: string;
  value: number;
}

interface ConsoleEntry {
  id: number;
  text: string;
  tone: ConsoleTone;
}

interface ParsedMeasurement {
  currentMa: number;
  vibrationG: number;
  accelG: number;
}

interface SerialPortInfoLike {
  usbVendorId?: number;
  usbProductId?: number;
}

interface SerialPortLike {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  getInfo?(): SerialPortInfoLike;
}

interface SerialNavigatorLike {
  requestPort(): Promise<SerialPortLike>;
}

interface NavigatorWithSerial extends Navigator {
  serial?: SerialNavigatorLike;
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Erreur série inconnue.";
}

function isPopupCancellation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "NotFoundError"
  );
}

function parseMeasurement(line: string): ParsedMeasurement | null {
  const match = line.match(FRAME_RE);
  if (!match) return null;

  const currentMa = Number.parseInt(match[1], 10);
  const vibrationG = Number.parseFloat(match[2]);
  const accelG = Number.parseFloat(match[3]);

  if (![currentMa, vibrationG, accelG].every(Number.isFinite)) {
    return null;
  }

  return { currentMa, vibrationG, accelG };
}

function formatAxisTime(timestamp: number) {
  const date = new Date(timestamp);
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const tenths = Math.floor(date.getMilliseconds() / 100);
  return `${minutes}:${seconds}.${tenths}`;
}

function pushPoint(prev: SensorPoint[], value: number, timestamp: number) {
  return [...prev, { time: formatAxisTime(timestamp), value }].slice(-HISTORY_POINTS);
}

function toneClasses(tone: ConsoleTone) {
  if (tone === "status") return "text-emerald-600 dark:text-emerald-400";
  if (tone === "command") return "text-primary";
  return "text-muted-foreground";
}

function statusClasses(state: ConnectionState) {
  if (state === "connected") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (state === "error") {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }
  if (state === "connecting") {
    return "border-primary/30 bg-primary/10 text-primary";
  }
  return "border-border bg-muted/40 text-muted-foreground";
}

function LedPill({
  label,
  active,
  color,
  blink,
}: {
  label: string;
  active: boolean;
  color: string;
  blink?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-full border px-4 py-2.5 text-sm font-medium transition-all duration-200",
        active ? "border-border bg-card text-foreground" : "border-border bg-muted/30 text-muted-foreground",
      )}
    >
      <span
        className="h-3.5 w-3.5 rounded-full border border-white/40 shadow-sm"
        style={{
          backgroundColor: active ? color : "hsl(220, 14%, 72%)",
          boxShadow: active ? `0 0 14px ${color}` : "none",
          animation: active && blink ? "esp-led-blink 200ms step-end infinite" : undefined,
        }}
      />
      <span
        style={active && blink ? { animation: "esp-led-blink 200ms step-end infinite" } : undefined}
      >
        {label}
      </span>
    </div>
  );
}

function ChartPanel({
  data,
  color,
  digits,
  domain,
  waitingMessage,
  unit,
  threshold,
  connected,
}: {
  data: SensorPoint[];
  color: string;
  digits: number;
  domain: [number, number];
  waitingMessage: string;
  unit: string;
  threshold?: number;
  connected: boolean;
}) {
  if (!connected || data.length < 2) {
    return (
      <div className="mt-5 h-[220px] flex items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-4 text-center text-sm text-muted-foreground">
        {waitingMessage}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`exp-fill-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.5} />
            <stop offset="70%" stopColor={color} stopOpacity={0.16} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
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
          domain={domain}
          tick={{ fill: "hsl(215,12%,55%)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(value: number) => value.toFixed(digits)}
        />
        <Tooltip
          contentStyle={{
            background: "hsl(220,18%,10%)",
            border: "1px solid hsl(220,14%,20%)",
            borderRadius: "10px",
            fontSize: "11px",
            color: "hsl(215,12%,55%)",
          }}
          labelStyle={{ color, fontWeight: 600 }}
          formatter={(value: number | string) => [`${Number(value).toFixed(digits)} ${unit}`, "Mesure"]}
        />
        {threshold !== undefined ? (
          <ReferenceLine
            y={threshold}
            stroke="#e04060"
            strokeDasharray="5 5"
            strokeWidth={2}
            label={{
              value: `${threshold.toFixed(2)} ${unit}`,
              position: "insideTopRight",
              fill: "#e04060",
              fontSize: 10,
            }}
          />
        ) : null}
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={3}
          fill={`url(#exp-fill-${color.replace("#", "")})`}
          isAnimationActive
          animationDuration={200}
          activeDot={{ r: 5, fill: color, stroke: "#fff", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function MetricCard({
  connected,
  title,
  subtitle,
  icon,
  color,
  value,
  displayDigits,
  displayUnit,
  gaugeValue,
  gaugeMax,
  badgeLabel,
  badgeClassName,
  history,
  chartDigits,
  chartUnit,
  waitingMessage,
  footer,
  threshold,
  chartDomain,
  alarmBlink,
}: {
  connected: boolean;
  title: string;
  subtitle: string;
  icon: ReactNode;
  color: string;
  value: number | null;
  displayDigits: number;
  displayUnit: string;
  gaugeValue: number | null;
  gaugeMax: number;
  badgeLabel: string;
  badgeClassName: string;
  history: SensorPoint[];
  chartDigits: number;
  chartUnit: string;
  waitingMessage: string;
  footer: string;
  threshold?: number;
  chartDomain: [number, number];
  alarmBlink?: boolean;
}) {
  return (
    <div className={cn("bg-card border border-border rounded-2xl p-5 shadow-premium transition-opacity duration-200", !connected && "opacity-75")}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <span style={{ color }}>{icon}</span>
            <span>{title}</span>
          </div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{subtitle}</div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold tracking-tight" style={{ color }}>
              {value === null ? "—" : value.toFixed(displayDigits)}
            </span>
            <span className="text-sm text-muted-foreground">{displayUnit}</span>
          </div>
        </div>

        <Badge
          variant="outline"
          className={cn("w-fit px-3 py-1 text-[11px] font-semibold tracking-[0.18em]", badgeClassName)}
          style={alarmBlink ? { animation: "esp-led-blink 200ms step-end infinite" } : undefined}
        >
          {badgeLabel}
        </Badge>
      </div>

      <div className="mt-5 flex justify-center">
        <div className="w-full max-w-[250px] transition-opacity duration-200">
          <SVGGauge value={gaugeValue} max={gaugeMax} color={color} label="" unit={displayUnit} />
        </div>
      </div>

      <ChartPanel
        data={history}
        color={color}
        digits={chartDigits}
        domain={chartDomain}
        waitingMessage={waitingMessage}
        unit={chartUnit}
        threshold={threshold}
        connected={connected}
      />

      <div className="mt-4 rounded-xl border border-border/70 bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        {footer}
      </div>
    </div>
  );
}

export function ExperimentPage() {
  const serialApi = typeof navigator !== "undefined"
    ? (navigator as NavigatorWithSerial).serial ?? null
    : null;

  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("Non connecté");
  const [currentMa, setCurrentMa] = useState<number | null>(null);
  const [vibrationG, setVibrationG] = useState<number | null>(null);
  const [, setAccelG] = useState<number | null>(null);
  const [vibrationAlarm, setVibrationAlarm] = useState(false);
  const [vibrationHistory, setVibrationHistory] = useState<SensorPoint[]>([]);
  const [currentHistory, setCurrentHistory] = useState<SensorPoint[]>([]);
  const [consoleLines, setConsoleLines] = useState<ConsoleEntry[]>([]);
  const [portDetails, setPortDetails] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<"c" | "m" | "a" | null>(null);

  const portRef = useRef<SerialPortLike | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const disconnectingRef = useRef(false);
  const alarmStateRef = useRef(false);
  const consoleIdRef = useRef(0);

  const appendConsole = useCallback((text: string, tone: ConsoleTone = "note") => {
    setConsoleLines((prev) => {
      const next = [...prev, { id: ++consoleIdRef.current, text, tone }];
      return next.slice(-MAX_CONSOLE_LINES);
    });
  }, []);

  const resetMeasurements = useCallback(() => {
    alarmStateRef.current = false;
    setCurrentMa(null);
    setVibrationG(null);
    setAccelG(null);
    setVibrationAlarm(false);
    setVibrationHistory([]);
    setCurrentHistory([]);
  }, []);

  const closeSerialResources = useCallback(async () => {
    disconnectingRef.current = true;

    const reader = readerRef.current;
    readerRef.current = null;
    if (reader) {
      try {
        await reader.cancel();
      } catch {
        // Ignore read cancellation errors while closing.
      }
      try {
        reader.releaseLock();
      } catch {
        // Ignore already-released readers.
      }
    }

    const writer = writerRef.current;
    writerRef.current = null;
    if (writer) {
      try {
        writer.releaseLock();
      } catch {
        // Ignore already-released writers.
      }
    }

    const port = portRef.current;
    portRef.current = null;
    if (port) {
      try {
        await port.close();
      } catch {
        // Ignore close errors on unplugged ports.
      }
    }
  }, []);

  const handleMeasurement = useCallback((measurement: ParsedMeasurement) => {
    const now = Date.now();
    const nextAlarm = alarmStateRef.current
      ? measurement.vibrationG >= VIBRATION_ALARM_OFF
      : measurement.vibrationG >= VIBRATION_ALARM_ON;

    alarmStateRef.current = nextAlarm;
    setCurrentMa(measurement.currentMa);
    setVibrationG(measurement.vibrationG);
    setAccelG(measurement.accelG);
    setVibrationAlarm(nextAlarm);
    setVibrationHistory((prev) => pushPoint(prev, Number(measurement.vibrationG.toFixed(3)), now));
    setCurrentHistory((prev) => pushPoint(prev, measurement.currentMa, now));
  }, []);

  const handleLine = useCallback((line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const measurement = parseMeasurement(trimmed);
    if (measurement) {
      handleMeasurement(measurement);
      return;
    }

    appendConsole(trimmed, "note");
  }, [appendConsole, handleMeasurement]);

  const disconnectSerial = useCallback(async (options?: { reason?: string; clearConsole?: boolean }) => {
    await closeSerialResources();
    resetMeasurements();

    if (options?.clearConsole) {
      setConsoleLines([]);
    } else if (options?.reason) {
      appendConsole(options.reason, "status");
    }

    setPendingCommand(null);
    setPortDetails(null);
    setConnectionState("idle");
    setConnectionError(null);
    setStatusText("Non connecté");
    disconnectingRef.current = false;
  }, [appendConsole, closeSerialResources, resetMeasurements]);

  const readLoop = useCallback(async (port: SerialPortLike) => {
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (port.readable && !disconnectingRef.current) {
        const reader = port.readable.getReader();
        readerRef.current = reader;

        try {
          while (!disconnectingRef.current) {
            const { value, done } = await reader.read();
            if (done) break;
            if (!value) continue;

            buffer += decoder.decode(value, { stream: true });
            let newlineIndex = buffer.indexOf("\n");
            while (newlineIndex >= 0) {
              const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
              buffer = buffer.slice(newlineIndex + 1);
              handleLine(line);
              newlineIndex = buffer.indexOf("\n");
            }
          }
        } finally {
          try {
            reader.releaseLock();
          } catch {
            // Ignore release errors after disconnect.
          }
          if (readerRef.current === reader) {
            readerRef.current = null;
          }
        }

        break;
      }

      if (!disconnectingRef.current) {
        await disconnectSerial({ reason: "[Déconnecté]" });
      }
    } catch (error) {
      if (!disconnectingRef.current) {
        await closeSerialResources();
        resetMeasurements();
        setPendingCommand(null);
        setPortDetails(null);
        setConnectionState("error");
        setConnectionError(extractErrorMessage(error));
        setStatusText("Erreur série");
        disconnectingRef.current = false;
      }
    }
  }, [closeSerialResources, disconnectSerial, handleLine, resetMeasurements]);

  const connectSerial = useCallback(async () => {
    if (!serialApi) {
      setConnectionState("error");
      setConnectionError("Utilise Chrome ou Edge");
      setStatusText("Web Serial non supporté");
      return;
    }

    setConnectionError(null);
    setConnectionState("connecting");
    setStatusText("Choisis ton ESP32 dans la popup Chrome…");

    try {
      const port = await serialApi.requestPort();
      await port.open({ baudRate: SERIAL_BAUD_RATE });

      if (!port.writable) {
        throw new Error("Le port série est ouvert mais n'autorise pas l'écriture.");
      }

      const writer = port.writable.getWriter();
      portRef.current = port;
      writerRef.current = writer;
      disconnectingRef.current = false;

      resetMeasurements();
      setConsoleLines([]);
      appendConsole("[Connecté]", "status");
      setConnectionState("connected");
      setStatusText("Connecté — réception directe via USB");

      const info = port.getInfo?.();
      if (info?.usbVendorId !== undefined || info?.usbProductId !== undefined) {
        const vid = info.usbVendorId !== undefined ? `VID 0x${info.usbVendorId.toString(16)}` : null;
        const pid = info.usbProductId !== undefined ? `PID 0x${info.usbProductId.toString(16)}` : null;
        setPortDetails([vid, pid].filter(Boolean).join(" • "));
      } else {
        setPortDetails(`Web Serial • ${SERIAL_BAUD_RATE} bauds`);
      }

      void readLoop(port);
    } catch (error) {
      await closeSerialResources();
      resetMeasurements();

      if (isPopupCancellation(error)) {
        setConnectionState("idle");
        setConnectionError(null);
        setStatusText("Non connecté");
        disconnectingRef.current = false;
        return;
      }

      setConnectionState("error");
      setConnectionError(extractErrorMessage(error));
      setStatusText("Connexion impossible");
      disconnectingRef.current = false;
    }
  }, [appendConsole, closeSerialResources, readLoop, resetMeasurements, serialApi]);

  const sendCommand = useCallback(async (cmd: "c" | "m" | "a") => {
    const writer = writerRef.current;
    if (!writer) return;

    try {
      setPendingCommand(cmd);
      await writer.write(new TextEncoder().encode(`${cmd}\n`));
      appendConsole(`> ${cmd}`, "command");
    } catch (error) {
      await disconnectSerial();
      setConnectionState("error");
      setConnectionError(extractErrorMessage(error));
      setStatusText("Erreur série");
    } finally {
      setPendingCommand(null);
    }
  }, [appendConsole, disconnectSerial]);

  useEffect(() => {
    return () => {
      void closeSerialResources();
    };
  }, [closeSerialResources]);

  const isConnected = connectionState === "connected";
  const browserSupported = Boolean(serialApi);
  const blinkCycleMs = LED_BLINK_ON_MS + LED_BLINK_OFF_MS;
  const blinkVisiblePct = (LED_BLINK_ON_MS / blinkCycleMs) * 100;

  const vibrationDomain = useMemo<[number, number]>(() => {
    const maxValue = Math.max(
      VIBRATION_ALARM_ON,
      vibrationG ?? 0,
      ...vibrationHistory.map((point) => point.value),
      0.12,
    );
    return [0, Number((maxValue * 1.15).toFixed(3))];
  }, [vibrationG, vibrationHistory]);

  const currentDomain = useMemo<[number, number]>(() => {
    const values = currentHistory.map((point) => point.value);
    const minValue = Math.min(0, currentMa ?? 0, ...values);
    const maxValue = Math.max(0, currentMa ?? 0, ...values, 100);
    const range = Math.max(maxValue - minValue, 40);
    const padding = Math.max(range * 0.12, 10);
    return [Math.floor(minValue - padding), Math.ceil(maxValue + padding)];
  }, [currentHistory, currentMa]);

  const vibrationGaugeMax = useMemo(() => {
    const maxValue = Math.max(
      VIBRATION_ALARM_ON,
      vibrationG ?? 0,
      ...vibrationHistory.map((point) => point.value),
      0.4,
    );
    return Number((maxValue * 1.15).toFixed(2));
  }, [vibrationG, vibrationHistory]);

  const currentGaugeMax = useMemo(() => {
    const maxValue = Math.max(
      Math.abs(currentMa ?? 0),
      ...currentHistory.map((point) => Math.abs(point.value)),
      150,
    );
    return Math.ceil(maxValue * 1.1);
  }, [currentHistory, currentMa]);

  const connectionButtonLabel = connectionState === "connecting"
    ? "Connexion…"
    : isConnected
      ? "Déconnecter l'ESP32"
      : "🔌 Connecter mon ESP32";

  return (
    <div className="space-y-6">
      <style>{`
        @keyframes esp-led-blink {
          0%, ${blinkVisiblePct.toFixed(3)}% { opacity: 1; }
          ${(blinkVisiblePct + 0.001).toFixed(3)}%, 100% { opacity: 0.18; }
        }
      `}</style>

      <div className="space-y-4">
        <div className="section-title">Expérience ESP32</div>

        {!browserSupported ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-5 py-4 text-sm text-destructive shadow-premium">
            Utilise Chrome ou Edge
          </div>
        ) : null}

        <div className="bg-card border border-border rounded-2xl p-5 shadow-premium">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
            <Button
              type="button"
              onClick={() => void (isConnected ? disconnectSerial({ reason: "[Déconnecté]" }) : connectSerial())}
              disabled={!browserSupported || connectionState === "connecting"}
              className={cn(
                "h-[60px] w-full xl:flex-1 text-[18px] font-semibold",
                isConnected
                  ? "bg-gradient-to-r from-emerald-500 to-emerald-700 hover:from-emerald-600 hover:to-emerald-800"
                  : "bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800",
              )}
            >
              {connectionState === "connecting" ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {connectionButtonLabel}
                </>
              ) : (
                connectionButtonLabel
              )}
            </Button>

            <div className={cn("min-w-[260px] rounded-xl border px-4 py-3 text-sm", statusClasses(connectionState))}>
              <div className="font-semibold">{statusText}</div>
              <div className="mt-1 text-xs opacity-90">
                {portDetails ?? `${SERIAL_BAUD_RATE} bauds • USB direct`}
              </div>
            </div>
          </div>

          {connectionError ? (
            <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {connectionError}
            </div>
          ) : null}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 shadow-premium">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">État des LEDs</div>
            <div className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Miroir de l’alarme vibration du firmware
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <LedPill label="LED verte" active={isConnected && !vibrationAlarm} color="#10b981" />
            <LedPill label="LED rouge" active={isConnected && vibrationAlarm} color="#ef4444" blink />
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 shadow-premium">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => void sendCommand("c")}
            disabled={!isConnected || pendingCommand !== null}
            className={!isConnected ? "cursor-not-allowed opacity-50" : ""}
          >
            Recalibrer ACS (c)
          </Button>
          <Button
            variant="outline"
            onClick={() => void sendCommand("m")}
            disabled={!isConnected || pendingCommand !== null}
            className={!isConnected ? "cursor-not-allowed opacity-50" : ""}
          >
            Recalibrer MPU (m)
          </Button>
          <Button
            onClick={() => void sendCommand("a")}
            disabled={!isConnected || pendingCommand !== null}
            className={!isConnected ? "cursor-not-allowed opacity-50" : ""}
          >
            Tout (a)
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MetricCard
          connected={isConnected}
          title="Capteur vibration — MPU6050"
          subtitle="Vib envoyée par l’ESP32"
          icon={<Activity className="h-4 w-4" />}
          color={vibrationAlarm ? "#ef4444" : "#38bdf8"}
          value={vibrationG}
          displayDigits={3}
          displayUnit="g"
          gaugeValue={vibrationG}
          gaugeMax={vibrationGaugeMax}
          badgeLabel={isConnected ? (vibrationAlarm ? "ALARME" : "Sous seuil") : "En attente"}
          badgeClassName={
            isConnected
              ? vibrationAlarm
                ? "border-red-500/35 bg-red-500/10 text-red-600 dark:text-red-400"
                : "border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "border-border bg-muted text-muted-foreground"
          }
          history={vibrationHistory}
          chartDigits={3}
          chartUnit="g"
          waitingMessage={isConnected ? "En attente des premières trames vibration…" : "En attente de connexion…"}
          footer={
            vibrationG === null
              ? "La vibration apparaîtra ici dès la première trame série."
              : `Vib = ${vibrationG.toFixed(3)} g. Hystérésis alarme: ${VIBRATION_ALARM_ON.toFixed(2)} g à l’entrée, ${VIBRATION_ALARM_OFF.toFixed(2)} g à la sortie.`
          }
          threshold={VIBRATION_ALARM_ON}
          chartDomain={vibrationDomain}
          alarmBlink={isConnected && vibrationAlarm}
        />

        <MetricCard
          connected={isConnected}
          title="Capteur courant — ACS712-5A"
          subtitle="I envoyée par l’ESP32"
          icon={<Zap className="h-4 w-4" />}
          color="#fbbf24"
          value={currentMa}
          displayDigits={0}
          displayUnit="mA"
          gaugeValue={currentMa === null ? null : Math.max(currentMa, 0)}
          gaugeMax={currentGaugeMax}
          badgeLabel={isConnected ? "Affichage seul" : "En attente"}
          badgeClassName={
            isConnected
              ? "border-border bg-muted text-muted-foreground"
              : "border-border bg-muted text-muted-foreground"
          }
          history={currentHistory}
          chartDigits={0}
          chartUnit="mA"
          waitingMessage={isConnected ? "En attente des premières trames courant…" : "En attente de connexion…"}
          footer={
            currentMa === null
              ? "Le courant apparaîtra ici dès la première trame série."
              : `I = ${currentMa.toFixed(0)} mA reçu du firmware. Cette carte reste en affichage seul.`
          }
          chartDomain={currentDomain}
        />
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 shadow-premium">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <TerminalSquare className="h-4 w-4 text-primary" />
          <span>Console firmware</span>
        </div>
        <div className="max-h-[260px] overflow-y-auto rounded-xl border border-border bg-muted/30 p-4 font-mono text-xs leading-6">
          {consoleLines.length > 0 ? (
            <div className="space-y-1 whitespace-pre-wrap break-words">
              {consoleLines.map((line) => (
                <div key={line.id} className={toneClasses(line.tone)}>
                  {line.text}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground">
              {isConnected ? "En attente des lignes texte du firmware…" : "La console apparaîtra après connexion."}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
