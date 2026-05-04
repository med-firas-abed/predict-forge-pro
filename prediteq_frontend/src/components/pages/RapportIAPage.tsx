import { useCallback, useEffect, useState } from "react";
import { Clock, Download, Eye, FileText, Loader2, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useMachines } from "@/hooks/useMachines";
import { apiBinary, apiBlob, apiFetch, apiStream } from "@/lib/api";
import { repairText } from "@/lib/repairText";

interface SavedReport {
  id: string;
  machine_code: string | null;
  period: string;
  lang: string;
  titre: string;
  created_at: string;
}

type ReportPeriod = "7d" | "15d" | "30d";
type ReportAudience = "jury" | "dual" | "technician";

interface RapportIAPageProps {
  embedded?: boolean;
}

export function RapportIAPage({ embedded = false }: RapportIAPageProps) {
  const { lang } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const isAdmin = currentUser?.role === "admin";
  const { machines } = useMachines(currentUser?.machineId);
  const [selectedId, setSelectedId] = useState(() =>
    currentUser?.role === "admin" ? "all" : currentUser?.machineCode || "",
  );
  const [period, setPeriod] = useState<ReportPeriod>("7d");
  const [reportLang, setReportLang] = useState<"fr" | "en" | "ar">(lang);
  const [reportAudience, setReportAudience] = useState<ReportAudience>("dual");
  const [reportText, setReportText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [history, setHistory] = useState<SavedReport[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [viewingReport, setViewingReport] = useState<string | null>(null);
  const l = (fr: string, en: string, ar: string) =>
    repairText(lang === "fr" ? fr : lang === "en" ? en : ar);

  const periodOptions: { value: ReportPeriod; label: string }[] = [
    { value: "7d", label: l("7 jours", "7 days", "7 ايام") },
    { value: "15d", label: l("15 jours", "15 days", "15 يوما") },
    { value: "30d", label: l("30 jours", "30 days", "30 يوما") },
  ];
  const audienceOptions: { value: ReportAudience; label: string }[] = [
    { value: "jury", label: l("Jury", "Jury", "Jury") },
    { value: "dual", label: l("Les deux", "Both", "Both") },
    { value: "technician", label: l("Technicien", "Technician", "Technician") },
  ];

  const getPeriodLabel = (value: string) =>
    ({
      "7d": periodOptions[0].label,
      "15d": periodOptions[1].label,
      "30d": periodOptions[2].label,
    })[value] ?? value;

  useEffect(() => {
    if (!isAdmin && currentUser?.machineCode) {
      setSelectedId(currentUser.machineCode);
    }
  }, [currentUser?.machineCode, isAdmin]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const data = await apiFetch<SavedReport[]>("/report/history");
      setHistory(data);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
    const intervalId = setInterval(() => void loadHistory(), 5_000);
    return () => clearInterval(intervalId);
  }, [loadHistory]);

  const generateReport = async () => {
    const machineCode = isAdmin ? (selectedId === "all" ? null : selectedId) : currentUser?.machineCode || null;
    setGenerating(true);
    setReportText("");

    try {
      const stream = await apiStream("/report/auto/generate", {
        machine_id: machineCode,
        period,
        lang: reportLang,
        audience: reportAudience,
      });
      if (!stream) {
        throw new Error("No stream");
      }

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let text = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        text += decoder.decode(value, { stream: true });
        setReportText(repairText(text));
      }

      await loadHistory();
      toast.success(l("Rapport genere", "Report generated", "تم انشاء التقرير"));
    } catch {
      toast.error(
        l(
          "Erreur lors de la generation du rapport",
          "Failed to generate the report",
          "فشل انشاء التقرير",
        ),
      );
    } finally {
      setGenerating(false);
    }
  };

  const exportPdf = async () => {
    const machineCode = isAdmin ? (selectedId === "all" ? null : selectedId) : currentUser?.machineCode || null;
    setExporting(true);

    try {
      const blob = await apiBlob("/report/auto/pdf", {
        machine_id: machineCode,
        period,
        lang: reportLang,
        audience: reportAudience,
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `rapport_${machineCode || "all"}_${period}_${new Date().toISOString().slice(0, 10)}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      await loadHistory();
      toast.success(l("PDF telecharge", "PDF downloaded", "تم تنزيل ملف PDF"));
    } catch {
      toast.error(l("Erreur lors de l'export PDF", "Failed to export PDF", "فشل تصدير PDF"));
    } finally {
      setExporting(false);
    }
  };

  const viewSavedReport = async (reportId: string) => {
    setViewingReport(reportId);
    try {
      const data = await apiFetch<{ contenu: string }>(`/report/history/${reportId}`);
      setReportText(repairText(data.contenu));
    } catch {
      toast.error(
        l("Erreur lors du chargement du rapport", "Failed to load the report", "فشل تحميل التقرير"),
      );
    } finally {
      setViewingReport(null);
    }
  };

  const downloadSavedPdf = async (reportId: string) => {
    try {
      const blob = await apiBinary(`/report/history/${reportId}/pdf`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `rapport_${reportId.slice(0, 8)}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(l("Erreur lors du telechargement", "Download failed", "فشل التنزيل"));
    }
  };

  return (
    <div className="space-y-6">
      <div className="section-title">{l("Rapport IA", "AI Report", "تقرير الذكاء الاصطناعي")}</div>

      {isAdmin && !embedded && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                {l("Agent IA separe", "Separate AI planner", "مخطط الذكاء الاصطناعي المنفصل")}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {l(
                  "Le rapport reste centré sur l'analyse et l'export. Le planificateur IA vit maintenant sur sa propre page.",
                  "The report page now stays focused on analysis and export. The AI planner now lives on its own page.",
                  "اصبحت صفحة التقرير مخصصة للتحليل والتصدير، بينما اصبح مخطط الذكاء الاصطناعي في صفحة مستقلة.",
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/planner")}
              className="inline-flex items-center justify-center rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-surface-3"
            >
              {l("Ouvrir l'agent IA", "Open AI planner", "افتح مخطط الذكاء الاصطناعي")}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.9fr]">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-premium">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-foreground">
                {l("Générer un rapport intelligent", "Generate a smart report", "انشئ تقريرا ذكيا")}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {l(
                  "Sélectionnez la machine, la période puis lancez la génération. L'export PDF reste disponible à tout moment.",
                  "Select the machine and the period, then start generation. PDF export remains available at any time.",
                  "اختر الالة والفترة ثم ابدأ الانشاء. يبقى تصدير PDF متاحا في اي وقت.",
                )}
              </p>
            </div>
          </div>

          <div className={`mb-6 grid grid-cols-1 gap-4 ${isAdmin ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
            {isAdmin && (
              <div>
                <label className="mb-2 block text-xs font-semibold text-muted-foreground">
                  {l("Machine", "Machine", "الالة")}
                </label>
                <select
                  value={selectedId}
                  onChange={(event) => setSelectedId(event.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-3 px-3.5 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="all">{l("Toutes les machines", "All machines", "كل الالات")}</option>
                  {machines.map((machine) => (
                    <option key={machine.id} value={machine.id}>
                      {machine.id} - {machine.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="mb-2 block text-xs font-semibold text-muted-foreground">
                {l("Periode", "Period", "الفترة")}
              </label>
              <div className="flex gap-2">
                {periodOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPeriod(option.value)}
                    className={`flex-1 rounded-lg border px-3 py-2.5 text-xs font-semibold transition-all ${
                      period === option.value
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border text-secondary-foreground hover:bg-surface-3"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-muted-foreground">
                {l("Langue", "Language", "اللغة")}
              </label>
              <div className="flex gap-2">
                {(["fr", "en", "ar"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setReportLang(value)}
                    className={`flex-1 rounded-lg border px-3 py-2.5 text-xs font-semibold transition-all ${
                      reportLang === value
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border text-secondary-foreground hover:bg-surface-3"
                    }`}
                  >
                    {value.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-muted-foreground">
                {l("Audience", "Audience", "Audience")}
              </label>
              <div className="flex gap-2">
                {audienceOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setReportAudience(option.value)}
                    className={`flex-1 rounded-lg border px-3 py-2.5 text-xs font-semibold transition-all ${
                      reportAudience === option.value
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border text-secondary-foreground hover:bg-surface-3"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void generateReport()}
              disabled={generating}
              className="flex min-w-[220px] items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {l("Générer le rapport", "Generate report", "انشئ التقرير")}
            </button>
            <button
              type="button"
              onClick={() => void exportPdf()}
              disabled={exporting}
              className="flex items-center gap-2 rounded-lg border border-border px-5 py-3 text-sm font-semibold text-foreground transition-all hover:bg-surface-3 disabled:opacity-50"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {l("Exporter PDF", "Export PDF", "صدر PDF")}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-premium">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">
              {l("Historique des rapports", "Report history", "سجل التقارير")}
            </h3>
          </div>

          {loadingHistory ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {l("Chargement...", "Loading...", "جار التحميل...")}
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {l(
                "Aucun rapport sauvegarde pour le moment.",
                "No saved reports yet.",
                "لا توجد تقارير محفوظة بعد.",
              )}
            </p>
          ) : (
            <div className="max-h-[340px] space-y-2 overflow-y-auto">
              {history.map((report) => (
                <div key={report.id} className="rounded-lg border border-border/50 bg-surface-3 px-4 py-3">
                  <div className="text-sm font-medium text-foreground">{repairText(report.titre)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {new Date(report.created_at).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", {
                      dateStyle: "medium",
                    })}{" "}
                    · {getPeriodLabel(report.period)}
                    {report.machine_code ? ` · ${report.machine_code}` : ""}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void viewSavedReport(report.id)}
                      disabled={viewingReport === report.id}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground transition-all hover:bg-card disabled:opacity-50"
                    >
                      {viewingReport === report.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                      {l("Voir", "View", "عرض")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void downloadSavedPdf(report.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground transition-all hover:bg-card"
                    >
                      <Download className="h-3.5 w-3.5" />
                      PDF
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {reportText && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-premium">
          <div className="mb-3 text-sm font-semibold text-foreground">
            {l("Contenu du rapport", "Report content", "محتوى التقرير")}
          </div>
          <pre className="max-h-[520px] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {repairText(reportText)}
          </pre>
        </div>
      )}
    </div>
  );
}


