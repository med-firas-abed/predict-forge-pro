"""
Free template-based report engine — no LLM required.

Generates structured Markdown reports from Supabase data using
statistical analysis and rule-based recommendations.

Supports:
  - Per-machine or all-machines reports
  - Weekly / monthly periods
  - FR / EN / AR languages
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Literal

from core.supabase_client import get_supabase
from routers.seuils import get_thresholds

logger = logging.getLogger(__name__)

Lang = Literal["fr", "en", "ar"]
Period = Literal["weekly", "monthly"]


# ── i18n helpers ──────────────────────────────────────────────────────────────

_T = {
    "title_weekly":     {"fr": "Rapport Hebdomadaire", "en": "Weekly Report", "ar": "تقرير أسبوعي"},
    "title_monthly":    {"fr": "Rapport Mensuel", "en": "Monthly Report", "ar": "تقرير شهري"},
    "generated":        {"fr": "Généré le", "en": "Generated on", "ar": "تم الإنشاء في"},
    "summary":          {"fr": "Résumé Exécutif", "en": "Executive Summary", "ar": "ملخص تنفيذي"},
    "machine_overview": {"fr": "Vue d'ensemble des Machines", "en": "Machine Overview", "ar": "نظرة عامة على الآلات"},
    "hi_analysis":      {"fr": "Analyse Health Index", "en": "Health Index Analysis", "ar": "تحليل مؤشر الصحة"},
    "rul_analysis":     {"fr": "Analyse RUL", "en": "RUL Analysis", "ar": "تحليل العمر المتبقي"},
    "alert_stats":      {"fr": "Statistiques des Alertes", "en": "Alert Statistics", "ar": "إحصائيات التنبيهات"},
    "gmao_tasks":       {"fr": "Tâches GMAO", "en": "GMAO Tasks", "ar": "مهام الصيانة"},
    "cost_analysis":    {"fr": "Analyse des Coûts", "en": "Cost Analysis", "ar": "تحليل التكاليف"},
    "recommendations":  {"fr": "Recommandations", "en": "Recommendations", "ar": "التوصيات"},
    "no_data":          {"fr": "Aucune donnée disponible pour cette période.", "en": "No data available for this period.", "ar": "لا توجد بيانات متاحة لهذه الفترة."},
    "machine":          {"fr": "Machine", "en": "Machine", "ar": "آلة"},
    "status":           {"fr": "Statut", "en": "Status", "ar": "الحالة"},
    "location":         {"fr": "Localisation", "en": "Location", "ar": "الموقع"},
    "current_hi":       {"fr": "HI Actuel", "en": "Current HI", "ar": "مؤشر الصحة الحالي"},
    "trend":            {"fr": "Tendance", "en": "Trend", "ar": "الاتجاه"},
    "avg_hi":           {"fr": "HI Moyen", "en": "Average HI", "ar": "متوسط المؤشر"},
    "min_hi":           {"fr": "HI Min", "en": "Min HI", "ar": "أدنى مؤشر"},
    "max_hi":           {"fr": "HI Max", "en": "Max HI", "ar": "أعلى مؤشر"},
    "total_alerts":     {"fr": "Total alertes", "en": "Total alerts", "ar": "إجمالي التنبيهات"},
    "urgence":          {"fr": "urgence", "en": "urgent", "ar": "عاجل"},
    "surveillance":     {"fr": "surveillance", "en": "monitoring", "ar": "مراقبة"},
    "rul_current":      {"fr": "RUL Actuel", "en": "Current RUL", "ar": "العمر المتبقي الحالي"},
    "days":             {"fr": "jours", "en": "days", "ar": "أيام"},
    "improving":        {"fr": "↗ En amélioration", "en": "↗ Improving", "ar": "↗ تحسن"},
    "stable":           {"fr": "→ Stable", "en": "→ Stable", "ar": "→ مستقر"},
    "degrading":        {"fr": "↘ En dégradation", "en": "↘ Degrading", "ar": "↘ تدهور"},
    "critical_degrading": {"fr": "⚠ Dégradation critique", "en": "⚠ Critical degradation", "ar": "⚠ تدهور حرج"},
    "tasks_open":       {"fr": "tâches ouvertes", "en": "open tasks", "ar": "مهام مفتوحة"},
    "tasks_completed":  {"fr": "tâches terminées", "en": "completed tasks", "ar": "مهام منجزة"},
    "rec_critical":     {"fr": "Intervention immédiate requise. Planifier un arrêt d'urgence pour inspection complète des composants mécaniques et électriques.",
                         "en": "Immediate intervention required. Schedule emergency shutdown for full mechanical and electrical inspection.",
                         "ar": "مطلوب تدخل فوري. جدولة توقف طارئ للفحص الميكانيكي والكهربائي الكامل."},
    "rec_degraded":     {"fr": "Surveillance renforcée recommandée. Planifier une maintenance préventive dans les 2 semaines. Vérifier les vibrations et la température.",
                         "en": "Enhanced monitoring recommended. Schedule preventive maintenance within 2 weeks. Check vibrations and temperature.",
                         "ar": "يوصى بتعزيز المراقبة. جدولة صيانة وقائية خلال أسبوعين. فحص الاهتزازات ودرجة الحرارة."},
    "rec_ok":           {"fr": "Machine en bon état. Maintenir le programme de surveillance régulier.",
                         "en": "Machine in good condition. Maintain regular monitoring schedule.",
                         "ar": "الآلة في حالة جيدة. مواصلة برنامج المراقبة المنتظم."},
    "rec_rul_low":      {"fr": "RUL faible détecté. Commander les pièces de rechange et préparer l'intervention avant la date critique.",
                         "en": "Low RUL detected. Order spare parts and prepare intervention before critical date.",
                         "ar": "تم اكتشاف عمر متبقي منخفض. طلب قطع الغيار والاستعداد للتدخل قبل التاريخ الحرج."},
    "rec_alerts_high":  {"fr": "Nombre élevé d'alertes cette période. Analyser les causes racines et renforcer la maintenance préventive.",
                         "en": "High alert count this period. Analyze root causes and strengthen preventive maintenance.",
                         "ar": "عدد مرتفع من التنبيهات هذه الفترة. تحليل الأسباب الجذرية وتعزيز الصيانة الوقائية."},
    "platform":         {"fr": "PrediTeq — Maintenance Prédictive Industrielle",
                         "en": "PrediTeq — Industrial Predictive Maintenance",
                         "ar": "PrediTeq — الصيانة التنبؤية الصناعية"},
}


def _t(key: str, lang: Lang) -> str:
    return _T.get(key, {}).get(lang, key)


# ── Data fetching ─────────────────────────────────────────────────────────────

def _get_period_bounds(period: Period) -> tuple[str, str]:
    """Return (start_iso, end_iso) for the given period."""
    now = datetime.now(timezone.utc)
    if period == "weekly":
        start = now - timedelta(days=7)
    else:
        start = now - timedelta(days=30)
    return start.isoformat(), now.isoformat()


def _fetch_machines(machine_code: str | None = None) -> list[dict]:
    try:
        sb = get_supabase()
        q = sb.table('machines').select('*')
        if machine_code:
            q = q.eq('code', machine_code)
        return q.execute().data or []
    except Exception as e:
        logger.error("Failed to fetch machines: %s", e)
        return []


def _fetch_hi_history(machine_uuid: str, start_iso: str) -> list[dict]:
    try:
        sb = get_supabase()
        return sb.table('historique_hi').select('valeur_hi, score_if, statut, created_at') \
            .eq('machine_id', machine_uuid) \
            .gte('created_at', start_iso) \
            .order('created_at').execute().data or []
    except Exception as e:
        logger.error("Failed to fetch HI history: %s", e)
        return []


def _fetch_alerts(machine_uuid: str, start_iso: str) -> list[dict]:
    try:
        sb = get_supabase()
        return sb.table('alertes').select('type, titre, severite, created_at, acquitte') \
            .eq('machine_id', machine_uuid) \
            .gte('created_at', start_iso) \
            .order('created_at', desc=True).execute().data or []
    except Exception as e:
        logger.error("Failed to fetch alerts: %s", e)
        return []


def _fetch_rul_predictions(machine_uuid: str, start_iso: str) -> list[dict]:
    try:
        sb = get_supabase()
        return sb.table('predictions_rul').select('rul_jours, ic_bas, ic_haut, created_at') \
            .eq('machine_id', machine_uuid) \
            .gte('created_at', start_iso) \
            .order('created_at').execute().data or []
    except Exception:
        return []


def _fetch_gmao_tasks(machine_uuid: str, start_iso: str) -> list[dict]:
    try:
        sb = get_supabase()
        return sb.table('gmao_taches').select('titre, statut, type, priorite, created_at') \
            .eq('machine_id', machine_uuid) \
            .gte('created_at', start_iso) \
            .order('created_at', desc=True).execute().data or []
    except Exception as e:
        logger.error("Failed to fetch GMAO tasks: %s", e)
        return []


def _fetch_costs(machine_uuid: str) -> list[dict]:
    try:
        sb = get_supabase()
        return sb.table('couts').select('*') \
            .eq('machine_id', machine_uuid) \
            .order('annee', desc=True).order('mois', desc=True) \
            .limit(6).execute().data or []
    except Exception as e:
        logger.error("Failed to fetch costs: %s", e)
        return []


# ── Statistics ────────────────────────────────────────────────────────────────

def _compute_hi_stats(hi_records: list[dict]) -> dict:
    if not hi_records:
        return {}
    vals = [r['valeur_hi'] for r in hi_records if r.get('valeur_hi') is not None]
    if not vals:
        return {}
    first_third = vals[:max(1, len(vals) // 3)]
    last_third = vals[-max(1, len(vals) // 3):]
    delta = sum(last_third) / len(last_third) - sum(first_third) / len(first_third)
    return {
        "count": len(vals),
        "avg": sum(vals) / len(vals),
        "min": min(vals),
        "max": max(vals),
        "latest": vals[-1],
        "delta": delta,
    }


def _compute_alert_stats(alerts: list[dict]) -> dict:
    total = len(alerts)
    urgence = sum(1 for a in alerts if a.get('severite') == 'urgence')
    surveillance = sum(1 for a in alerts if a.get('severite') == 'surveillance')
    ack = sum(1 for a in alerts if a.get('acquitte'))
    return {"total": total, "urgence": urgence, "surveillance": surveillance, "acknowledged": ack}


def _compute_rul_stats(rul_records: list[dict]) -> dict:
    if not rul_records:
        return {}
    vals = [r['rul_jours'] for r in rul_records if r.get('rul_jours') is not None]
    if not vals:
        return {}
    return {
        "latest": vals[-1],
        "avg": sum(vals) / len(vals),
        "min": min(vals),
        "max": max(vals),
        "ci_low": rul_records[-1].get('ic_bas'),
        "ci_high": rul_records[-1].get('ic_haut'),
    }


def _hi_trend_label(delta: float, lang: Lang) -> str:
    if delta > 0.05:
        return _t("improving", lang)
    elif delta < -0.1:
        return _t("critical_degrading", lang)
    elif delta < -0.03:
        return _t("degrading", lang)
    return _t("stable", lang)


# ── Report generation ─────────────────────────────────────────────────────────

def generate_report(
    machine_code: str | None = None,
    period: Period = "weekly",
    lang: Lang = "fr",
) -> str:
    """
    Generate a structured Markdown report from Supabase data.
    If machine_code is None, report covers all machines.
    Returns Markdown string.
    """
    start_iso, end_iso = _get_period_bounds(period)
    machines = _fetch_machines(machine_code)

    if not machines:
        return _t("no_data", lang)

    title = _t(f"title_{period}", lang)
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    try:
        thresholds = get_thresholds()
    except Exception:
        thresholds = {"hi_critical": 0.3, "hi_surveillance": 0.6, "rul_critical_days": 7, "rul_surveillance_days": 30}

    lines: list[str] = []
    _a = lines.append

    # ── Header ────────────────────────────────────────────────────────────
    _a(f"# {title}")
    _a(f"*{_t('generated', lang)}: {now_str}*\n")
    _a(f"*{_t('platform', lang)}*\n")
    _a("---\n")

    # Gather per-machine data
    all_machine_data = []
    total_alerts_all = 0
    machines_critical = []
    machines_degraded = []

    for m in machines:
        uuid = m['id']
        code = m['code']
        hi_history = _fetch_hi_history(uuid, start_iso)
        alerts = _fetch_alerts(uuid, start_iso)
        rul_preds = _fetch_rul_predictions(uuid, start_iso)
        tasks = _fetch_gmao_tasks(uuid, start_iso)
        costs = _fetch_costs(uuid)

        hi_stats = _compute_hi_stats(hi_history)
        alert_stats = _compute_alert_stats(alerts)
        rul_stats = _compute_rul_stats(rul_preds)

        total_alerts_all += alert_stats['total']
        statut = m.get('statut', 'unknown')
        if statut == 'critical':
            machines_critical.append(code)
        elif statut == 'degraded':
            machines_degraded.append(code)

        all_machine_data.append({
            "machine": m,
            "hi_stats": hi_stats,
            "alert_stats": alert_stats,
            "rul_stats": rul_stats,
            "tasks": tasks,
            "costs": costs,
        })

    # ── Executive Summary ─────────────────────────────────────────────────
    _a(f"## 1. {_t('summary', lang)}\n")
    total_machines = len(machines)
    ok_count = total_machines - len(machines_critical) - len(machines_degraded)

    if lang == "fr":
        _a(f"Ce rapport couvre **{total_machines} machine(s)** sur la période "
           f"{'des 7 derniers jours' if period == 'weekly' else 'des 30 derniers jours'}.\n")
        _a(f"- 🟢 **{ok_count}** machine(s) opérationnelle(s)")
        _a(f"- 🟡 **{len(machines_degraded)}** machine(s) dégradée(s)" +
           (f" ({', '.join(machines_degraded)})" if machines_degraded else ""))
        _a(f"- 🔴 **{len(machines_critical)}** machine(s) critique(s)" +
           (f" ({', '.join(machines_critical)})" if machines_critical else ""))
        _a(f"- 🔔 **{total_alerts_all}** alerte(s) totale(s) sur la période\n")
    elif lang == "en":
        _a(f"This report covers **{total_machines} machine(s)** over the "
           f"{'past 7 days' if period == 'weekly' else 'past 30 days'}.\n")
        _a(f"- 🟢 **{ok_count}** operational machine(s)")
        _a(f"- 🟡 **{len(machines_degraded)}** degraded machine(s)" +
           (f" ({', '.join(machines_degraded)})" if machines_degraded else ""))
        _a(f"- 🔴 **{len(machines_critical)}** critical machine(s)" +
           (f" ({', '.join(machines_critical)})" if machines_critical else ""))
        _a(f"- 🔔 **{total_alerts_all}** total alert(s) in this period\n")
    else:
        _a(f"يغطي هذا التقرير **{total_machines} آلة** خلال "
           f"{'الأيام السبعة الماضية' if period == 'weekly' else 'الثلاثين يوماً الماضية'}.\n")
        _a(f"- 🟢 **{ok_count}** آلة تعمل بشكل جيد")
        _a(f"- 🟡 **{len(machines_degraded)}** آلة متدهورة" +
           (f" ({', '.join(machines_degraded)})" if machines_degraded else ""))
        _a(f"- 🔴 **{len(machines_critical)}** آلة حرجة" +
           (f" ({', '.join(machines_critical)})" if machines_critical else ""))
        _a(f"- 🔔 **{total_alerts_all}** تنبيه خلال هذه الفترة\n")

    _a("---\n")

    # ── Per-machine sections ──────────────────────────────────────────────
    for idx, md in enumerate(all_machine_data, start=1):
        m = md["machine"]
        code = m['code']
        nom = m.get('nom', code)
        region = m.get('region', '')
        statut = m.get('statut', 'unknown')
        hi_stats = md["hi_stats"]
        alert_stats = md["alert_stats"]
        rul_stats = md["rul_stats"]
        tasks = md["tasks"]
        costs = md["costs"]

        section_num = idx + 1
        _a(f"## {section_num}. {_t('machine', lang)}: {code} — {nom}\n")
        _a(f"**{_t('location', lang)}**: {region} | **{_t('status', lang)}**: `{statut}`\n")

        # ── HI Analysis ──────────────────────────────────────────────────
        _a(f"### {_t('hi_analysis', lang)}\n")
        if hi_stats:
            trend_label = _hi_trend_label(hi_stats['delta'], lang)
            _a(f"| Metric | Value |")
            _a(f"|--------|-------|")
            _a(f"| {_t('current_hi', lang)} | **{hi_stats['latest']:.4f}** ({hi_stats['latest']*100:.1f}%) |")
            _a(f"| {_t('avg_hi', lang)} | {hi_stats['avg']:.4f} |")
            _a(f"| {_t('min_hi', lang)} / {_t('max_hi', lang)} | {hi_stats['min']:.4f} / {hi_stats['max']:.4f} |")
            _a(f"| {_t('trend', lang)} | {trend_label} (Δ = {hi_stats['delta']:+.4f}) |")
            _a(f"| Points de données | {hi_stats['count']} |\n")
        else:
            _a(f"_{_t('no_data', lang)}_\n")

        # ── RUL Analysis ─────────────────────────────────────────────────
        _a(f"### {_t('rul_analysis', lang)}\n")
        if rul_stats:
            _a(f"| Metric | Value |")
            _a(f"|--------|-------|")
            _a(f"| {_t('rul_current', lang)} | **{rul_stats['latest']:.1f} {_t('days', lang)}** |")
            if rul_stats.get('ci_low') is not None:
                _a(f"| IC 95% | [{rul_stats['ci_low']:.1f} — {rul_stats['ci_high']:.1f}] {_t('days', lang)} |")
            _a(f"| {_t('avg_hi', lang)} | {rul_stats['avg']:.1f} {_t('days', lang)} |")
            _a(f"| Min / Max | {rul_stats['min']:.1f} / {rul_stats['max']:.1f} {_t('days', lang)} |\n")

            if rul_stats['latest'] < thresholds['rul_critical_days']:
                _a(f"> ⚠️ **{_t('rec_rul_low', lang)}**\n")
        else:
            _a(f"_{_t('no_data', lang)}_\n")

        # ── Alert Statistics ─────────────────────────────────────────────
        _a(f"### {_t('alert_stats', lang)}\n")
        if alert_stats['total'] > 0:
            _a(f"- {_t('total_alerts', lang)}: **{alert_stats['total']}**")
            _a(f"  - 🔴 {_t('urgence', lang)}: {alert_stats['urgence']}")
            _a(f"  - 🟡 {_t('surveillance', lang)}: {alert_stats['surveillance']}")
            ack_pct = (alert_stats['acknowledged'] / alert_stats['total'] * 100) if alert_stats['total'] else 0
            if lang == "fr":
                _a(f"  - ✅ Acquittées: {alert_stats['acknowledged']} ({ack_pct:.0f}%)\n")
            elif lang == "en":
                _a(f"  - ✅ Acknowledged: {alert_stats['acknowledged']} ({ack_pct:.0f}%)\n")
            else:
                _a(f"  - ✅ تم الاعتراف: {alert_stats['acknowledged']} ({ack_pct:.0f}%)\n")
        else:
            if lang == "fr":
                _a("✅ Aucune alerte sur cette période.\n")
            elif lang == "en":
                _a("✅ No alerts in this period.\n")
            else:
                _a("✅ لا توجد تنبيهات خلال هذه الفترة.\n")

        # ── GMAO Tasks ───────────────────────────────────────────────────
        _a(f"### {_t('gmao_tasks', lang)}\n")
        if tasks:
            open_tasks = [t for t in tasks if t.get('statut') in ('planifiee', 'en_cours')]
            done_tasks = [t for t in tasks if t.get('statut') == 'terminee']
            _a(f"- 📋 {len(open_tasks)} {_t('tasks_open', lang)}")
            _a(f"- ✅ {len(done_tasks)} {_t('tasks_completed', lang)}")
            if open_tasks:
                _a("")
                for t in open_tasks[:5]:
                    prio = t.get('priorite', '—')
                    _a(f"  - `[{prio}]` {t.get('titre', '—')}")
            _a("")
        else:
            if lang == "fr":
                _a("Aucune tâche GMAO sur cette période.\n")
            elif lang == "en":
                _a("No GMAO tasks in this period.\n")
            else:
                _a("لا توجد مهام صيانة خلال هذه الفترة.\n")

        # ── Cost Analysis ────────────────────────────────────────────────
        if costs:
            _a(f"### {_t('cost_analysis', lang)}\n")
            if lang == "en":
                _a("| Period | Labor (TND) | Parts (TND) | Total (TND) |")
            elif lang == "ar":
                _a("| الفترة | العمالة (TND) | القطع (TND) | الإجمالي (TND) |")
            else:
                _a("| Période | Main d'œuvre (TND) | Pièces (TND) | Total (TND) |")
            _a("|---------|-------------------|--------------|-------------|")
            for c in costs[:4]:
                maint = c.get('main_oeuvre', 0) or 0
                pieces = c.get('pieces', 0) or 0
                total = c.get('total', 0) or 0
                _a(f"| {c.get('mois', '?')}/{c.get('annee', '?')} | {maint:,.0f} | {pieces:,.0f} | **{total:,.0f}** |")
            _a("")

        _a("---\n")

    # ── Recommendations ───────────────────────────────────────────────────
    section_num = len(all_machine_data) + 2
    _a(f"## {section_num}. {_t('recommendations', lang)}\n")

    rec_idx = 1
    for md in all_machine_data:
        m = md["machine"]
        code = m['code']
        statut = m.get('statut', 'unknown')
        hi_stats = md["hi_stats"]
        rul_stats = md["rul_stats"]
        alert_stats = md["alert_stats"]

        _a(f"### {code}\n")

        if statut == 'critical':
            _a(f"{rec_idx}. 🔴 {_t('rec_critical', lang)}")
            rec_idx += 1
        elif statut == 'degraded':
            _a(f"{rec_idx}. 🟡 {_t('rec_degraded', lang)}")
            rec_idx += 1
        else:
            _a(f"{rec_idx}. 🟢 {_t('rec_ok', lang)}")
            rec_idx += 1

        if rul_stats and rul_stats.get('latest', 999) < thresholds['rul_critical_days']:
            _a(f"{rec_idx}. ⚠️ {_t('rec_rul_low', lang)}")
            rec_idx += 1

        if alert_stats['total'] > 5:
            _a(f"{rec_idx}. 🔔 {_t('rec_alerts_high', lang)}")
            rec_idx += 1

        # Trend-based recommendation
        if hi_stats and hi_stats.get('delta', 0) < -0.1:
            if lang == "fr":
                _a(f"{rec_idx}. 📉 Dégradation rapide détectée (Δ HI = {hi_stats['delta']:+.4f}). "
                   "Investigations approfondies nécessaires.")
            elif lang == "en":
                _a(f"{rec_idx}. 📉 Rapid degradation detected (Δ HI = {hi_stats['delta']:+.4f}). "
                   "In-depth investigation required.")
            else:
                _a(f"{rec_idx}. 📉 تدهور سريع تم اكتشافه (Δ HI = {hi_stats['delta']:+.4f}). "
                   "يلزم إجراء تحقيق معمق.")
            rec_idx += 1

        _a("")

    # ── Footer ────────────────────────────────────────────────────────────
    _a("---")
    _a(f"*{_t('platform', lang)} — {now_str}*")

    return "\n".join(lines)


# ── PDF generation (reuse from report.py pattern) ─────────────────────────────

def generate_pdf_bytes(markdown_text: str, title: str = "Rapport PrediTeq", lang: str = "fr") -> bytes:
    """Convert Markdown report text to PDF bytes using fpdf2 with Unicode font support."""
    from fpdf import FPDF
    import os

    FONT_DIR = os.path.join(os.path.dirname(__file__), "fonts")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=20)

    # Register Unicode fonts
    noto_regular = os.path.join(FONT_DIR, "NotoSans-Regular.ttf")
    noto_bold = os.path.join(FONT_DIR, "NotoSans-Bold.ttf")
    noto_arabic = os.path.join(FONT_DIR, "NotoSansArabic-Regular.ttf")

    font_family = "Helvetica"  # fallback
    if lang == "ar" and os.path.exists(noto_arabic):
        pdf.add_font("NotoArabic", "", noto_arabic)
        font_family = "NotoArabic"
    elif os.path.exists(noto_regular):
        pdf.add_font("Noto", "", noto_regular)
        if os.path.exists(noto_bold):
            pdf.add_font("Noto", "B", noto_bold)
        font_family = "Noto"

    is_arabic = (lang == "ar" and font_family == "NotoArabic")
    bold_style = "" if is_arabic else "B"  # Arabic font has no bold variant

    pdf.add_page()

    # Header
    pdf.set_font(font_family, bold_style, 18)
    pdf.cell(0, 12, title, new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.set_font(font_family, "", 10)
    pdf.cell(0, 8, f"Généré le {now}", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(8)

    # Body
    pdf.set_font(font_family, "", 11)
    in_table = False
    table_rows: list[list[str]] = []

    for line in markdown_text.split("\n"):
        stripped = line.strip()

        # Table detection
        if stripped.startswith("|") and not stripped.startswith("|--"):
            cols = [c.strip().replace("**", "") for c in stripped.split("|")[1:-1]]
            table_rows.append(cols)
            in_table = True
            continue
        elif stripped.startswith("|--"):
            continue  # skip separator
        elif in_table:
            # Flush table
            _render_table(pdf, table_rows, font_family)
            table_rows = []
            in_table = False

        # Reset X to left margin before rendering any line
        pdf.set_x(pdf.l_margin)

        # Headings
        if stripped.startswith("# "):
            pdf.ln(4)
            pdf.set_font(font_family, bold_style, 16)
            pdf.multi_cell(0, 8, stripped[2:].replace("**", ""))
            pdf.set_font(font_family, "", 11)
        elif stripped.startswith("## "):
            pdf.ln(3)
            pdf.set_font(font_family, bold_style, 14)
            pdf.multi_cell(0, 7, stripped[3:].replace("**", ""))
            pdf.set_font(font_family, "", 11)
        elif stripped.startswith("### "):
            pdf.ln(2)
            pdf.set_font(font_family, bold_style, 12)
            pdf.multi_cell(0, 6, stripped[4:].replace("**", ""))
            pdf.set_font(font_family, "", 11)
        elif stripped.startswith("- ") or stripped.startswith("* "):
            text = stripped[2:].replace("**", "")
            pdf.multi_cell(0, 6, f"  - {text}")
        elif stripped.startswith("> "):
            pdf.set_font(font_family, "", 11)
            pdf.multi_cell(0, 6, f"  {stripped[2:].replace('**', '')}")
            pdf.set_font(font_family, "", 11)
        elif stripped.startswith("---"):
            pdf.ln(2)
            page_w = pdf.w - pdf.l_margin - pdf.r_margin
            pdf.line(pdf.get_x(), pdf.get_y(), pdf.get_x() + page_w, pdf.get_y())
            pdf.ln(2)
        elif stripped.startswith("*") and stripped.endswith("*") and len(stripped) > 2:
            pdf.set_font(font_family, "", 10)
            pdf.multi_cell(0, 5, stripped.strip("*"))
            pdf.set_font(font_family, "", 11)
        elif stripped == "":
            pdf.ln(3)
        else:
            clean = stripped.replace("**", "")
            pdf.multi_cell(0, 6, clean)

    # Flush any remaining table
    if table_rows:
        _render_table(pdf, table_rows, font_family)

    return pdf.output()


def _render_table(pdf, rows: list[list[str]], font_family: str = "Helvetica"):
    """Render a simple table in the PDF."""
    if not rows:
        return
    n_cols = max(len(r) for r in rows)
    if n_cols == 0:
        return
    page_w = pdf.w - pdf.l_margin - pdf.r_margin
    col_w = page_w / n_cols

    # Header row
    if rows:
        pdf.set_font(font_family, "B", 9)
        for cell in rows[0]:
            pdf.cell(col_w, 6, cell[:40], border=1, align="C")
        pdf.ln()

    # Data rows
    pdf.set_font(font_family, "", 9)
    for row in rows[1:]:
        for i in range(n_cols):
            val = row[i] if i < len(row) else ""
            pdf.cell(col_w, 6, val[:40], border=1)
        pdf.ln()

    pdf.ln(2)
    pdf.set_x(pdf.l_margin)  # ensure X resets
    pdf.set_font(font_family, "", 11)
