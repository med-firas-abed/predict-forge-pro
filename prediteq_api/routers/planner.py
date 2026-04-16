"""
Autonomous Maintenance Planner — AI agent that:
1. Analyses RUL trends + HI for all machines
2. Cross-references open GMAO tasks & historical costs
3. Proposes an optimal maintenance schedule (minimize downtime + cost)
4. Can auto-create GMAO tasks in Supabase when approved

POST /planner/generate  — AI generates an optimal plan
POST /planner/approve   — approve a proposed task → insert into gmao_taches
GET  /planner/status    — fleet risk ranking
"""

import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from core.config import settings
from core.supabase_client import get_supabase
from core.auth import CurrentUser, require_admin, get_machine_filter
from core.rate_limit import check_user_rate
from ml.engine_manager import get_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/planner", tags=["planner"])

PLANNER_SYSTEM_PROMPT = (
    "Tu es un planificateur de maintenance prédictive autonome pour PrediTeq. "
    "Tu analyses les données de la flotte d'ascenseurs industriels (SITI FC100L1-4) "
    "et tu proposes un plan de maintenance optimal.\n\n"
    "IMPORTANT: Les données de TOUTES les machines sont disponibles (certaines en temps réel, "
    "d'autres avec des données référentielles statiques). Ne dis JAMAIS 'info indisponible' ou "
    "'données non disponibles'. Utilise les données fournies pour chaque machine.\n\n"
    "Ton objectif: **minimiser le temps d'arrêt et les coûts** tout en assurant la sécurité.\n\n"
    "Format de réponse OBLIGATOIRE en Markdown:\n"
    "1. **Résumé exécutif** — état de la flotte en 2-3 phrases\n"
    "2. **Classement des risques** — tableau des machines par priorité\n"
    "3. **Plan d'action** — pour chaque machine à risque:\n"
    "   - Action recommandée (inspection, maintenance préventive, remplacement pièce)\n"
    "   - Fenêtre d'intervention optimale (date/heure)\n"
    "   - Coût estimé (basé sur l'historique)\n"
    "   - Justification (RUL, HI trend, SHAP factors)\n"
    "4. Propose des tâches concrètes au format ci-dessous (elles seront affichées séparément, "
    "NE LES METS PAS sous un titre '### Tâches GMAO'):\n"
    "   ```task\n"
    "   machine: ASC-XX\n"
    "   titre: Description courte\n"
    "   type: preventive|corrective|inspection\n"
    "   priorite: haute|moyenne|basse\n"
    "   date_planifiee: YYYY-MM-DD\n"
    "   cout_estime: XXXX\n"
    "   description: Justification détaillée\n"
    "   ```\n"
    "5. **Prévision budgétaire** — coût total estimé et comparaison préventif vs correctif\n\n"
    "Sois concret, quantifié, et actionnable. Utilise les données réelles fournies."
)


