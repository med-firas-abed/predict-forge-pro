import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useMachines } from "@/hooks/useMachines";
import { DiagnosticsPanel } from "@/components/industrial/DiagnosticsPanel";

// ─────────────────────────────────────────────────────────────────────────────
// DiagnosticsPage — Pronostics RUL avec intervalle de confiance + diagnostics
// experts (règles ISO/IEC/IEEE) + explication SHAP. Réutilise le même pattern
// de sélecteur machine que DashboardPage.tsx afin de rester cohérent.
// ─────────────────────────────────────────────────────────────────────────────

export function DiagnosticsPage() {
  const { t } = useApp();
  const { machines } = useMachines();
  const [selectedId, setSelectedId] = useState(machines[0]?.id || "");
  const selected = machines.find((m) => m.id === selectedId) || machines[0];

  return (
    <div className="space-y-6">
      {/* Machine Selector — identique au DashboardPage pour une UX homogène */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-premium">
        <div className="flex items-center gap-4">
          <div className="section-title flex-1">{t("dash.selectMachine")}</div>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="bg-surface-3 border border-border rounded-xl px-4 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id} — {m.name}
              </option>
            ))}
          </select>
        </div>

        {selected && (
          <div className="mt-4 text-sm text-muted-foreground">
            {selected.name} · {selected.city}
          </div>
        )}
      </div>

      {/* Main diagnostics panel — toutes les cartes RUL/diagnose/SHAP */}
      <DiagnosticsPanel machineCode={selected?.id ?? null} />
    </div>
  );
}
