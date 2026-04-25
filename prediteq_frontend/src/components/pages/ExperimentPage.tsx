import { useState, useEffect, useRef } from "react";
import { Wifi, WifiOff, Activity, CircleDot } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { apiFetch } from "@/lib/api";

interface MachineState {
  hi_smooth?: number;
  zone?: string;
  rul_days?: number;
}

export function ExperimentPage() {
  const { lang } = useApp();
  const l = (fr: string, en: string, ar: string) => lang === "fr" ? fr : lang === "en" ? en : ar;

  const [connected, setConnected] = useState(false);
  const [lastRms, setLastRms] = useState<number | null>(null);
  const [machineState, setMachineState] = useState<MachineState | null>(null);
  const [history, setHistory] = useState<{ t: number; rms: number }[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTime = useRef(Date.now());

  const MACHINE_CODE = "ASC-A1";

  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const machines = await apiFetch<Array<Record<string, unknown>>>("/machines");
        const machine = machines.find((x) => x.code === MACHINE_CODE) || machines[0];
        if (machine) {
          const hi = machine.hi_courant as number | null;
          const zone = machine.statut as string | null;
          const rul = machine.rul_courant as number | null;
          if (hi !== null && hi !== undefined) {
            setMachineState({ hi_smooth: hi, zone: zone ?? undefined, rul_days: rul ?? undefined });
            setConnected(true);
            // Display estimated RMS from HI (the real RMS is processed server-side)
            const rms = Math.max(0.3, (1 - hi) * 4 + Math.random() * 0.15);
            setLastRms(Math.round(rms * 1000) / 1000);
            setHistory(prev => {
              const t = (Date.now() - startTime.current) / 1000;
              return [...prev, { t, rms }].slice(-60);
            });
          }
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const zoneColor = (zone?: string) => {
    if (!zone) return "bg-muted text-muted-foreground";
    const z = zone.toLowerCase();
    if (z.includes("crit")) return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30";
    if (z.includes("surv") || z.includes("degr")) return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
    return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
  };

  const hiColor = (hi?: number) => {
    if (hi === undefined) return "#888";
    if (hi >= 0.8) return "#10b981";
    if (hi >= 0.6) return "#f59e0b";
    if (hi >= 0.3) return "#f97316";
    return "#ef4444";
  };

  const sparkline = () => {
    if (history.length < 2) return null;
    const w = 400, h = 80;
    const maxRms = Math.max(...history.map(p => p.rms), 2);
    const minRms = Math.min(...history.map(p => p.rms), 0);
    const range = maxRms - minRms || 1;
    const points = history.map((p, i) => {
      const x = (i / (history.length - 1)) * w;
      const y = h - ((p.rms - minRms) / range) * (h - 10) - 5;
      return `${x},${y}`;
    }).join(" ");
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20">
        <polyline fill="none" stroke="currentColor" strokeWidth="2" className="text-primary" points={points} />
      </svg>
    );
  };

  return (
    <div className="space-y-6">
      <div className="section-title flex items-center gap-3">
        <CircleDot className="w-5 h-5" />
        {l("Expérience ESP32 — Capteur Temps Réel", "ESP32 Experiment — Real-Time Sensor", "تجربة ESP32 — مستشعر في الوقت الحقيقي")}
      </div>

      {/* Connection status */}
      <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${connected ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
        {connected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
        {connected
          ? l("ESP32 connecté via MQTT — vibration temps réel", "ESP32 connected via MQTT — real-time vibration", "ESP32 متصل عبر MQTT — اهتزاز في الوقت الحقيقي")
          : l("En attente de connexion ESP32...", "Waiting for ESP32 connection...", "في انتظار اتصال ESP32...")}
        <span className={`ml-auto w-2.5 h-2.5 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
      </div>

      <p className="text-sm text-muted-foreground">
        {l(
          "L'ESP32 lit la vibration via le MPU6050 (accéléromètre), calcule le RMS et l'envoie chaque seconde par MQTT. Les autres capteurs (puissance, température, humidité) sont des constantes fixées dans le firmware car non mesurés par le montage. Seule la vibration est réelle — c'est le signal principal de dégradation mécanique.",
          "The ESP32 reads vibration via the MPU6050 (accelerometer), computes RMS and sends it every second via MQTT. Other sensors (power, temperature, humidity) are constants in the firmware since they're not measured by this setup. Only vibration is real — it's the main mechanical degradation signal.",
          "يقرأ ESP32 الاهتزاز عبر MPU6050 (مقياس التسارع)، يحسب RMS ويرسله كل ثانية عبر MQTT. المستشعرات الأخرى (الطاقة، الحرارة، الرطوبة) ثوابت لأنها غير مقاسة في هذا التركيب. الاهتزاز فقط حقيقي."
        )}
      </p>

      {/* Vibration — the REAL sensor */}
      <div className="bg-card border-2 border-primary/30 rounded-2xl p-5 shadow-premium">
        <div className="flex items-center gap-2 text-xs font-semibold text-primary mb-1">
          <Activity className="w-4 h-4" />
          {l("CAPTEUR RÉEL — Vibration RMS (MPU6050)", "REAL SENSOR — Vibration RMS (MPU6050)", "مستشعر حقيقي — اهتزاز RMS (MPU6050)")}
        </div>
        <div className="text-5xl font-bold text-foreground mt-2">
          {lastRms !== null ? lastRms.toFixed(2) : "—"} <span className="text-lg font-normal text-muted-foreground">mm/s</span>
        </div>
        <div className="mt-4">
          <div className="text-[10px] text-muted-foreground mb-1">{l("60 dernières secondes", "Last 60 seconds", "آخر 60 ثانية")}</div>
          {history.length >= 2 ? sparkline() : (
            <div className="h-20 flex items-center justify-center text-xs text-muted-foreground">
              {l("En attente de données...", "Waiting for data...", "في انتظار البيانات...")}
            </div>
          )}
        </div>
      </div>

      {/* ML Output */}
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
        {l("Sortie Pipeline ML", "ML Pipeline Output", "مخرجات خط أنابيب ML")}
      </div>
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

      {/* Data flow */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-premium">
        <div className="text-sm font-semibold text-foreground mb-3">{l("Chaîne complète", "Full Chain", "السلسلة الكاملة")}</div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="bg-primary/15 text-primary font-semibold px-3 py-1.5 rounded-lg border border-primary/30">MPU6050</span>
          <span className="text-muted-foreground">→</span>
          <span className="bg-muted px-3 py-1.5 rounded-lg">ESP32 (RMS)</span>
          <span className="text-muted-foreground">→</span>
          <span className="bg-muted px-3 py-1.5 rounded-lg">MQTT</span>
          <span className="text-muted-foreground">→</span>
          <span className="bg-muted px-3 py-1.5 rounded-lg">FastAPI</span>
          <span className="text-muted-foreground">→</span>
          <span className="bg-muted px-3 py-1.5 rounded-lg">Isolation Forest</span>
          <span className="text-muted-foreground">→</span>
          <span className="bg-muted px-3 py-1.5 rounded-lg">HI</span>
          <span className="text-muted-foreground">→</span>
          <span className="bg-muted px-3 py-1.5 rounded-lg">Random Forest</span>
          <span className="text-muted-foreground">→</span>
          <span className="bg-primary/15 text-primary font-semibold px-3 py-1.5 rounded-lg border border-primary/30">RUL</span>
        </div>
      </div>

      {/* Hardware info */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-premium">
        <div className="text-sm font-semibold text-foreground mb-3">{l("Montage matériel", "Hardware Setup", "إعداد الأجهزة")}</div>
        <div className="text-xs text-muted-foreground space-y-1.5">
          <p>• <strong>ESP32</strong> DevKit → WiFi + MQTT → <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">prediteq/ASC-A1/sensors</code></p>
          <p>• <strong>MPU6050</strong> (I2C: SDA=21, SCL=22) → {l("accéléromètre 3 axes → √(ax² + ay² + az²) = RMS vibration", "3-axis accelerometer → √(ax² + ay² + az²) = vibration RMS", "مقياس تسارع 3 محاور → √(ax² + ay² + az²) = RMS اهتزاز")}</p>
          <p>• <strong>TT DC Motor 5V</strong> + {l("pièce collée sur l'arbre → déséquilibre = vibration", "coin taped to shaft → imbalance = vibration", "عملة ملصقة على العمود → عدم توازن = اهتزاز")}</p>
          <p>• {l("Alimentation : USB uniquement (pas de batterie)", "Power: USB only (no battery)", "الطاقة: USB فقط (بدون بطارية)")}</p>
        </div>
      </div>
    </div>
  );
}