def _gather_fleet_context(user: CurrentUser) -> dict:
    """Collect all data needed for the planner from all machines."""
    manager = get_manager()
    sb = get_supabase()
    machine_filter = get_machine_filter(user)

    fleet_data = []
    for code, info in manager.machine_cache.items():
        if machine_filter and info['id'] != machine_filter:
            continue

        machine_uuid = info['id']
        last = manager.last_results.get(code, {})
        rul = manager.predict_rul(code)
        raw = manager.last_raw.get(code, {})

        # Recent alerts
        alerts = []
        try:
            res = sb.table('alertes').select('titre, severite, created_at') \
                .eq('machine_id', machine_uuid) \
                .order('created_at', desc=True).limit(5).execute()
            alerts = res.data or []
        except Exception:
            pass

        # Open GMAO tasks
        open_tasks = []
        try:
            res = sb.table('gmao_taches').select('titre, statut, type, date_planifiee, cout_estime') \
                .eq('machine_id', machine_uuid) \
                .in_('statut', ['planifiee', 'en_cours']) \
                .order('created_at', desc=True).execute()
            open_tasks = res.data or []
        except Exception:
            pass

        # Cost history (last 6 months)
        costs = []
        try:
            res = sb.table('couts').select('mois, annee, main_oeuvre, pieces, total') \
                .eq('machine_id', machine_uuid) \
                .order('annee', desc=True).order('mois', desc=True) \
                .limit(6).execute()
            costs = res.data or []
        except Exception:
            pass

        # HI history (last 30 points)
        hi_history = []
        try:
            res = sb.table('historique_hi').select('valeur_hi, created_at') \
                .eq('machine_id', machine_uuid) \
                .order('created_at', desc=True).limit(30).execute()
            hi_history = res.data or []
        except Exception:
            pass

        fleet_data.append({
            "machine_code": code,
            "nom": info.get('nom', ''),
            "region": info.get('region', ''),
            "hi_smooth": last.get('hi_smooth'),
            "zone": last.get('zone'),
            "rul": {
                "days": rul.get('rul_days') if rul else None,
                "ci_low": rul.get('ci_low') if rul else None,
                "ci_high": rul.get('ci_high') if rul else None,
            },
            "sensors": {k: round(v, 3) for k, v in raw.items()} if raw else None,
            "recent_alerts": alerts,
            "open_gmao_tasks": open_tasks,
            "cost_history": costs,
            "hi_trend": hi_history[:10],  # last 10 points for trend
        })

    # Current thresholds
    from routers.seuils import get_thresholds
    thresholds = get_thresholds()

    return {
        "fleet": fleet_data,
        "thresholds": thresholds,
        "date": datetime.now(timezone.utc).isoformat(),
    }


# ─── Fleet risk ranking (no LLM needed) ──────────────────────────────────────

@router.get("/status")
async def fleet_risk_status(user: CurrentUser = Depends(require_admin)):
    """
    GET /planner/status
    Real-time fleet risk ranking — no AI needed, pure data.
    Returns machines sorted by risk (lowest HI first). Admin only.
    """
    manager = get_manager()
    sb = get_supabase()
    machine_filter = None  # Admin sees all machines
    fleet = []

    for code, info in manager.machine_cache.items():
        if machine_filter and info['id'] != machine_filter:
            continue

        last = manager.last_results.get(code, {})
        rul = manager.predict_rul(code)

        hi = last.get('hi_smooth')
        rul_days = rul.get('rul_days') if rul else None

        # Risk score: lower = more urgent (0-100)
        risk_score = 100
        if hi is not None:
            risk_score = min(risk_score, hi * 100)
        if rul_days is not None:
            risk_score = min(risk_score, rul_days / 90 * 100)

        # Open task count
        open_tasks = 0
        try:
            res = sb.table('gmao_taches').select('id') \
                .eq('machine_id', info['id']) \
                .in_('statut', ['planifiee', 'en_cours']).execute()
            open_tasks = len(res.data or [])
        except Exception:
            pass

        fleet.append({
            "machine_code": code,
            "nom": info.get('nom', ''),
            "region": info.get('region', ''),
            "hi": round(hi, 4) if hi is not None else None,
            "rul_days": round(rul_days, 1) if rul_days is not None else None,
            "zone": last.get('zone'),
            "risk_score": round(risk_score, 1),
            "risk_level": "critique" if risk_score < 30 else "surveillance" if risk_score < 60 else "ok",
            "open_tasks": open_tasks,
        })

    fleet.sort(key=lambda m: m['risk_score'])
    return fleet


# ─── AI plan generation ──────────────────────────────────────────────────────

class PlanRequest(BaseModel):
    focus_machine: str | None = None  # Focus on specific machine, or None for all


