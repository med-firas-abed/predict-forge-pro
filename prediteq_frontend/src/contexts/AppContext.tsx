import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Lang = "fr" | "en" | "ar";
export type Theme = "dark" | "light";

export interface AlertThresholds {
  hiCrit: number;
  hiSurv: number;
}

interface AppContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  t: (key: string) => string;
  alertEmails: { manager: string; technician: string };
  setAlertEmails: (e: { manager: string; technician: string }) => void;
  thresholds: AlertThresholds;
}

const AppContext = createContext<AppContextType | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be inside AppProvider");
  return ctx;
}

const TR: Record<string, Record<Lang, string>> = {
  // Nav
  "nav.dashboard": { fr: "Tableau de bord", en: "Dashboard", ar: "لوحة القيادة" },
  "nav.logout": { fr: "Déconnexion", en: "Sign Out", ar: "تسجيل الخروج" },
  "nav.machines": { fr: "Machines", en: "Machines", ar: "الآلات" },
  "nav.maintenance": { fr: "Maintenance", en: "Maintenance", ar: "الصيانة" },
  "nav.calendar": { fr: "Calendrier", en: "Calendar", ar: "التقويم" },
  "nav.costs": { fr: "Coûts & Budget", en: "Costs & Budget", ar: "التكاليف والميزانية" },
  "nav.alerts": { fr: "Alertes", en: "Alerts", ar: "التنبيهات" },
  "nav.geo": { fr: "Géolocalisation", en: "Geolocation", ar: "الموقع الجغرافي" },
  "nav.admin": { fr: "Administration", en: "Administration", ar: "الإدارة" },
  "nav.rapportIA": { fr: "Rapport IA", en: "AI Report", ar: "تقرير الذكاء الاصطناعي" },
  "nav.planner": { fr: "Agent IA", en: "AI Planner", ar: "وكيل الذكاء الاصطناعي" },
  "nav.seuils": { fr: "Seuils d'alertes", en: "Alert Thresholds", ar: "عتبات التنبيه" },
  "nav.simulator": { fr: "Simulateur", en: "Simulator", ar: "المحاكي" },
  "nav.experiment": { fr: "Expérience ESP32", en: "ESP32 Experiment", ar: "تجربة ESP32" },
  "nav.navigation": { fr: "Navigation", en: "Navigation", ar: "التنقل" },
  "nav.system": { fr: "Système", en: "System", ar: "النظام" },
  "nav.adminUsers": { fr: "Gestion des comptes", en: "Account Management", ar: "إدارة الحسابات" },
  "meta.adminusers.title": { fr: "Gestion des comptes", en: "Account Management", ar: "إدارة الحسابات" },
  "meta.adminusers.sub": { fr: "Approbation et gestion des utilisateurs", en: "User approval and management", ar: "الموافقة على المستخدمين وإدارتهم" },
  "meta.simulator.title": { fr: "Simulateur", en: "Simulator", ar: "المحاكي" },
  "meta.simulator.sub": { fr: "Rejouer les trajectoires de test et observer le pipeline ML en temps réel", en: "Replay test trajectories and observe the ML pipeline in real time", ar: "إعادة تشغيل مسارات الاختبار ومراقبة خط أنابيب ML في الوقت الفعلي" },
  "meta.experiment.title": { fr: "Expérience ESP32", en: "ESP32 Experiment", ar: "تجربة ESP32" },
  "meta.experiment.sub": { fr: "Capteur vibration temps réel — ESP32 + MPU6050 → MQTT → Pipeline ML", en: "Real-time vibration sensor — ESP32 + MPU6050 → MQTT → ML Pipeline", ar: "مستشعر اهتزاز في الوقت الحقيقي — ESP32 + MPU6050 → MQTT → خط أنابيب ML" },

  // Dashboard
  "dash.activeMachines": { fr: "Machines actives", en: "Active Machines", ar: "الآلات النشطة" },
  "dash.fullFleet": { fr: "Parc complet opérationnel", en: "Full fleet operational", ar: "الأسطول الكامل يعمل" },
  "dash.avgHI": { fr: "Health Index moyen", en: "Average Health Index", ar: "متوسط مؤشر الصحة" },
  "dash.trendDown": { fr: "Tendance décroissante", en: "Decreasing trend", ar: "اتجاه تنازلي" },
  "dash.minRUL": { fr: "RUL minimum", en: "Minimum RUL", ar: "الحد الأدنى للعمر المتبقي" },
  "dash.critical": { fr: "critique", en: "critical", ar: "حرج" },
  "dash.activeAlerts": { fr: "Alertes actives", en: "Active Alerts", ar: "التنبيهات النشطة" },
  "dash.interventionReq": { fr: "Intervention requise", en: "Intervention required", ar: "تدخل مطلوب" },
  "dash.criticals": { fr: "critiques", en: "critical", ar: "حرجة" },
  "dash.recentAlerts": { fr: "Alertes récentes", en: "Recent Alerts", ar: "التنبيهات الأخيرة" },
  "dash.unread": { fr: "non lues", en: "unread", ar: "غير مقروءة" },
  "dash.hiEvolution": { fr: "Évolution Health Index", en: "Health Index Evolution", ar: "تطور مؤشر الصحة" },
  "dash.last90": { fr: "90 derniers jours", en: "Last 90 days", ar: "آخر 90 يومًا" },
  "dash.decreasingTrend": { fr: "↘ Tendance décroissante", en: "↘ Decreasing trend", ar: "↙ اتجاه تنازلي" },
  "dash.increasingTrend": { fr: "↗ Tendance haussière", en: "↗ Increasing trend", ar: "↗ اتجاه تصاعدي" },
  "dash.stableTrend": { fr: "→ Stable", en: "→ Stable", ar: "→ مستقر" },
  "dash.totalMachines": { fr: "Total machines", en: "Total Machines", ar: "إجمالي الآلات" },
  "dash.operational": { fr: "Opérationnel", en: "Operational", ar: "تشغيلي" },
  "dash.surveillance": { fr: "Surveillance", en: "Monitoring", ar: "مراقبة" },
  "dash.criticalPct": { fr: "Critique", en: "Critical", ar: "حرج" },
  "dash.fleetHealth": { fr: "Santé globale de la flotte", en: "Fleet Health Overview", ar: "نظرة عامة على صحة الأسطول" },
  "dash.fleetAvgHI": { fr: "HI moyen flotte", en: "Fleet avg. HI", ar: "متوسط HI للأسطول" },
  "dash.avgRUL": { fr: "RUL moyen", en: "Avg. RUL", ar: "متوسط العمر المتبقي" },
  "dash.days": { fr: "jours", en: "days", ar: "أيام" },
  "dash.selectMachine": { fr: "Sélectionner une machine", en: "Select a machine", ar: "اختر آلة" },
  "dash.machineBanner": { fr: "Fiche machine", en: "Machine Overview", ar: "بطاقة الآلة" },
  "dash.lastUpdate": { fr: "Dernière MAJ", en: "Last Update", ar: "آخر تحديث" },
  "dash.cyclesToday": { fr: "Cycles aujourd'hui", en: "Cycles Today", ar: "دورات اليوم" },
  "dash.anomalies24h": { fr: "Anomalies 24h", en: "Anomalies 24h", ar: "الشذوذات 24 ساعة" },
  "dash.sensorCharts": { fr: "Capteurs — 6 dernières heures", en: "Sensors — Last 6 Hours", ar: "المستشعرات — آخر 6 ساعات" },
  "dash.hiTrend7d": { fr: "Tendance HI — 7 derniers jours", en: "HI Trend — Last 7 Days", ar: "اتجاه HI — آخر 7 أيام" },
  "dash.loadingSensors": { fr: "Chargement des capteurs…", en: "Loading sensors…", ar: "جاري تحميل المستشعرات…" },
  "dash.awaitingSensors": { fr: "En attente de données capteurs — démarrez le simulateur", en: "Awaiting sensor data — start the simulator", ar: "في انتظار بيانات المستشعرات — ابدأ المحاكي" },

  // Geo
  "geo.title": { fr: "Déploiement Tunisie — 2026", en: "Tunisia Deployment — 2026", ar: "نشر تونس — 2026" },
  "geo.sites": { fr: "sites", en: "sites", ar: "مواقع" },
  "geo.clickMarker": { fr: "Cliquez sur un marqueur pour les détails", en: "Click a marker for details", ar: "انقر على علامة للتفاصيل" },

  // Machines
  "mach.fleet": { fr: "Parc d'ascenseurs de stockage", en: "Storage Elevator Fleet", ar: "أسطول مصاعد التخزين" },
  "mach.export": { fr: "Exporter", en: "Export", ar: "تصدير" },
  "mach.addMachine": { fr: "Ajouter machine", en: "Add Machine", ar: "إضافة آلة" },
  "mach.management": { fr: "Gestion des machines (CRUD)", en: "Machine Management (CRUD)", ar: "إدارة الآلات (CRUD)" },
  "mach.edit": { fr: "Modifier", en: "Edit", ar: "تعديل" },
  "mach.delete": { fr: "Supprimer", en: "Delete", ar: "حذف" },
  "mach.confirmDelete": { fr: "Confirmer la suppression ?", en: "Confirm deletion?", ar: "تأكيد الحذف؟" },
  "mach.confirmDeleteMsg": { fr: "Cette action est irréversible. Supprimer", en: "This action is irreversible. Delete", ar: "هذا الإجراء لا رجعة فيه. حذف" },
  "mach.yes": { fr: "Oui, supprimer", en: "Yes, delete", ar: "نعم، حذف" },
  "mach.no": { fr: "Annuler", en: "Cancel", ar: "إلغاء" },
  "mach.machineInfo": { fr: "Informations machine", en: "Machine Info", ar: "معلومات الآلة" },
  "mach.gpsLocation": { fr: "Localisation GPS", en: "GPS Location", ar: "موقع GPS" },
  "mach.sensorData": { fr: "Données capteurs", en: "Sensor Data", ar: "بيانات المستشعرات" },
  "mach.save": { fr: "Enregistrer", en: "Save", ar: "حفظ" },
  "mach.cancel": { fr: "Annuler", en: "Cancel", ar: "إلغاء" },
  "mach.id": { fr: "ID Machine", en: "Machine ID", ar: "معرف الآلة" },
  "mach.client": { fr: "Client / Nom", en: "Client / Name", ar: "العميل / الاسم" },
  "mach.city": { fr: "Ville", en: "City", ar: "المدينة" },
  "mach.model": { fr: "Modèle moteur", en: "Motor Model", ar: "موديل المحرك" },
  "mach.floors": { fr: "Étages", en: "Floors", ar: "الطوابق" },
  "mach.status": { fr: "Statut", en: "Status", ar: "الحالة" },
  "mach.latitude": { fr: "Latitude", en: "Latitude", ar: "خط العرض" },
  "mach.longitude": { fr: "Longitude", en: "Longitude", ar: "خط الطول" },
  "mach.gpsTip": { fr: "Astuce : clic droit sur Google Maps, copier les coordonnées", en: "Tip: right-click on Google Maps, copy coordinates", ar: "نصيحة: انقر بزر الماوس الأيمن على خرائط جوجل، انسخ الإحداثيات" },
  "mach.gpsTipClean": { fr: "Astuce : clic droit sur Google Maps, copier les coordonnées", en: "Tip: right-click on Google Maps, copy coordinates", ar: "نصيحة: انقر بزر الماوس الأيمن على خرائط جوجل، انسخ الإحداثيات" },
  "mach.hi": { fr: "Health Index (0–1)", en: "Health Index (0–1)", ar: "مؤشر الصحة (0–1)" },
  "mach.rul": { fr: "RUL (jours)", en: "RUL (days)", ar: "العمر المتبقي (أيام)" },
  "mach.rulci": { fr: "Intervalle de confiance (±jours)", en: "Confidence Interval (±days)", ar: "فاصل الثقة (± أيام)" },
  "mach.vibration": { fr: "Vibration (mm/s)", en: "Vibration (mm/s)", ar: "الاهتزاز (مم/ث)" },
  "mach.current": { fr: "Courant (A)", en: "Current (A)", ar: "التيار (أمبير)" },
  "mach.temperature": { fr: "Température (°C)", en: "Temperature (°C)", ar: "الحرارة (°م)" },
  "mach.idRequired": { fr: "L'ID est requis", en: "ID is required", ar: "المعرف مطلوب" },
  "mach.idExists": { fr: "Cet ID existe déjà", en: "This ID already exists", ar: "هذا المعرف موجود بالفعل" },
  "mach.location": { fr: "Emplacement", en: "Location", ar: "الموقع" },

  // Maintenance
  "maint.tasks": { fr: "Tâches de maintenance", en: "Maintenance Tasks", ar: "مهام الصيانة" },
  "maint.newTask": { fr: "Nouvelle tâche", en: "New Task", ar: "مهمة جديدة" },
  "maint.planned": { fr: "Planifiée", en: "Planned", ar: "مخططة" },
  "maint.inProgress": { fr: "En cours", en: "In Progress", ar: "قيد التنفيذ" },
  "maint.completed": { fr: "Terminée", en: "Completed", ar: "مكتملة" },
  "maint.progression": { fr: "Progression", en: "Progress", ar: "التقدم" },

  // Calendar
  "cal.planning": { fr: "Planification maintenance", en: "Maintenance Planning", ar: "تخطيط الصيانة" },
  "cal.schedule": { fr: "Planifier", en: "Schedule", ar: "جدولة" },
  "cal.updated": { fr: "Tâche mise à jour", en: "Task updated", ar: "تم تحديث المهمة" },
  "cal.mon": { fr: "Lun", en: "Mon", ar: "اثن" },
  "cal.tue": { fr: "Mar", en: "Tue", ar: "ثلا" },
  "cal.wed": { fr: "Mer", en: "Wed", ar: "أرب" },
  "cal.thu": { fr: "Jeu", en: "Thu", ar: "خمي" },
  "cal.fri": { fr: "Ven", en: "Fri", ar: "جمع" },
  "cal.sat": { fr: "Sam", en: "Sat", ar: "سبت" },
  "cal.sun": { fr: "Dim", en: "Sun", ar: "أحد" },

  // Costs
  "costs.title": { fr: "Coûts & Budget maintenance", en: "Maintenance Costs & Budget", ar: "تكاليف وميزانية الصيانة" },
  "costs.exportCSV": { fr: "Exporter CSV", en: "Export CSV", ar: "تصدير CSV" },
  "costs.report": { fr: "Rapport", en: "Report", ar: "تقرير" },
  "costs.totalBudget": { fr: "Budget total", en: "Total Budget", ar: "الميزانية الإجمالية" },
  "costs.labor": { fr: "Main d'œuvre", en: "Labor", ar: "العمالة" },
  "costs.parts": { fr: "Pièces", en: "Parts", ar: "القطع" },
  "costs.interventions": { fr: "Interventions", en: "Interventions", ar: "التدخلات" },
  "costs.monthly": { fr: "Coûts mensuels", en: "Monthly Costs", ar: "التكاليف الشهرية" },
  "costs.laborVsParts": { fr: "Main d'œuvre vs Pièces", en: "Labor vs Parts", ar: "العمالة مقابل القطع" },
  "costs.perMachine": { fr: "Répartition par machine", en: "Distribution by Machine", ar: "التوزيع حسب الآلة" },
  "costs.totalPerElevator": { fr: "Coût total par ascenseur", en: "Total cost per elevator", ar: "التكلفة الإجمالية لكل مصعد" },

  // Alerts
  "alerts.center": { fr: "Centre d'alertes", en: "Alert Center", ar: "مركز التنبيهات" },
  "alerts.markRead": { fr: "✓ Tout marquer lu", en: "✓ Mark all read", ar: "✓ تعليم الكل كمقروء" },
  "alerts.all": { fr: "Toutes", en: "All", ar: "الكل" },
  "alerts.unread": { fr: "Non lues", en: "Unread", ar: "غير مقروءة" },
  "alerts.critical": { fr: "Critiques", en: "Critical", ar: "حرجة" },
  "alerts.warnings": { fr: "Avertissements", en: "Warnings", ar: "تحذيرات" },
  "alerts.information": { fr: "Information", en: "Information", ar: "معلومات" },
  "alerts.config": { fr: "Configuration emails", en: "Email Configuration", ar: "إعدادات البريد الإلكتروني" },
  "alerts.save": { fr: "Enregistrer", en: "Save", ar: "حفظ" },
  "alerts.stats": { fr: "Statistiques (30 jours)", en: "Statistics (30 days)", ar: "الإحصائيات (30 يومًا)" },
  "alerts.emergencies": { fr: "Urgences", en: "Emergencies", ar: "حالات الطوارئ" },
  "alerts.monitoring": { fr: "Surveillances", en: "Monitoring", ar: "المراقبة" },
  "alerts.managerEmail": { fr: "Email responsable", en: "Manager Email", ar: "بريد المسؤول" },
  "alerts.techEmail": { fr: "Email technicien senior", en: "Senior Technician Email", ar: "بريد الفني الأول" },
  "alerts.triggerConditions": { fr: "Conditions de déclenchement automatique", en: "Automatic Trigger Conditions", ar: "شروط التشغيل التلقائي" },
  "alerts.urgenceRule": { fr: "HI < 0.30 OU RUL < 7j → email immédiat (max 1×/24h)", en: "HI < 0.30 OR RUL < 7d → immediate email (max 1×/24h)", ar: "HI < 0.30 أو RUL < 7 أيام ← بريد فوري (حد أقصى 1×/24 ساعة)" },
  "alerts.survRule": { fr: "Email récapitulatif hebdomadaire", en: "Weekly recap email", ar: "بريد ملخص أسبوعي" },
  "alerts.okRule": { fr: "Aucun email", en: "No email", ar: "بدون بريد" },
  "alerts.perMachineStatus": { fr: "Statut alertes par machine", en: "Per-Machine Alert Status", ar: "حالة التنبيهات حسب الآلة" },
  "alerts.noEmail": { fr: "Aucun email", en: "No email", ar: "بدون بريد" },
  "alerts.weeklyScheduled": { fr: "Hebdo programmé", en: "Weekly scheduled", ar: "أسبوعي مجدول" },
  "alerts.emailSent": { fr: "Email envoyé", en: "Email sent", ar: "تم إرسال البريد" },
  "alerts.recentLog": { fr: "Journal d'alertes récent", en: "Recent Alert Log", ar: "سجل التنبيهات الأخير" },

  // Admin
  "admin.users": { fr: "Utilisateurs", en: "Users", ar: "المستخدمون" },
  "admin.machines": { fr: "Machines", en: "Machines", ar: "الآلات" },
  "admin.settings": { fr: "Paramètres", en: "Settings", ar: "الإعدادات" },
  "admin.userMgmt": { fr: "Gestion des utilisateurs", en: "User Management", ar: "إدارة المستخدمين" },
  "admin.add": { fr: "Ajouter", en: "Add", ar: "إضافة" },
  "admin.machineConfig": { fr: "Configuration des machines", en: "Machine Configuration", ar: "إعدادات الآلات" },
  "admin.machineConfigDesc": { fr: "Gestion avancée des paramètres machines.", en: "Advanced machine parameter management.", ar: "إدارة متقدمة لمعلمات الآلات." },
  "admin.alertThresholds": { fr: "Seuils d'alerte", en: "Alert Thresholds", ar: "عتبات التنبيه" },
  "admin.alertThresholdsSub": { fr: "Configurer les seuils HI, RUL et capteurs", en: "Configure HI, RUL and sensor thresholds", ar: "ضبط عتبات HI و RUL والمستشعرات" },
  "admin.notifications": { fr: "Notifications", en: "Notifications", ar: "الإشعارات" },
  "admin.notificationsSub": { fr: "Email, SMS, alertes in-app", en: "Email, SMS, in-app alerts", ar: "بريد، رسائل، تنبيهات التطبيق" },
  "admin.mlIntegration": { fr: "Intégration ML", en: "ML Integration", ar: "تكامل التعلم الآلي" },
  "admin.mlIntegrationSub": { fr: "Configuration du microservice Python (Phase 3)", en: "Python microservice configuration (Phase 3)", ar: "إعدادات خدمة Python المصغرة (المرحلة 3)" },
  "admin.generateReport": { fr: "Générer rapport IA", en: "Generate AI Report", ar: "إنشاء تقرير ذكاء اصطناعي" },
  "admin.exportPDF": { fr: "Exporter PDF", en: "Export PDF", ar: "تصدير PDF" },
  "admin.anomalyLog": { fr: "Historique d'anomalies", en: "Anomaly History", ar: "سجل الشذوذات" },
  "admin.thresholdSliders": { fr: "Seuils d'alerte machine", en: "Machine Alert Thresholds", ar: "عتبات تنبيه الآلة" },
  "admin.shapChart": { fr: "Importance des features (SHAP)", en: "Feature Importance (SHAP)", ar: "أهمية الميزات (SHAP)" },
  "admin.hiCritLevel": { fr: "HI — Niveau critique", en: "HI — Critical Level", ar: "HI — المستوى الحرج" },
  "admin.hiSurvLevel": { fr: "HI — Niveau surveillance", en: "HI — Monitoring Level", ar: "HI — مستوى المراقبة" },
  "admin.rulCritDays": { fr: "RUL — Critique (jours)", en: "RUL — Critical (days)", ar: "RUL — حرج (أيام)" },
  "admin.rulSurvDays": { fr: "RUL — Surveillance (jours)", en: "RUL — Monitoring (days)", ar: "RUL — مراقبة (أيام)" },
  "admin.thresholdSummary": { fr: "Résumé des actions", en: "Actions Summary", ar: "ملخص الإجراءات" },
  "admin.reportGenerated": { fr: "Rapport généré", en: "Report generated", ar: "تم إنشاء التقرير" },
  "admin.pdfPlaceholder": { fr: "Export PDF (FPDF2)", en: "PDF Export (FPDF2)", ar: "تصدير PDF (FPDF2)" },
  "admin.weeklyReport": { fr: "Rapport hebdomadaire", en: "Weekly Report", ar: "تقرير أسبوعي" },
  "admin.monthlyReport": { fr: "Rapport mensuel", en: "Monthly Report", ar: "تقرير شهري" },

  // Topbar
  "topbar.search": { fr: "Rechercher machines, alertes...", en: "Search machines, alerts...", ar: "بحث عن الآلات، التنبيهات..." },
  "topbar.lastUpdate": { fr: "Dernière MAJ", en: "Last Update", ar: "آخر تحديث" },
  "topbar.live": { fr: "Live", en: "Live", ar: "مباشر" },
  "topbar.production": { fr: "Production", en: "Production", ar: "الإنتاج" },

  // Settings
  "settings.language": { fr: "Langue", en: "Language", ar: "اللغة" },
  "settings.theme": { fr: "Thème", en: "Theme", ar: "المظهر" },
  "settings.french": { fr: "Français", en: "French", ar: "الفرنسية" },
  "settings.english": { fr: "Anglais", en: "English", ar: "الإنجليزية" },
  "settings.arabic": { fr: "Arabe", en: "Arabic", ar: "العربية" },
  "settings.dark": { fr: "Sombre", en: "Dark", ar: "داكن" },
  "settings.light": { fr: "Clair", en: "Light", ar: "فاتح" },

  // Page meta
  "meta.dashboard.title": { fr: "Tableau de bord", en: "Dashboard", ar: "لوحة القيادة" },
  "meta.dashboard.sub": { fr: "Vue d'ensemble de la flotte", en: "Fleet overview", ar: "نظرة عامة على الأسطول" },
  "meta.machines.title": { fr: "Machines", en: "Machines", ar: "الآلات" },
  "meta.machines.sub": { fr: "Parc d'ascenseurs de stockage", en: "Storage elevator fleet", ar: "أسطول مصاعد التخزين" },
  "meta.maintenance.title": { fr: "Maintenance", en: "Maintenance", ar: "الصيانة" },
  "meta.maintenance.sub": { fr: "Gestion des tâches et interventions", en: "Task and intervention management", ar: "إدارة المهام والتدخلات" },
  "meta.calendar.title": { fr: "Calendrier", en: "Calendar", ar: "التقويم" },
  "meta.calendar.sub": { fr: "Planification maintenance", en: "Maintenance planning", ar: "تخطيط الصيانة" },
  "meta.costs.title": { fr: "Coûts & Budget", en: "Costs & Budget", ar: "التكاليف والميزانية" },
  "meta.costs.sub": { fr: "Suivi budgétaire maintenance", en: "Maintenance budget tracking", ar: "متابعة ميزانية الصيانة" },
  "meta.alerts.title": { fr: "Alertes", en: "Alerts", ar: "التنبيهات" },
  "meta.alerts.sub": { fr: "Centre de notifications et d'alertes", en: "Notification and alert center", ar: "مركز الإشعارات والتنبيهات" },
  "meta.geo.title": { fr: "Géolocalisation", en: "Geolocation", ar: "الموقع الجغرافي" },
  "meta.geo.sub": { fr: "Déploiement Tunisie — Carte interactive", en: "Tunisia deployment — Interactive map", ar: "نشر تونس — خريطة تفاعلية" },
  "meta.admin.title": { fr: "Administration", en: "Administration", ar: "الإدارة" },
  "meta.admin.sub": { fr: "Gestion de la plateforme", en: "Platform management", ar: "إدارة المنصة" },
  "meta.rapportia.title": { fr: "Rapport IA", en: "AI Report", ar: "تقرير الذكاء الاصطناعي" },
  "meta.rapportia.sub": { fr: "Génération de rapports intelligents", en: "Intelligent report generation", ar: "إنشاء تقارير ذكية" },
  "meta.seuils.title": { fr: "Seuils d'alertes", en: "Alert Thresholds", ar: "عتبات التنبيه" },
  "meta.seuils.sub": { fr: "Configuration des seuils et notifications", en: "Threshold and notification configuration", ar: "إعدادات العتبات والإشعارات" },
  "meta.planner.title": { fr: "Agent IA", en: "AI Planner", ar: "وكيل الذكاء الاصطناعي" },
  "meta.planner.sub": { fr: "Planification autonome de la maintenance par intelligence artificielle", en: "AI-powered autonomous maintenance planning", ar: "تخطيط الصيانة الذاتي بالذكاء الاصطناعي" },

  // Chat widget
  "chat.title": { fr: "Assistant PrediTeq", en: "PrediTeq Assistant", ar: "مساعد PrediTeq" },
  "chat.subtitle": { fr: "Posez vos questions sur la flotte", en: "Ask about your fleet", ar: "اسأل عن أسطولك" },
  "chat.greeting": { fr: "Je suis votre assistant IA. Posez-moi une question sur vos machines ! 🚀", en: "I'm your AI assistant. Ask me anything about your machines! 🚀", ar: "أنا مساعدك الذكي. اسألني عن آلاتك! 🚀" },
  "chat.welcome": { fr: "Bonjour ! Je suis l'assistant IA de PrediTeq. Je peux vous renseigner sur l'état de vos machines, les alertes, et la maintenance.", en: "Hello! I'm the PrediTeq AI assistant. I can help you with machine status, alerts, and maintenance.", ar: "مرحبا! أنا مساعد PrediTeq الذكي. يمكنني مساعدتك في حالة الآلات والتنبيهات والصيانة." },
  "chat.placeholder": { fr: "Tapez votre question...", en: "Type your question...", ar: "اكتب سؤالك..." },
  "chat.thinking": { fr: "Réflexion...", en: "Thinking...", ar: "جاري التفكير..." },

  // Planner
  "planner.title": { fr: "Agent de Planification IA", en: "AI Planning Agent", ar: "وكيل التخطيط الذكي" },
  "planner.subtitle": { fr: "Analyse la flotte, propose un plan de maintenance optimal et crée les tâches GMAO", en: "Analyses your fleet, proposes optimal maintenance plan, and creates GMAO tasks", ar: "يحلل الأسطول ويقترح خطة صيانة مثالية وينشئ مهام GMAO" },
  "planner.fleetRisk": { fr: "Classement des risques", en: "Risk Ranking", ar: "تصنيف المخاطر" },
  "planner.loadingRisk": { fr: "Chargement...", en: "Loading...", ar: "جاري التحميل..." },
  "planner.noData": { fr: "Aucune donnée — démarrez le simulateur", en: "No data — start the simulator", ar: "لا توجد بيانات — ابدأ المحاكي" },
  "planner.openTasks": { fr: "tâche(s) ouverte(s)", en: "open task(s)", ar: "مهمة مفتوحة" },
  "planner.fullPlan": { fr: "Plan de maintenance complet", en: "Full maintenance plan", ar: "خطة الصيانة الكاملة" },
  "planner.generate": { fr: "Générer le plan", en: "Generate Plan", ar: "إنشاء الخطة" },
  "planner.generating": { fr: "Génération...", en: "Generating...", ar: "جاري الإنشاء..." },
  "planner.clickGenerate": { fr: "Cliquez sur Générer pour lancer l'agent IA", en: "Click Generate to run the AI agent", ar: "انقر على إنشاء لتشغيل وكيل الذكاء الاصطناعي" },
  "planner.proposedTasks": { fr: "Tâches GMAO proposées", en: "Proposed GMAO Tasks", ar: "مهام GMAO المقترحة" },
  "planner.approve": { fr: "Approuver", en: "Approve", ar: "الموافقة" },

  // Status
  "status.operational": { fr: "Opérationnel", en: "Operational", ar: "تشغيلي" },
  "status.degraded": { fr: "Surveillance", en: "Surveillance", ar: "مراقبة" },
  "status.critical": { fr: "Critique", en: "Critical", ar: "حرج" },
  "status.maintenance": { fr: "Maintenance", en: "Maintenance", ar: "صيانة" },

  // Table headers
  "table.name": { fr: "Nom", en: "Name", ar: "الاسم" },
  "table.email": { fr: "Email", en: "Email", ar: "البريد الإلكتروني" },
  "table.role": { fr: "Rôle", en: "Role", ar: "الدور" },
  "table.status": { fr: "Statut", en: "Status", ar: "الحالة" },
  "table.lastLogin": { fr: "Dernière connexion", en: "Last Login", ar: "آخر تسجيل دخول" },
  "table.active": { fr: "Actif", en: "Active", ar: "نشط" },
  "table.inactive": { fr: "Inactif", en: "Inactive", ar: "غير نشط" },

  // Common
  "common.today": { fr: "Aujourd'hui", en: "Today", ar: "اليوم" },

  // Chart
  "chart.urgency": { fr: "Urgence", en: "Emergency", ar: "طوارئ" },
  "chart.surveillance": { fr: "Surveillance", en: "Monitoring", ar: "مراقبة" },

  // Machine modal
  "modal.machineInfo": { fr: "Informations machine", en: "Machine Information", ar: "معلومات الآلة" },
  "modal.model": { fr: "Modèle", en: "Model", ar: "الموديل" },
  "modal.floors": { fr: "Étages", en: "Floors", ar: "الطوابق" },
  "modal.city": { fr: "Ville", en: "City", ar: "المدينة" },
  "modal.cyclesDay": { fr: "Cycles/jour", en: "Cycles/day", ar: "دورات/يوم" },
  "modal.healthIndex": { fr: "Health Index", en: "Health Index", ar: "مؤشر الصحة" },
  "modal.inMaintenance": { fr: "En maintenance", en: "In Maintenance", ar: "قيد الصيانة" },
  "modal.anomalies24h": { fr: "Anomalies 24h", en: "Anomalies 24h", ar: "الشذوذات 24 ساعة" },
  "modal.anomalyHistory": { fr: "Historique anomalies (24h)", en: "Anomaly History (24h)", ar: "سجل الشذوذات (24 ساعة)" },
  "modal.noAnomaly": { fr: "Aucune anomalie détectée.", en: "No anomalies detected.", ar: "لم يتم اكتشاف أي شذوذ." },
  "modal.shapFeatures": { fr: "Features influentes (SHAP)", en: "Influential Features (SHAP)", ar: "الميزات المؤثرة (SHAP)" },
  "modal.shapLoading": { fr: "Chargement SHAP...", en: "Loading SHAP...", ar: "جاري تحميل SHAP..." },
  "modal.shapEmpty": { fr: "Démarrez le simulateur pour obtenir les contributions SHAP.", en: "Start the simulator to get SHAP contributions.", ar: "ابدأ المحاكي للحصول على مساهمات SHAP." },
  "modal.vibration": { fr: "Vibration moteur", en: "Motor Vibration", ar: "اهتزاز المحرك" },
  "modal.current": { fr: "Courant moteur", en: "Motor Current", ar: "تيار المحرك" },
  "modal.temperature": { fr: "Température moteur", en: "Motor Temperature", ar: "حرارة المحرك" },
  "modal.rulEstimated": { fr: "RUL estimé", en: "Estimated RUL", ar: "العمر المتبقي المقدّر" },

  // Auth pages
  "auth.signIn": { fr: "Connexion", en: "Sign In", ar: "تسجيل الدخول" },
  "auth.password": { fr: "Mot de passe", en: "Password", ar: "كلمة المرور" },
  "auth.signInBtn": { fr: "Se connecter", en: "Sign In", ar: "تسجيل الدخول" },
  "auth.noAccount": { fr: "Pas encore de compte ?", en: "No account yet?", ar: "ليس لديك حساب؟" },
  "auth.signUp": { fr: "S'inscrire", en: "Sign Up", ar: "إنشاء حساب" },
  "auth.loginError": { fr: "Erreur de connexion.", en: "Login error.", ar: "خطأ في تسجيل الدخول." },
  "auth.subtitle": { fr: "Système de Maintenance Prédictive basé sur l'AIoT", en: "AIoT-based Predictive Maintenance System", ar: "نظام الصيانة التنبؤية القائم على AIoT" },
  "auth.loading": { fr: "Connexion en cours...", en: "Connecting...", ar: "جاري الاتصال..." },
  "auth.createAccount": { fr: "Créer un compte", en: "Create Account", ar: "إنشاء حساب" },
  "auth.fullName": { fr: "Nom complet", en: "Full Name", ar: "الاسم الكامل" },
  "auth.confirmPassword": { fr: "Confirmer le mot de passe", en: "Confirm Password", ar: "تأكيد كلمة المرور" },
  "auth.role": { fr: "Rôle", en: "Role", ar: "الدور" },
  "auth.user": { fr: "Utilisateur", en: "User", ar: "مستخدم" },
  "auth.administrator": { fr: "Administrateur", en: "Administrator", ar: "مدير" },
  "auth.assignedMachine": { fr: "Machine assignée", en: "Assigned Machine", ar: "الآلة المخصصة" },
  "auth.createBtn": { fr: "Créer mon compte", en: "Create Account", ar: "إنشاء حسابي" },
  "auth.hasAccount": { fr: "Déjà un compte ?", en: "Already have an account?", ar: "لديك حساب بالفعل؟" },
  "auth.passwordMismatch": { fr: "Les mots de passe ne correspondent pas.", en: "Passwords do not match.", ar: "كلمتا المرور غير متطابقتين." },
  "auth.passwordTooShort": { fr: "Le mot de passe doit contenir au moins 6 caractères.", en: "Password must be at least 6 characters.", ar: "يجب أن تحتوي كلمة المرور على 6 أحرف على الأقل." },
  "auth.registrationError": { fr: "Erreur lors de l'inscription.", en: "Registration error.", ar: "خطأ أثناء التسجيل." },

  // Pending page
  "pending.title": { fr: "Compte en cours de validation", en: "Account Pending Validation", ar: "الحساب قيد التحقق" },
  "pending.message": { fr: "Votre demande d'accès a été soumise avec succès. Un administrateur va examiner votre compte sous peu.", en: "Your access request has been submitted successfully. An administrator will review your account shortly.", ar: "تم تقديم طلب الوصول بنجاح. سيقوم مسؤول بمراجعة حسابك قريبًا." },
  "pending.name": { fr: "Nom", en: "Name", ar: "الاسم" },
  "pending.requestedRole": { fr: "Rôle demandé", en: "Requested Role", ar: "الدور المطلوب" },
  "pending.urgentContact": { fr: "Pour toute urgence, contactez", en: "For urgent matters, contact", ar: "للحالات العاجلة، تواصل مع" },
  "pending.signOut": { fr: "Se déconnecter", en: "Sign Out", ar: "تسجيل الخروج" },
  "pending.selfApprove": { fr: "Votre propre compte — ne peut pas être auto-approuvé", en: "Your own account — cannot self-approve", ar: "حسابك الخاص — لا يمكن الموافقة الذاتية" },

  // Alerts page extra
  "alerts.emergenciesSection": { fr: "Urgences", en: "Emergencies", ar: "حالات الطوارئ" },
  "alerts.underMonitoring": { fr: "En surveillance", en: "Under Monitoring", ar: "تحت المراقبة" },
  "alerts.resolved": { fr: "Résolues", en: "Resolved", ar: "تم حلها" },

  // Maintenance extra
  "maint.done": { fr: "Terminé", en: "Done", ar: "مكتمل" },
  "maint.urgent": { fr: "Urgent", en: "Urgent", ar: "عاجل" },
  "maint.critical": { fr: "Critique", en: "Critical", ar: "حرج" },
  "maint.ongoing": { fr: "En cours", en: "In Progress", ar: "قيد التنفيذ" },
  "maint.normal": { fr: "Normal", en: "Normal", ar: "عادي" },

  // Calendar extra
  "cal.upcomingInterventions": { fr: "Prochaines interventions", en: "Upcoming Interventions", ar: "التدخلات القادمة" },
  "cal.preventive": { fr: "Préventive", en: "Preventive", ar: "وقائية" },
  "cal.corrective": { fr: "Corrective", en: "Corrective", ar: "تصحيحية" },
  "cal.inspection": { fr: "Inspection", en: "Inspection", ar: "فحص" },

  // Months
  "month.0": { fr: "Janvier", en: "January", ar: "يناير" },
  "month.1": { fr: "Février", en: "February", ar: "فبراير" },
  "month.2": { fr: "Mars", en: "March", ar: "مارس" },
  "month.3": { fr: "Avril", en: "April", ar: "أبريل" },
  "month.4": { fr: "Mai", en: "May", ar: "ماي" },
  "month.5": { fr: "Juin", en: "June", ar: "يونيو" },
  "month.6": { fr: "Juillet", en: "July", ar: "يوليو" },
  "month.7": { fr: "Août", en: "August", ar: "أغسطس" },
  "month.8": { fr: "Septembre", en: "September", ar: "سبتمبر" },
  "month.9": { fr: "Octobre", en: "October", ar: "أكتوبر" },
  "month.10": { fr: "Novembre", en: "November", ar: "نوفمبر" },
  "month.11": { fr: "Décembre", en: "December", ar: "ديسمبر" },

  // Rapport IA extra
  "rapport.title": { fr: "Rapport IA", en: "AI Report", ar: "تقرير الذكاء الاصطناعي" },
  "rapport.allMachines": { fr: "Toutes les machines", en: "All machines", ar: "جميع الآلات" },
  "rapport.period": { fr: "Période", en: "Period", ar: "الفترة" },
  "rapport.weekly": { fr: "Hebdomadaire", en: "Weekly", ar: "أسبوعي" },
  "rapport.monthly": { fr: "Mensuel", en: "Monthly", ar: "شهري" },
  "rapport.reportLang": { fr: "Langue du rapport", en: "Report Language", ar: "لغة التقرير" },
  "rapport.generate": { fr: "Générer le rapport", en: "Generate Report", ar: "إنشاء التقرير" },
  "rapport.exportPdf": { fr: "Exporter PDF", en: "Export PDF", ar: "تصدير PDF" },
  "rapport.pdfSoon": { fr: "Export PDF", en: "PDF Export", ar: "تصدير PDF" },
  "rapport.generated": { fr: "Rapport généré", en: "Report generated", ar: "تم إنشاء التقرير" },

  // Seuils extra
  "seuils.title": { fr: "Seuils d'alertes", en: "Alert Thresholds", ar: "عتبات التنبيه" },
  "seuils.config": { fr: "Configuration des seuils", en: "Threshold Configuration", ar: "إعدادات العتبات" },
  "seuils.emergency": { fr: "Urgence", en: "Emergency", ar: "طوارئ" },
  "seuils.monitoring": { fr: "Surveillance", en: "Monitoring", ar: "مراقبة" },
  "seuils.days": { fr: "jours", en: "days", ar: "أيام" },
  "seuils.emailImmediate": { fr: "Email immédiat aux deux destinataires (max 1x/24h)", en: "Immediate email to both recipients (max 1x/24h)", ar: "بريد فوري للمستلمين (حد أقصى 1×/24 ساعة)" },
  "seuils.emailWeekly": { fr: "Email récapitulatif hebdomadaire", en: "Weekly recap email", ar: "بريد ملخص أسبوعي" },
  "seuils.emailConfig": { fr: "Configuration emails", en: "Email Configuration", ar: "إعدادات البريد الإلكتروني" },
  "seuils.managerEmail": { fr: "Email responsable", en: "Manager Email", ar: "بريد المسؤول" },
  "seuils.techEmail": { fr: "Email technicien senior", en: "Senior Technician Email", ar: "بريد الفني الأول" },
  "seuils.save": { fr: "Enregistrer les seuils", en: "Save Thresholds", ar: "حفظ العتبات" },
  "seuils.saved": { fr: "Seuils enregistrés", en: "Thresholds saved", ar: "تم حفظ العتبات" },

  // Dashboard alerts
  "dash.rulCritique": { fr: "RUL critique", en: "Critical RUL", ar: "العمر المتبقي حرج" },
  "dash.hiCritique": { fr: "HI critique", en: "Critical HI", ar: "مؤشر الصحة حرج" },
  "dash.hiThreshold": { fr: "seuil < 0.4", en: "threshold < 0.4", ar: "العتبة < 0.4" },
  "dash.hiDegradation": { fr: "Dégradation HI", en: "HI Degradation", ar: "تدهور مؤشر الصحة" },
  "dash.decreasingTrendShort": { fr: "tendance décroissante", en: "decreasing trend", ar: "اتجاه تنازلي" },

  // Footer
  "footer.text": { fr: "© 2026 AroTeq. PrediTeq Pro — Tous droits réservés. | Système de Maintenance Prédictive Industrielle basé sur l'AIoT", en: "© 2026 AroTeq. PrediTeq Pro — All rights reserved. | Industrial Predictive Maintenance System based on AIoT", ar: "© 2026 AroTeq. PrediTeq Pro — جميع الحقوق محفوظة. | نظام الصيانة التنبؤية الصناعية القائم على AIoT" },

  // Not Found
  "notfound.title": { fr: "Oops ! Page introuvable", en: "Oops! Page not found", ar: "عذرًا! الصفحة غير موجودة" },
  "notfound.home": { fr: "Retour à l'accueil", en: "Return to Home", ar: "العودة للرئيسية" },

  // Account management
  "admin.pendingAccounts": { fr: "Comptes en attente", en: "Pending Accounts", ar: "حسابات معلقة" },
  "admin.noPending": { fr: "Aucune demande en attente.", en: "No pending requests.", ar: "لا توجد طلبات معلقة." },
  "admin.allMachines": { fr: "Toutes les machines", en: "All machines", ar: "جميع الآلات" },
  "admin.approve": { fr: "Approuver", en: "Approve", ar: "موافقة" },
  "admin.reject": { fr: "Rejeter", en: "Reject", ar: "رفض" },
  "admin.approved": { fr: "Compte approuvé", en: "Account approved", ar: "تمت الموافقة على الحساب" },
  "admin.rejected": { fr: "Compte refusé", en: "Account rejected", ar: "تم رفض الحساب" },
  "admin.activeAccounts": { fr: "Comptes actifs", en: "Active Accounts", ar: "الحسابات النشطة" },
  "admin.addUser": { fr: "Ajouter utilisateur", en: "Add User", ar: "إضافة مستخدم" },
  "admin.approvedOn": { fr: "Approuvé le", en: "Approved on", ar: "تاريخ الموافقة" },
  "admin.accountMgmt": { fr: "Gestion des comptes", en: "Account Management", ar: "إدارة الحسابات" },
  "admin.settingsTab": { fr: "Paramètres", en: "Settings", ar: "الإعدادات" },
  "admin.all": { fr: "Toutes", en: "All", ar: "الكل" },
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("pl-lang") as Lang) || "fr");
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("pl-theme") as Theme) || "light");
  const [alertEmails, setAlertEmails] = useState(() => {
    const saved = localStorage.getItem("pl-alert-emails");
    if (saved) try { return JSON.parse(saved); } catch { /* ignore */ }
    return { manager: "", technician: "" };
  });
  useEffect(() => { localStorage.setItem("pl-alert-emails", JSON.stringify(alertEmails)); }, [alertEmails]);
  const [thresholds, setThresholds] = useState<AlertThresholds>({ hiCrit: 0.3, hiSurv: 0.6 });

  // Fetch global thresholds from backend on mount
  useEffect(() => {
    const base = import.meta.env.VITE_API_URL ?? "";
    if (!base) return; // no API configured
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    fetch(`${base}/seuils/public`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && typeof data.hi_critical === 'number') {
          setThresholds({ hiCrit: data.hi_critical, hiSurv: data.hi_surveillance });
        }
      })
      .catch(() => { /* keep defaults */ })
      .finally(() => clearTimeout(timeoutId));
    return () => { controller.abort(); clearTimeout(timeoutId); };
  }, []);

  useEffect(() => { localStorage.setItem("pl-lang", lang); }, [lang]);
  useEffect(() => {
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    localStorage.setItem("pl-theme", theme);
    document.documentElement.classList.toggle("light", theme === "light");
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const t = (key: string): string => {
    const entry = TR[key];
    if (!entry) return key;
    return entry[lang] || entry.fr || key;
  };

  return (
    <AppContext.Provider value={{
      lang, setLang, theme, setTheme, t,
      alertEmails, setAlertEmails,
      thresholds,
    }}>
      {children}
    </AppContext.Provider>
  );
}
