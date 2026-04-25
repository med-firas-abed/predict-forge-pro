import io
import json
import logging
import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel

from core.config import settings
from core.supabase_client import get_supabase
from core.auth import CurrentUser, require_auth, get_machine_filter
from core.rate_limit import check_user_rate
from ml.engine_manager import get_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/report", tags=["report"])

SYSTEM_PROMPT = (
    "Tu es un expert en maintenance prédictive industrielle. "
    "Génère un rapport technique structuré en français. "
    "Utilise des titres clairs, des recommandations concrètes, "
    "et des données chiffrées. Format Markdown."
)


class ReportRequest(BaseModel):
    machine_id: str  # machine code (e.g. ASC-A1)


def _gather_context(code: str, user: CurrentUser) -> tuple[dict, dict, str]:
    """Fetch all data needed for a report. Returns (machine, context_data, user_prompt)."""
    sb = get_supabase()

    try:
        machine_res = sb.table('machines').select('*').eq('code', code).execute()
    except Exception as e:
        logger.error("DB error fetching machine %s: %s", code, e)
        raise HTTPException(502, "Erreur base de données")
    if not machine_res.data:
        raise HTTPException(404, f"Machine '{code}' not found")
    machine = machine_res.data[0]
    machine_uuid = machine['id']

    machine_filter = get_machine_filter(user)
    if machine_filter and machine_uuid != machine_filter:
        raise HTTPException(403, "Accès interdit à cette machine")

    try:
        alerts_res = sb.table('alertes').select('*') \
            .eq('machine_id', machine_uuid) \
            .order('created_at', desc=True) \
            .limit(10).execute()
    except Exception:
        alerts_res = type('R', (), {'data': []})()  # empty fallback

    try:
        tasks_res = sb.table('gmao_taches').select('*') \
            .eq('machine_id', machine_uuid) \
            .order('created_at', desc=True) \
            .limit(5).execute()
    except Exception:
        tasks_res = type('R', (), {'data': []})()  # empty fallback

    try:
        costs_res = sb.table('couts').select('*') \
            .eq('machine_id', machine_uuid) \
            .order('annee', desc=True) \
            .order('mois', desc=True) \
            .limit(3).execute()
    except Exception:
        costs_res = type('R', (), {'data': []})()

    manager = get_manager()
    last_result = manager.last_results.get(code)
    rul_result = manager.predict_rul(code)
    engine_status = manager.get_status(code)

    context_data = {
        "machine": machine,
        "alertes_recentes": alerts_res.data,
        "taches_gmao": tasks_res.data,
        "couts_3_mois": costs_res.data,
        "hi_live": last_result,
        "rul_live": rul_result,
        "engine_status": engine_status,
    }

    user_prompt = (
        f"Génère un rapport de maintenance prédictive pour la machine {code} "
        f"({machine.get('nom', '')}) située à {machine.get('region', '')}.\n\n"
        f"Données complètes :\n```json\n{json.dumps(context_data, indent=2, default=str)}\n```\n\n"
        "Le rapport doit inclure :\n"
        "1. Résumé de l'état de santé actuel\n"
        "2. Analyse des tendances (HI, alertes)\n"
        "3. Estimation RUL et interprétation\n"
        "4. Historique des interventions\n"
        "5. Analyse des coûts\n"
        "6. Recommandations concrètes avec priorités\n"
    )

    return machine, context_data, user_prompt


@router.post("/generate")
async def generate_report(body: ReportRequest, user: CurrentUser = Depends(require_auth)):
    """
    POST /report/generate
    Fetch machine data, call Groq API, stream Markdown response.
    """
    if not settings.GROQ_API_KEY:
        raise HTTPException(503, "GROQ_API_KEY not configured")
    if not check_user_rate(user.id, limit=10, window=3600):
        raise HTTPException(429, "Limite atteinte — max 10 rapports IA par heure")

    machine, context_data, user_prompt = _gather_context(body.machine_id, user)

    from groq import AsyncGroq
    client = AsyncGroq(api_key=settings.GROQ_API_KEY, timeout=30.0)

    async def event_stream():
        try:
            stream = await client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                max_tokens=1500,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                stream=True,
            )
            async for chunk in stream:
                text = chunk.choices[0].delta.content or ""
                if text:
                    yield text
        except Exception as e:
            logger.error("Groq API error: %s", e)
            yield "\n\n---\nErreur lors de la génération du rapport. Veuillez réessayer."

    return StreamingResponse(event_stream(), media_type="text/plain; charset=utf-8")