@router.post("/generate")
async def generate_plan(body: PlanRequest, user: CurrentUser = Depends(require_admin)):
    """
    POST /planner/generate
    AI-powered maintenance plan: analyses fleet data, proposes optimal schedule.
    Streams Markdown with embedded task proposals.
    """
    if not settings.GROQ_API_KEY:
        raise HTTPException(503, "GROQ_API_KEY not configured")
    if not check_user_rate(user.id, limit=10, window=3600):
        raise HTTPException(429, "Limite atteinte — max 10 plans IA par heure")

    context = _gather_fleet_context(user)

    focus_str = ""
    if body.focus_machine:
        focus_str = f"\nFocus particulier sur la machine {body.focus_machine}."

    user_prompt = (
        f"Génère un plan de maintenance optimal pour la flotte PrediTeq.{focus_str}\n\n"
        f"Données de la flotte:\n```json\n{json.dumps(context, indent=2, default=str)}\n```\n\n"
        "Propose des tâches GMAO concrètes avec dates et coûts estimés. "
        "Justifie chaque recommandation par les données RUL, HI et historique."
    )

    from groq import AsyncGroq
    client = AsyncGroq(api_key=settings.GROQ_API_KEY, timeout=30.0)

    async def event_stream():
        try:
            stream = await client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                max_tokens=2500,
                messages=[
                    {"role": "system", "content": PLANNER_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                stream=True,
            )
            async for chunk in stream:
                text = chunk.choices[0].delta.content or ""
                if text:
                    yield text
        except Exception as e:
            logger.error("Planner Groq error: %s", e)
            yield "\n\n---\nErreur lors de la génération du plan. Veuillez réessayer."

    return StreamingResponse(event_stream(), media_type="text/plain; charset=utf-8")


# ─── Approve proposed task → insert into GMAO ────────────────────────────────

class ApproveTaskRequest(BaseModel):
    machine_code: str
    titre: str = Field(..., min_length=3, max_length=200)
    type: Literal["preventive", "corrective", "inspection"] = "preventive"
    priorite: Literal["haute", "moyenne", "basse"] = "moyenne"
    date_planifiee: str | None = None
    cout_estime: float | None = None
    description: str = ""
    technicien: str = ""


@router.post("/approve")
async def approve_task(body: ApproveTaskRequest,
                       user: CurrentUser = Depends(require_admin)):
    """
    POST /planner/approve
    Admin approves a planner-proposed task → creates GMAO entry in Supabase.
    """
    manager = get_manager()
    sb = get_supabase()

    uuid = manager.get_uuid(body.machine_code)
    if not uuid:
        raise HTTPException(404, f"Machine '{body.machine_code}' not found")

    # Check for duplicate open tasks with similar title
    try:
        existing = sb.table('gmao_taches').select('id, titre') \
            .eq('machine_id', uuid) \
            .in_('statut', ['planifiee', 'en_cours']).execute()
        for t in (existing.data or []):
            if t.get('titre', '').lower() == body.titre.lower():
                raise HTTPException(409, f"Tâche similaire déjà ouverte: {t['titre']}")
    except HTTPException:
        raise
    except Exception:
        pass

    insert_data = {
        'machine_id': uuid,
        'titre': body.titre,
        'description': f"[Agent IA] {body.description}",
        'statut': 'planifiee',
        'type': body.type,
        'priorite': body.priorite,
    }
    if body.date_planifiee:
        insert_data['date_planifiee'] = body.date_planifiee
    if body.cout_estime is not None:
        insert_data['cout_estime'] = body.cout_estime
    if body.technicien:
        insert_data['technicien'] = body.technicien

    try:
        sb.table('gmao_taches').insert(insert_data).execute()
    except Exception as e:
        logger.error("GMAO insert error: %s", e)
        raise HTTPException(500, "Échec de créer la tâche")

    logger.info("Planner: approved task '%s' for %s by %s",
                body.titre, body.machine_code, user.email)

    return {
        "status": "ok",
        "message": f"Tâche '{body.titre}' créée pour {body.machine_code}",
        "machine_code": body.machine_code,
    }
