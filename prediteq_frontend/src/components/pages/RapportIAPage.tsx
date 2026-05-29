import { useCallback, useEffect, useState } from "react";
import { Clock, Download, Eye, FileText, Loader2, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import type { Machine } from "@/data/machines";
import { type PredictiveInsight, useFleetPredictiveInsights } from "@/hooks/useFleetPredictiveInsights";
import { useMachines } from "@/hooks/useMachines";
import { apiBinary, apiBlob, apiFetch, apiStream } from "@/lib/api";
import { safeStorageGetJson, safeStorageSet } from "@/lib/browserStorage";
import { type UiLang, getUiLocale } from "@/lib/i18n";
import { getMachinePublicLabel } from "@/lib/machinePresentation";
import { repairText } from "@/lib/repairText";

interface SavedReport {
  id: string;
  machine_code: string | null;
  period: string;
  lang: string;
  titre: string;
  created_at: string;
  contenu?: string;
  source?: "backend" | "local_fallback";
}

type ReportPeriod = "7d" | "15d" | "30d";
interface RapportIAPageProps {
  embedded?: boolean;
}

function cleanReportTitle(value: string) {
  return repairText(value).replace(
    /\s+-\s+(Vue jury|Vue technicien|Vue double|Jury view|Technician view|Dual view)(?=\s+[—-])/i,
    "",
  );
}

const REPORT_HISTORY_CACHE_KEY = "prediteq-report-history-v1";

function reportCopy(lang: UiLang, fr: string, en: string, _ar?: string) {
  return repairText(lang === "en" ? en : fr);
}

function readCachedReportHistory() {
  return safeStorageGetJson<SavedReport[]>(REPORT_HISTORY_CACHE_KEY, []);
}

function writeCachedReportHistory(reports: SavedReport[]) {
  safeStorageSet(REPORT_HISTORY_CACHE_KEY, JSON.stringify(reports));
}

function sortReportHistory(reports: SavedReport[]) {
  return [...reports].sort((left, right) => right.created_at.localeCompare(left.created_at));
}

function mergeReportHistory(remote: SavedReport[], cached: SavedReport[]) {
  const merged = new Map<string, SavedReport>();

  for (const report of cached) {
    merged.set(report.id, report);
  }

  for (const report of remote) {
    merged.set(report.id, {
      ...merged.get(report.id),
      ...report,
      source: report.source ?? "backend",
    });
  }

  return sortReportHistory([...merged.values()]);
}

function downloadReportText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildLocalReport(
  selectedMachines: Machine[],
  insights: PredictiveInsight[],
  period: ReportPeriod,
  reportLang: UiLang,
) {
  const generatedAt = new Date();
  const header = reportCopy(
    reportLang,
    "Rapport de continuité PrediTeq",
    "PrediTeq continuity report",
    "تقرير الاستمرارية PrediTeq",
  );
  const intro = reportCopy(
    reportLang,
    `Version locale de secours - periode ${period}. Le service de generation est temporairement indisponible, ce rapport reprend les derniers signaux machines deja charges dans l'application.`,
    `Local backup version - period ${period}. The report service is temporarily unavailable, so this version reuses the latest machine signals already loaded in the app.`,
    `مصدر محلي احتياطي - الفترة ${period}. محرك الذكاء الاصطناعي أو تصدير الخادم غير متاح مؤقتا، لذلك يعتمد هذا التقرير على آخر إشارات الآلات المحملة داخل التطبيق.`,
  );

  const machineBlocks = selectedMachines.map((machine) => {
    const insight = insights.find((entry) => entry.machine.id === machine.id);
    const lines = [
      `- ${reportCopy(reportLang, "Machine", "Machine", "الآلة")}: ${getMachinePublicLabel(machine)}`,
      `- ${reportCopy(reportLang, "Zone", "Zone", "المنطقة")}: ${repairText(machine.decision?.zone ?? machine.city ?? "N/A")}`,
      `- HI: ${typeof machine.hi === "number" ? `${Math.round(machine.hi * 100)}%` : "N/A"}`,
      `- RUL: ${typeof machine.rul === "number" ? `${Math.round(machine.rul)} ${reportCopy(reportLang, "j", "d")}` : "N/A"}`,
      `- ${reportCopy(reportLang, "Priorité", "Priority", "الأولوية")}: ${repairText(insight?.urgencyLabel ?? "Stable")}`,
      `- ${reportCopy(reportLang, "Action recommandée", "Recommended action", "الإجراء الموصى به")}: ${repairText(
        insight?.recommendedAction ?? machine.decision?.recommendedAction ?? "Aucune action lourde immédiate.",
      )}`,
      `- ${reportCopy(reportLang, "Preuves", "Evidence", "المؤشرات")}: ${repairText(
        insight?.evidence.slice(0, 3).join(" | ") ||
          machine.decision?.evidence?.slice(0, 3).join(" | ") ||
          reportCopy(reportLang, "Dernier signal exploitable en cache.", "Latest usable cached signal.", "آخر إشارة صالحة في الذاكرة المؤقتة."),
      )}`,
    ];

    return lines.join("\n");
  });

  return [
    header,
    `${reportCopy(reportLang, "Généré le", "Generated on", "تم الإنشاء في")} ${generatedAt.toLocaleString(getUiLocale(reportLang))}`,
    "",
    intro,
    "",
    ...machineBlocks,
  ]
    .join("\n")
    .trim();
}

export function RapportIAPage({ embedded = false }: RapportIAPageProps) {
  const { lang } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const isAdmin = currentUser?.role === "admin";
  const { machines } = useMachines(currentUser?.machineId);
  const { insights } = useFleetPredictiveInsights(machines);
  const [selectedId, setSelectedId] = useState(() =>
    currentUser?.role === "admin" ? "all" : currentUser?.machineCode || "",
  );
  const [period, setPeriod] = useState<ReportPeriod>("7d");
  const [reportLang, setReportLang] = useState<UiLang>(lang);
  const [reportText, setReportText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [history, setHistory] = useState<SavedReport[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [viewingReport, setViewingReport] = useState<string | null>(null);
  const l = (fr: string, en: string, ar: string) =>
    repairText(lang === "fr" ? fr : lang === "en" ? en : ar);
  const machineCode =
    isAdmin ? (selectedId === "all" ? null : selectedId) : currentUser?.machineCode || null;
  const selectedMachines = machines.filter((machine) =>
    machineCode ? machine.id === machineCode : true,
  );
  const localFallbackReport = buildLocalReport(
    selectedMachines,
    insights,
    period,
    reportLang,
  );

  const periodOptions: { value: ReportPeriod; label: string }[] = [
    { value: "7d", label: l("7 jours", "7 days", "7 ايام") },
    { value: "15d", label: l("15 jours", "15 days", "15 يوما") },
    { value: "30d", label: l("30 jours", "30 days", "30 يوما") },
  ];
  const languageOptions: { value: UiLang; label: string }[] = [
    { value: "fr", label: "FR" },
    { value: "en", label: "EN" },
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
      const merged = mergeReportHistory(
        data.map((report) => ({ ...report, source: report.source ?? "backend" })),
        readCachedReportHistory(),
      );
      writeCachedReportHistory(merged);
      setHistory(merged);
    } catch {
      setHistory(readCachedReportHistory());
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
    setGenerating(true);
    setReportText("");

    try {
      const stream = await apiStream("/report/auto/generate", {
        machine_id: machineCode,
        period,
        lang: reportLang,
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

      if (!repairText(text).trim()) {
        throw new Error("EMPTY_REPORT");
      }

      setReportText(repairText(text));
      await loadHistory();
      toast.success(l("Rapport genere", "Report generated", "تم انشاء التقرير"));
    } catch (error) {
      const machineTitle = machineCode
        ? getMachinePublicLabel(selectedMachines[0] ?? machineCode)
        : reportCopy(reportLang, "toute la flotte", "full fleet", "الأسطول بالكامل");
      const fallbackEntry: SavedReport = {
        id: `local-${Date.now()}`,
        machine_code: machineCode,
        period,
        lang: reportLang,
        titre: reportCopy(
          reportLang,
          `Rapport local de secours - ${machineTitle}`,
          `Local fallback report - ${machineTitle}`,
          `تقرير احتياطي محلي - ${machineTitle}`,
        ),
        created_at: new Date().toISOString(),
        contenu: localFallbackReport,
        source: "local_fallback",
      };
      const mergedHistory = mergeReportHistory(
        [fallbackEntry],
        readCachedReportHistory(),
      );

      writeCachedReportHistory(mergedHistory);
      setHistory(mergedHistory);
      setReportText(localFallbackReport);
      toast.warning(
        error instanceof Error && error.message === "EMPTY_REPORT"
          ? l(
              "Le rapport recu etait vide - une version locale a ete affichee.",
              "The returned report was empty - a local version is now displayed.",
              "The returned report was empty - a local version is now displayed.",
            )
          : l(
              "Generation indisponible - rapport local de secours affiche.",
              "Generation unavailable - local backup report displayed.",
              "تعذر التوليد من الخادم - تم عرض تقرير محلي احتياطي.",
            ),
      );
    } finally {
      setGenerating(false);
    }
  };

  const exportPdf = async () => {
    setExporting(true);

    try {
      const blob = await apiBlob("/report/auto/pdf", {
        machine_id: machineCode,
        period,
        lang: reportLang,
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
      const fallbackContent = reportText.trim() || localFallbackReport;
      downloadReportText(
        `rapport_${machineCode || "all"}_${period}_${new Date().toISOString().slice(0, 10)}.txt`,
        fallbackContent,
      );
      toast.warning(
        l(
          "Export PDF indisponible - version texte locale telechargee a la place.",
          "PDF export unavailable - a local text version was downloaded instead.",
          "تصدير PDF غير متاح - تم تنزيل نسخة نصية محلية بدلا منه.",
        ),
      );
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
      const cached = readCachedReportHistory().find((report) => report.id === reportId);
      if (cached?.contenu) {
        setReportText(repairText(cached.contenu));
        toast.warning(
          l(
            "Rapport charge depuis le cache local.",
            "Report loaded from the local cache.",
            "تم تحميل التقرير من الذاكرة المؤقتة المحلية.",
          ),
        );
      } else {
        toast.error(
          l("Erreur lors du chargement du rapport", "Failed to load the report", "فشل تحميل التقرير"),
        );
      }
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
      const cached = readCachedReportHistory().find((report) => report.id === reportId);
      if (cached?.contenu) {
        downloadReportText(`rapport_${reportId.slice(0, 8)}.txt`, cached.contenu);
        toast.warning(
          l(
            "PDF indisponible - version texte locale telechargee.",
            "PDF unavailable - local text version downloaded.",
            "ملف PDF غير متاح - تم تنزيل النسخة النصية المحلية.",
          ),
        );
      } else {
        toast.error(l("Erreur lors du telechargement", "Download failed", "فشل التنزيل"));
      }
    }
  };

  return (
    <div className={embedded ? "space-y-5" : "space-y-6"}>
      {!embedded ? (
        <div className="section-title">{l("Rapports", "Reports", "تقارير")}</div>
      ) : null}

      {isAdmin && !embedded && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                {l("Plan d'action dédié", "Dedicated action plan", "خطة اجراءات مخصصة")}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {l(
                  "Le rapport reste centré sur la lecture et l'export. Les actions à confirmer sont maintenant regroupées dans une page dédiée.",
                  "The report page stays focused on review and export. Actions to confirm are now grouped in a dedicated page.",
                  "اصبحت صفحة التقرير مخصصة للقراءة والتصدير، بينما جُمعت الاجراءات المطلوب تأكيدها في صفحة مخصصة.",
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/planner")}
              className="inline-flex items-center justify-center rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-surface-3"
            >
              {l("Ouvrir le plan d'action", "Open action plan", "افتح خطة الاجراءات")}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-premium">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-foreground">
                {l("Generer un rapport clair", "Generate a clear report", "انشئ تقريرا واضحا")}
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

          <div className={`mb-5 grid grid-cols-1 gap-4 ${isAdmin ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2"}`}>
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
                      {getMachinePublicLabel(machine)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="mb-2 block text-xs font-semibold text-muted-foreground">
                {l("Periode", "Period", "الفترة")}
              </label>
              <select
                value={period}
                onChange={(event) => setPeriod(event.target.value as ReportPeriod)}
                className="w-full rounded-lg border border-border bg-surface-3 px-3.5 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              >
                {periodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-muted-foreground">
                {l("Langue", "Language", "اللغة")}
              </label>
              <select
                value={reportLang}
                onChange={(event) => setReportLang(event.target.value as "fr" | "en" | "ar")}
                className="w-full rounded-lg border border-border bg-surface-3 px-3.5 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              >
                {languageOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-5 rounded-xl border border-primary/10 bg-primary/[0.05] px-4 py-3 text-xs leading-relaxed text-secondary-foreground">
            <span className="font-semibold text-foreground">
              {l("Format du rapport", "Report format", "تنسيق التقرير")}
            </span>
            :{" "}
            {l(
              "une seule version claire avec l'essentiel, les indicateurs utiles et les actions a retenir.",
              "one clear version with the essentials, the useful indicators, and the actions to keep in view.",
              "نسخة واحدة واضحة تتضمن الاساسيات والمؤشرات المفيدة والاجراءات الواجب متابعتها.",
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
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

        <div className="min-h-[320px] rounded-2xl border border-border bg-card p-6 shadow-premium">
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
            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {history.map((report) => (
                <div key={report.id} className="rounded-lg border border-border/50 bg-surface-3 px-4 py-3">
                  <div className="text-sm font-medium text-foreground">{cleanReportTitle(report.titre)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {new Date(report.created_at).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", {
                      dateStyle: "medium",
                    })}{" "}
                    · {getPeriodLabel(report.period)}
                    {report.machine_code ? ` · ${getMachinePublicLabel(report.machine_code)}` : ""}
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


