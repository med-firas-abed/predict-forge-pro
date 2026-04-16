import { useState, useEffect } from "react";
import { FileText, Download, Loader2, Clock, Eye } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useMachines } from "@/hooks/useMachines";
import { apiFetch, apiStream, apiBlob } from "@/lib/api";
import { toast } from "sonner";

interface SavedReport {
  id: string;
  machine_code: string | null;
  period: string;
  lang: string;
  titre: string;
  created_at: string;
}

export function RapportIAPage() {
  const { t, lang } = useApp();
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const { machines } = useMachines(currentUser?.machineId);
  const [selectedId, setSelectedId] = useState(() => currentUser?.machineId ? machines[0]?.id || "" : "all");
  const [period, setPeriod] = useState<"weekly" | "monthly">("weekly");
  const [reportLang, setReportLang] = useState<"fr" | "en" | "ar">(lang);
  const [reportText, setReportText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [history, setHistory] = useState<SavedReport[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [viewingReport, setViewingReport] = useState<string | null>(null);

  // Load report history on mount
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const data = await apiFetch<SavedReport[]>("/report/history");
      setHistory(data);
    } catch {
      // History endpoint may not be available yet
    } finally {
      setLoadingHistory(false);
    }
  };

  const generateReport = async () => {
    const code = selectedId === "all" ? null : selectedId;

    setGenerating(true);
    setReportText("");

    try {
      // Use free auto/generate endpoint (no API key needed)
      const stream = await apiStream("/report/auto/generate", {
        machine_id: code,
        period,
        lang: reportLang,
      });
      if (!stream) throw new Error("No stream");

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let text = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setReportText(text);
      }

      toast.success(t("rapport.generated"));
    } catch {
      toast.error("Erreur lors de la génération du rapport");
    } finally {
      setGenerating(false);
    }
  };

  const exportPdf = async () => {
    const code = selectedId === "all" ? null : selectedId;

    setExporting(true);
    try {
      // Use free auto/pdf endpoint
      const blob = await apiBlob("/report/auto/pdf", {
        machine_id: code,
        period,
        lang: reportLang,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const machinePart = code || "all";
      a.download = `rapport_${machinePart}_${period}_${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF téléchargé");
    } catch {
      toast.error("Erreur lors de l'export PDF");
    } finally {
      setExporting(false);
    }
  };

  const viewSavedReport = async (reportId: string) => {
    setViewingReport(reportId);
    try {
      const data = await apiFetch<{ contenu: string }>(`/report/history/${reportId}`);
      setReportText(data.contenu);
    } catch {
      toast.error("Erreur lors du chargement du rapport");
    } finally {
      setViewingReport(null);
    }
  };

  const downloadSavedPdf = async (reportId: string) => {
    try {
      const { supabase } = await import("@/lib/supabase");
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_API_URL ?? ""}/report/history/${reportId}/pdf`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok) throw new Error("PDF download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rapport_${reportId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Erreur lors du téléchargement");
    }
  };

  return (
    <div className="space-y-6">
      <div className="section-title">{t("rapport.title")}</div>

      <div className="bg-card border border-border rounded-2xl p-6 shadow-premium">
        <div className={`grid grid-cols-1 ${isAdmin ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4 mb-6`}>
          {/* Machine selector — admin only */}
          {isAdmin && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-2 block">{t("dash.selectMachine")}</label>
              <select
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                className="w-full bg-surface-3 border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="all">{t("rapport.allMachines")}</option>
                {machines.map(m => <option key={m.id} value={m.id}>{m.id} — {m.name}</option>)}
              </select>
            </div>
          )}

          {/* Period selector */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-2 block">{t("rapport.period")}</label>
            <div className="flex gap-2">
              <button onClick={() => setPeriod("weekly")} className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-semibold border transition-all ${period === "weekly" ? "bg-primary/10 text-primary border-primary/30" : "border-border text-secondary-foreground hover:bg-surface-3"}`}>
                {t("rapport.weekly")}
              </button>
              <button onClick={() => setPeriod("monthly")} className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-semibold border transition-all ${period === "monthly" ? "bg-primary/10 text-primary border-primary/30" : "border-border text-secondary-foreground hover:bg-surface-3"}`}>
                {t("rapport.monthly")}
              </button>
            </div>
          </div>

          {/* Language selector */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-2 block">{t("rapport.reportLang")}</label>
            <div className="flex gap-2">
              <button onClick={() => setReportLang("fr")} className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-semibold border transition-all ${reportLang === "fr" ? "bg-primary/10 text-primary border-primary/30" : "border-border text-secondary-foreground hover:bg-surface-3"}`}>
                FR
              </button>
              <button onClick={() => setReportLang("en")} className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-semibold border transition-all ${reportLang === "en" ? "bg-primary/10 text-primary border-primary/30" : "border-border text-secondary-foreground hover:bg-surface-3"}`}>
                EN
              </button>
              <button onClick={() => setReportLang("ar")} className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-semibold border transition-all ${reportLang === "ar" ? "bg-primary/10 text-primary border-primary/30" : "border-border text-secondary-foreground hover:bg-surface-3"}`}>
                AR
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={generateReport} disabled={generating} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-50">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} {t("rapport.generate")}
          </button>
          <button onClick={exportPdf} disabled={exporting} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold border border-border text-foreground hover:bg-surface-3 transition-all disabled:opacity-50">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} {t("rapport.exportPdf")}
          </button>
        </div>
      </div>

      {/* Report output */}
      {reportText && (
        <div className="bg-card border border-border rounded-2xl p-6 shadow-premium">
          <pre className="text-sm text-foreground whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto">
            {reportText}
          </pre>
        </div>
      )}

      {/* Report history */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">
            {reportLang === "fr" ? "Historique des rapports" : reportLang === "en" ? "Report History" : "سجل التقارير"}
          </h3>
          <span className="text-xs text-muted-foreground">
            ({reportLang === "fr" ? "auto-générés chaque lundi et 1er du mois" : reportLang === "en" ? "auto-generated every Monday & 1st of month" : "يتم إنشاؤها تلقائيًا كل إثنين وأول كل شهر"})
          </span>
        </div>

        {loadingHistory ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {reportLang === "fr" ? "Aucun rapport sauvegardé pour l'instant." : reportLang === "en" ? "No saved reports yet." : "لا توجد تقارير محفوظة بعد."}
          </p>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {history.map(r => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3 rounded-lg bg-surface-3 border border-border/50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{r.titre}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString(reportLang === "fr" ? "fr-FR" : reportLang === "ar" ? "ar-TN" : "en-US", {
                      dateStyle: "medium",
                    })}{" "}
                    — {r.period === "weekly" ? (reportLang === "fr" ? "Hebdomadaire" : reportLang === "en" ? "Weekly" : "أسبوعي") : (reportLang === "fr" ? "Mensuel" : reportLang === "en" ? "Monthly" : "شهري")}
                    {r.machine_code ? ` — ${r.machine_code}` : ""}
                  </p>
                </div>
                <div className="flex gap-2 ml-3">
                  <button
                    onClick={() => viewSavedReport(r.id)}
                    disabled={viewingReport === r.id}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-3 transition-all"
                    title={reportLang === "fr" ? "Voir" : "View"}
                  >
                    {viewingReport === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => downloadSavedPdf(r.id)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-3 transition-all"
                    title="PDF"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
