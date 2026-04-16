import { useMemo, useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Download, DollarSign, Wrench, Package, ClipboardList, Brain, Loader2 } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCouts } from "@/hooks/useCouts";
import { KpiCard } from "@/components/industrial/KpiCard";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

export function CostsPage() {
  const { t } = useApp();
  const { currentUser } = useAuth();
  const { couts: rows, isLoading: loading } = useCouts(currentUser?.machineId);

  const exportCSV = () => {
    const header = "Machine,Mois,Année,Main d'oeuvre,Pièces,Total\n";
    const csv = rows.map(r => `${r.machineCode},${r.mois},${r.annee},${r.mainOeuvre},${r.pieces},${r.total}`).join("\n");
    const blob = new Blob([header + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `couts_maintenance_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("costs.exportCSV"));
  };

  const monthlyData = useMemo(() => {
    const map = new Map<string, { month: string; labor: number; parts: number }>();
    rows.forEach(r => {
      const key = String(r.mois).padStart(2, '0');
      const entry = map.get(key) || { month: key, labor: 0, parts: 0 };
      entry.labor += r.mainOeuvre;
      entry.parts += r.pieces;
      map.set(key, entry);
    });
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [rows]);

  const machineCostData = useMemo(() => {
    const map = new Map<string, { name: string; labor: number; parts: number }>();
    rows.forEach(r => {
      const key = r.machineCode || '?';
      const entry = map.get(key) || { name: key, labor: 0, parts: 0 };
      entry.labor += r.mainOeuvre;
      entry.parts += r.pieces;
      map.set(key, entry);
    });
    return Array.from(map.values());
  }, [rows]);

  const totalBudget = rows.reduce((s, r) => s + r.total, 0);
  const totalLabor = rows.reduce((s, r) => s + r.mainOeuvre, 0);
  const totalParts = rows.reduce((s, r) => s + r.pieces, 0);

  // AI cost estimation from planner
  interface AiCostEntry { machine_code: string; nom: string; cout_estime: number; risk_level: string }
  const [aiCosts, setAiCosts] = useState<AiCostEntry[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  const loadAiEstimates = async () => {
    setAiLoading(true);
    try {
      const risk = await apiFetch<{ machine_code: string; nom: string; hi: number | null; rul_days: number | null; risk_level: string }[]>("/planner/status");
      // Estimate cost based on risk level and historical averages
      const avgCostPerMachine = new Map<string, number>();
      rows.forEach(r => {
        avgCostPerMachine.set(r.machineCode, (avgCostPerMachine.get(r.machineCode) || 0) + r.total);
      });
      const estimates = risk.map(r => {
        const historical = avgCostPerMachine.get(r.machine_code) || 0;
        const monthlyAvg = historical / Math.max(rows.filter(row => row.machineCode === r.machine_code).length, 1);
        // Risk multiplier: critique = 3x, surveillance = 1.5x, ok = 0.5x
        const multiplier = r.risk_level === "critique" ? 3 : r.risk_level === "surveillance" ? 1.5 : 0.5;
        return {
          machine_code: r.machine_code,
          nom: r.nom,
          cout_estime: Math.round(monthlyAvg * multiplier),
          risk_level: r.risk_level,
        };
      });
      setAiCosts(estimates);
    } catch {
      // silent
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => { loadAiEstimates(); }, [rows.length]);

  const totalAiEstimate = aiCosts.reduce((s, c) => s + c.cout_estime, 0);

  // Merge historical + AI estimate per machine for the combined chart
  const combinedMachineData = useMemo(() => {
    const map = new Map<string, { name: string; labor: number; parts: number; aiEstimate: number }>();
    rows.forEach(r => {
      const key = r.machineCode || '?';
      const entry = map.get(key) || { name: key, labor: 0, parts: 0, aiEstimate: 0 };
      entry.labor += r.mainOeuvre;
      entry.parts += r.pieces;
      map.set(key, entry);
    });
    aiCosts.forEach(c => {
      const entry = map.get(c.machine_code) || { name: c.machine_code, labor: 0, parts: 0, aiEstimate: 0 };
      entry.aiEstimate = c.cout_estime;
      map.set(c.machine_code, entry);
    });
    return Array.from(map.values());
  }, [rows, aiCosts]);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="section-title">{t("costs.title")}</div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-surface-3 border border-border text-foreground hover:bg-border-subtle transition-all">
            <Download className="w-3.5 h-3.5" /> {t("costs.exportCSV")}
          </button>
        </div>
      </div>

      {/* Cost KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard icon={<DollarSign className="w-5 h-5" />} label={t("costs.totalBudget")} value={<>{totalBudget.toLocaleString()} <span className="text-sm opacity-40">TND</span></>} sub="" variant="blue" />
        <KpiCard icon={<Wrench className="w-5 h-5" />} label={t("costs.labor")} value={<>{totalLabor.toLocaleString()} <span className="text-sm opacity-40">TND</span></>} sub="" variant="green" />
        <KpiCard icon={<Package className="w-5 h-5" />} label={t("costs.parts")} value={<>{totalParts.toLocaleString()} <span className="text-sm opacity-40">TND</span></>} sub="" variant="warn" />
        <KpiCard icon={<ClipboardList className="w-5 h-5" />} label={t("costs.interventions")} value={String(rows.length)} sub="" variant="blue" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-foreground">{t("costs.monthly")}</h3>
            <p className="text-xs text-muted-foreground mt-1">{t("costs.laborVsParts")}</p>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: 'hsl(215,12%,55%)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'hsl(215,12%,55%)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'hsl(220,18%,10%)', border: '1px solid hsl(220,14%,20%)', borderRadius: '8px', fontSize: '11px', color: 'hsl(215,12%,55%)' }}
                labelStyle={{ color: 'hsl(224,76%,53%)' }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', color: 'hsl(215,12%,55%)' }} />
              <Bar dataKey="labor" name={t("costs.labor")} fill="#4b8b9b" radius={4} />
              <Bar dataKey="parts" name={t("costs.parts")} fill="hsl(191, 50%, 42%)" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-foreground">{t("costs.perMachine")}</h3>
            <p className="text-xs text-muted-foreground mt-1">Historique vs Estimation IA prochaine intervention</p>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={combinedMachineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'hsl(215,12%,55%)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'hsl(215,12%,55%)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v / 1000}k`} />
              <Tooltip
                contentStyle={{ background: 'hsl(220,18%,10%)', border: '1px solid hsl(220,14%,20%)', borderRadius: '8px', fontSize: '11px', color: 'hsl(215,12%,55%)' }}
                formatter={(value: number) => [`${value.toLocaleString()} TND`, '']}
              />
              <Legend wrapperStyle={{ fontSize: '11px', color: 'hsl(215,12%,55%)' }} />
              <Bar dataKey="labor" name={t("costs.labor")} fill="#4b8b9b" radius={4} />
              <Bar dataKey="parts" name={t("costs.parts")} fill="#d4915a" radius={4} />
              <Bar dataKey="aiEstimate" name="Estimation IA" fill="hsl(var(--primary))" radius={4} opacity={0.7} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* AI Cost Estimation Summary */}
      <div className="bg-card border border-border rounded-2xl p-5 mt-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Brain className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">Estimation IA — Prochaine intervention</h3>
            <p className="text-xs text-muted-foreground">Basée sur le niveau de risque actuel × moyenne historique des coûts</p>
          </div>
          {aiLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : (
            <div className="text-right">
              <div className="text-lg font-bold text-primary">{totalAiEstimate.toLocaleString()} <span className="text-xs opacity-50">TND</span></div>
              <div className="text-[0.6rem] text-muted-foreground">Total estimé</div>
            </div>
          )}
        </div>

        {!aiLoading && aiCosts.length > 0 && (
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
            {aiCosts.map((c) => (
              <div key={c.machine_code} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  c.risk_level === "critique" ? "bg-destructive" :
                  c.risk_level === "surveillance" ? "bg-warning" : "bg-success"
                }`} />
                <span className="text-xs text-muted-foreground">{c.machine_code}</span>
                <span className="text-xs font-semibold text-foreground">{c.cout_estime.toLocaleString()} TND</span>
                <span className={`text-[0.6rem] px-1.5 py-0.5 rounded-full ${
                  c.risk_level === "critique" ? "bg-destructive/10 text-destructive" :
                  c.risk_level === "surveillance" ? "bg-warning/10 text-warning" :
                  "bg-success/10 text-success"
                }`}>{c.risk_level}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