@router.post("/pdf")
async def generate_pdf_report(body: ReportRequest,
                               user: CurrentUser = Depends(require_auth)):
    """
    POST /report/pdf
    Generate full report via Groq, then convert to PDF.
    Returns downloadable PDF file with timestamp.
    """
    if not settings.GROQ_API_KEY:
        raise HTTPException(503, "GROQ_API_KEY not configured")
    if not check_user_rate(user.id, limit=10, window=3600):
        raise HTTPException(429, "Limite atteinte — max 10 rapports IA par heure")

    machine, context_data, user_prompt = _gather_context(body.machine_id, user)
    code = body.machine_id

    # Generate full report (non-streaming) — run in thread to avoid blocking event loop
    from groq import Groq
    client = Groq(api_key=settings.GROQ_API_KEY, timeout=30.0)

    def _sync_groq_call():
        return client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=2000,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
        )

    try:
        msg = await asyncio.to_thread(_sync_groq_call)
        report_text = msg.choices[0].message.content
    except Exception as e:
        logger.error("Groq API error (PDF): %s", e)
        raise HTTPException(502, "Report generation failed")

    # Convert Markdown → PDF using fpdf2
    try:
        from fpdf import FPDF
        import os

        FONT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "fonts")

        pdf = FPDF()
        pdf.set_auto_page_break(auto=True, margin=20)

        # Register Unicode fonts (NotoSans for Latin/French, NotoSansArabic for Arabic)
        noto_regular = os.path.join(FONT_DIR, "NotoSans-Regular.ttf")
        noto_bold = os.path.join(FONT_DIR, "NotoSans-Bold.ttf")
        if os.path.exists(noto_regular):
            pdf.add_font("Noto", "", noto_regular)
        if os.path.exists(noto_bold):
            pdf.add_font("Noto", "B", noto_bold)
        font_family = "Noto" if os.path.exists(noto_regular) else "Helvetica"

        pdf.add_page()

        # Header
        pdf.set_font(font_family, "B", 18)
        pdf.cell(0, 12, f"Rapport PrediTeq - {code}", new_x="LMARGIN", new_y="NEXT", align="C")
        pdf.set_font(font_family, "", 10)
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        pdf.cell(0, 8, f"Généré le {now}", new_x="LMARGIN", new_y="NEXT", align="C")

        machine_nom = machine.get('nom', code)
        region = machine.get('region', '')
        pdf.cell(0, 8, f"{machine_nom} — {region}", new_x="LMARGIN", new_y="NEXT", align="C")
        pdf.ln(8)

        # Body — simple Markdown rendering
        pdf.set_font(font_family, "", 11)
        for line in report_text.split("\n"):
            stripped = line.strip()
            if stripped.startswith("# "):
                pdf.ln(4)
                pdf.set_font(font_family, "B", 16)
                pdf.multi_cell(0, 8, stripped[2:])
                pdf.set_font(font_family, "", 11)
            elif stripped.startswith("## "):
                pdf.ln(3)
                pdf.set_font(font_family, "B", 14)
                pdf.multi_cell(0, 7, stripped[3:])
                pdf.set_font(font_family, "", 11)
            elif stripped.startswith("### "):
                pdf.ln(2)
                pdf.set_font(font_family, "B", 12)
                pdf.multi_cell(0, 6, stripped[4:])
                pdf.set_font(font_family, "", 11)
            elif stripped.startswith("- ") or stripped.startswith("* "):
                pdf.multi_cell(0, 6, f"  • {stripped[2:]}")
            elif stripped.startswith("---"):
                pdf.ln(2)
                pdf.line(pdf.get_x(), pdf.get_y(), pdf.get_x() + 170, pdf.get_y())
                pdf.ln(2)
            elif stripped == "":
                pdf.ln(3)
            else:
                # Strip bold markers for PDF
                clean = stripped.replace("**", "").replace("__", "")
                pdf.multi_cell(0, 6, clean)

        # Footer
        pdf.ln(8)
        pdf.set_font(font_family, "", 9)
        pdf.cell(0, 6, "PrediTeq — Maintenance Prédictive Industrielle | ISAMM / Aroteq",
                 new_x="LMARGIN", new_y="NEXT", align="C")

        pdf_bytes = pdf.output()

    except ImportError:
        raise HTTPException(503, "fpdf2 not installed — run: pip install fpdf2")
    except Exception as e:
        logger.error("PDF generation error: %s", e)
        raise HTTPException(500, "PDF generation failed")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M")
    filename = f"rapport_{code}_{timestamp}.pdf"

    return Response(
        content=bytes(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ══════════════════════════════════════════════════════════════════════════════
# FREE template-based endpoints (no LLM required)
# ══════════════════════════════════════════════════════════════════════════════

from typing import Literal

class AutoReportRequest(BaseModel):
    machine_id: str | None = None  # None = all machines
    period: Literal["weekly", "monthly"] = "weekly"
    lang: Literal["fr", "en", "ar"] = "fr"


@router.post("/auto/generate")
async def auto_generate_report(body: AutoReportRequest,
                                user: CurrentUser = Depends(require_auth)):
    """
    POST /report/auto/generate
    Free template-based report — no API key needed.
    Returns plain-text Markdown using real Supabase data.
    Also saves a copy to the rapports table for history.
    """
    from report_engine import generate_report

    try:
        md = generate_report(
            machine_code=body.machine_id,
            period=body.period,
            lang=body.lang,
        )
    except Exception as e:
        logger.error("Auto report generation error: %s", e)
        raise HTTPException(500, "Report generation failed")

    # Save to rapports table for history
    try:
        sb = get_supabase()
        now = datetime.now(timezone.utc)
        machine_part = body.machine_id or "Toutes"
        period_label = "Hebdomadaire" if body.period == "weekly" else "Mensuel"
        titre = f"Rapport {period_label} — {machine_part} — {now.strftime('%d/%m/%Y %H:%M')}"
        sb.table('rapports').insert({
            'machine_code': body.machine_id,
            'period': body.period,
            'lang': body.lang,
            'titre': titre,
            'contenu': md,
        }).execute()
    except Exception as e:
        logger.warning("Could not save report to history: %s", e)

    return StreamingResponse(
        iter([md]),
        media_type="text/plain; charset=utf-8",
    )


@router.post("/auto/pdf")
async def auto_generate_pdf(body: AutoReportRequest,
                             user: CurrentUser = Depends(require_auth)):
    """
    POST /report/auto/pdf
    Free template-based PDF — no API key needed.
    """
    from report_engine import generate_report, generate_pdf_bytes

    try:
        md = generate_report(
            machine_code=body.machine_id,
            period=body.period,
            lang=body.lang,
        )
        pdf_bytes = generate_pdf_bytes(md, title=f"Rapport PrediTeq — {body.period}", lang=body.lang)
    except Exception as e:
        logger.error("Auto PDF generation error: %s", e)
        raise HTTPException(500, "PDF generation failed")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M")
    machine_part = body.machine_id or "all"
    filename = f"rapport_{machine_part}_{body.period}_{timestamp}.pdf"

    return Response(
        content=bytes(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/history")
async def list_reports(user: CurrentUser = Depends(require_auth)):
    """
    GET /report/history
    List saved auto-generated reports (from scheduled jobs).
    """
    sb = get_supabase()
    machine_filter = get_machine_filter(user)

    try:
        q = sb.table('rapports').select('id, machine_code, period, lang, titre, created_at') \
            .order('created_at', desc=True).limit(50)

        if machine_filter:
            # Get the machine code for this user's scoped machine
            m_res = sb.table('machines').select('code').eq('id', machine_filter).execute()
            if m_res.data:
                q = q.eq('machine_code', m_res.data[0]['code'])

        result = q.execute()
        return result.data or []
    except Exception as e:
        logger.error("DB error in report history: %s", e)
        raise HTTPException(502, "Erreur base de données")


@router.get("/history/{report_id}")
async def get_report(report_id: str, user: CurrentUser = Depends(require_auth)):
    """
    GET /report/history/{id}
    Get a specific saved report by ID.
    """
    sb = get_supabase()
    try:
        result = sb.table('rapports').select('*').eq('id', report_id).execute()
    except Exception as e:
        logger.error("DB error fetching report %s: %s", report_id, e)
        raise HTTPException(502, "Erreur base de données")
    if not result.data:
        raise HTTPException(404, "Report not found")

    report = result.data[0]

    # Enforce machine scoping
    machine_filter = get_machine_filter(user)
    if machine_filter:
        try:
            m_res = sb.table('machines').select('code').eq('id', machine_filter).execute()
            user_code = m_res.data[0]['code'] if m_res.data else None
        except Exception:
            user_code = None
        if report.get('machine_code') and report['machine_code'] != user_code:
            raise HTTPException(403, "Accès interdit à ce rapport")

    return report


@router.get("/history/{report_id}/pdf")
async def download_report_pdf(report_id: str, user: CurrentUser = Depends(require_auth)):
    """
    GET /report/history/{id}/pdf
    Download a saved report as PDF.
    """
    sb = get_supabase()
    try:
        result = sb.table('rapports').select('*').eq('id', report_id).execute()
    except Exception as e:
        logger.error("DB error fetching report %s for PDF: %s", report_id, e)
        raise HTTPException(502, "Erreur base de données")
    if not result.data:
        raise HTTPException(404, "Report not found")

    report = result.data[0]

    # Enforce machine scoping (same as GET /history/{id})
    machine_filter = get_machine_filter(user)
    if machine_filter:
        try:
            m_res = sb.table('machines').select('code').eq('id', machine_filter).execute()
            user_code = m_res.data[0]['code'] if m_res.data else None
        except Exception:
            user_code = None
        if report.get('machine_code') and report['machine_code'] != user_code:
            raise HTTPException(403, "Accès interdit à ce rapport")

    contenu = report.get('contenu')
    if not contenu:
        raise HTTPException(404, "Report content is empty")
    from report_engine import generate_pdf_bytes

    try:
        pdf_bytes = generate_pdf_bytes(contenu, title=report.get('titre', 'Rapport PrediTeq'), lang=report.get('lang', 'fr'))
    except Exception as e:
        logger.error("PDF generation error for %s: %s", report_id, e)
        raise HTTPException(500, "PDF generation failed")

    filename = f"rapport_{report.get('machine_code', 'all')}_{report.get('period', '')}_{report_id[:8]}.pdf"
    return Response(
        content=bytes(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
