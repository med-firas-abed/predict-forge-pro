import { useState, useEffect, useRef } from "react";
import { Play, Square, Activity, RefreshCw, RotateCcw } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

export function SimulatorPage() {
  const { lang } = useApp();
  const l = (fr: string, en: string, ar: string) => lang === "fr" ? fr : lang === "en" ? en : ar;

  const [simStatus, setSimStatus] = useState<{ running: boolean; tick: number; speed: number; machines: Record<string, unknown> } | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simSpeed, setSimSpeed] = useState(60);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSimStatus = async () => {
    try {
      const data = await apiFetch<{ running: boolean; tick: number; speed: number; machines: Record<string, unknown> }>("/simulator/status");
      setSimStatus(data);
      return data;
    } catch {
      setSimStatus(null);
      return null;
    }
  };

  useEffect(() => {
    fetchSimStatus();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (simStatus?.running) {
      pollRef.current = setInterval(fetchSimStatus, 3000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [simStatus?.running]);

  const startSim = async (reset = false) => {
    setSimLoading(true);
    try {
      await apiFetch<Record<string, unknown>>(`/simulator/start?speed=${simSpeed}${reset ? '&reset=true' : ''}`, { method: "POST" });
      toast.success(l("Simulateur démarré", "Simulator started", "بدأ المحاكي"));
      setTimeout(fetchSimStatus, 500);
    } catch (e: unknown) {
      const msg = (e as Error).message;
      if (msg.includes("409")) {
        toast.info(l("Simulateur déjà en cours", "Simulator already running", "المحاكي يعمل بالفعل"));
        await fetchSimStatus();
      } else {
        toast.error(msg);
      }
    } finally {
      setSimLoading(false);
    }
  };

  const stopSim = async () => {
    setSimLoading(true);
    try {
      await apiFetch("/simulator/stop", { method: "POST" });
      toast.success(l("Simulateur arrêté", "Simulator stopped", "توقف المحاكي"));
      await fetchSimStatus();
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setSimLoading(false);
    }
  };

  return (
    <div>
      <div className="space-y-5">
        <div className="bg-card border border-border rounded-2xl p-6 shadow-premium">
          <div className="flex items-center gap-3 mb-5">
            <Activity className="w-5 h-5 text-primary" />
            <h2 className="section-title">{l("Contrôle du simulateur", "Simulator Control", "التحكم في المحاكاة")}</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-5">
            {l(
              "Dégradation cumulative : chaque session reprend où la précédente s'est arrêtée. Profil, charge et bruit aléatoires à chaque lancement.",
              "Cumulative degradation: each session picks up where the previous one left off. Random profile, load, and noise on every run.",
              "تدهور تراكمي: كل جلسة تستمر من حيث انتهت الجلسة السابقة. ملف تعريف وحمل وضوضاء عشوائية في كل تشغيل."
            )}
          </p>
          <div className="flex items-center gap-3 mb-5">
            <button
              onClick={() => startSim()}
              disabled={simLoading || (simStatus?.running === true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-success/10 text-success border border-success/20 hover:bg-success/20 transition-colors disabled:opacity-50"
            >
              <Play className="w-4 h-4" /> {l("Démarrer", "Start", "بدء")}
            </button>
            <button
              onClick={stopSim}
              disabled={simLoading || !simStatus?.running}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 transition-colors disabled:opacity-50"
            >
              <Square className="w-4 h-4" /> {l("Arrêter", "Stop", "إيقاف")}
            </button>
            <button
              onClick={() => startSim(true)}
              disabled={simLoading || (simStatus?.running === true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" /> {l("Réinitialiser", "Reset", "إعادة تعيين")}
            </button>
            <button
              onClick={fetchSimStatus}
              disabled={simLoading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-surface-3 border border-border text-foreground hover:bg-border-subtle transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${simStatus?.running ? "animate-spin" : ""}`} /> {l("Rafraîchir", "Refresh", "تحديث")}
            </button>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{l("Vitesse", "Speed", "السرعة")}:</span>
              <select
                value={simSpeed}
                onChange={e => setSimSpeed(Number(e.target.value))}
                disabled={simStatus?.running === true}
                className="bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
              >
                <option value={60}>×60 — {l("Temps réel", "Real-time", "وقت حقيقي")}</option>
                <option value={500}>×500 — {l("Rapide", "Fast", "سريع")}</option>
                <option value={5000}>×5000 — {l("Batch", "Batch", "دفعة")}</option>
              </select>
            </div>
          </div>

          {/* Status */}
          <div className="bg-surface-3 rounded-xl p-4 border border-border mb-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">{l("État", "State", "الحالة")}:</span>{" "}
                <span className={`font-semibold ${simStatus?.running ? "text-success" : "text-muted-foreground"}`}>
                  {simStatus?.running ? l("En cours ●", "Running ●", "● قيد التشغيل") : l("Arrêté", "Stopped", "متوقف")}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Tick:</span>{" "}
                <span className="font-semibold text-foreground">{simStatus?.tick ?? 0}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{l("Vitesse", "Speed", "السرعة")}:</span>{" "}
                <span className="font-semibold text-foreground">×{simStatus?.speed ?? 60}</span>
              </div>
            </div>
          </div>

          {/* Per-machine live data */}
          {simStatus?.machines && Object.keys(simStatus.machines).length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {l("Données temps réel par machine", "Live data per machine", "بيانات حية لكل آلة")}
              </div>
              {Object.entries(simStatus.machines).map(([code, data]) => {
                const d = data as Record<string, unknown>;
                const hi = d.hi_smooth as number | undefined;
                const simHI = d.simulated_hi as number | undefined;
                const tick = d.current as number | undefined;
                const total = d.total as number | undefined;
                const pct = total && tick ? Math.round((tick / total) * 100) : 0;
                return (
                  <div key={code} className="bg-card border border-border rounded-lg p-3 flex items-center gap-4">
                    <span className="text-sm font-bold text-foreground w-16">{code}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground">Progress:</span>
                        <div className="flex-1 h-2 bg-surface-3 rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-foreground font-medium w-10 text-right">{pct}%</span>
                      </div>
                    </div>
                    {hi !== undefined && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        hi >= 0.6 ? "bg-success/10 text-success" : hi >= 0.3 ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"
                      }`}>
                        HI: {(hi * 100).toFixed(1)}%
                      </span>
                    )}
                    {simHI !== undefined && hi === undefined && (
                      <span className="text-xs text-muted-foreground">
                        Ground truth: {(simHI * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
