"""
AI Chatbot agent — natural language queries about machines, alerts, RUL, SHAP.
Uses Groq (Llama 3.3 70B) with tool-use — free for production.

POST /chat  — send a message, get a streamed AI response
"""

import json
import logging
import re
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from core.config import settings
from core.decision_snapshot import (
    build_machine_decision_snapshot,
    fetch_alert_counts,
    fetch_open_task_counts,
)
from core.supabase_client import get_supabase
from core.auth import CurrentUser, require_auth, get_machine_filter
from core.rate_limit import check_user_rate
from ml.engine_manager import get_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chatbot"])

ChatAudience = Literal["jury", "technician", "dual"]

SYSTEM_PROMPT = (
    "Tu es l'assistant IA de PrediTeq, une plateforme de maintenance prédictive "
    "pour ascenseurs industriels (SITI FC100L1-4). Tu réponds en français de manière "
    "concise et professionnelle. Tu as accès à des outils pour consulter l'état des "
    "machines, les alertes, les prédictions RUL, et l'explicabilité SHAP.\n\n"
    "Règles:\n"
    "- Utilise les outils pour obtenir des données réelles avant de répondre\n"
    "- Donne des recommandations concrètes basées sur les données\n"
    "- Si l'utilisateur demande des infos sur une machine, utilise get_machine_status\n"
    "- Si on te demande pourquoi une machine se dégrade, utilise get_shap_explanation\n"
    "- Formate ta réponse en Markdown léger (gras, listes)\n"
    "- Ne fabrique jamais de données — utilise toujours les outils\n"
    "- Sois bref: 3-5 phrases max sauf si on te demande un détail"
)

# ─── Tool definitions for Groq (OpenAI format) ───────────────────────────────

def _audience_prompt(audience: ChatAudience) -> str:
    if audience == "jury":
        return (
            "Audience cible: jury non technique. Reponds sans jargon, explique HI et RUL en mots "
            "simples, donne peu de chiffres et mets d'abord la conclusion, le risque et l'action."
        )
    if audience == "technician":
        return (
            "Audience cible: techniciens Aroteq. Sois direct, operationnel et chiffre: HI, zone, "
            "RUL si disponible, stress, facteur principal, alertes et action terrain."
        )
    return (
        "Audience cible mixte: jury non technique et techniciens Aroteq. Structure la reponse en "
        "deux couches: 1) En bref; 2) Details terrain. Explique les acronymes au premier usage."
    )


def _build_system_prompt(audience: ChatAudience) -> str:
    return f"{SYSTEM_PROMPT}\n\n{_audience_prompt(audience)}"


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_machine_status",
            "description": (
                "Récupère l'état actuel d'une machine: HI (indice de santé), RUL (durée de vie restante), "
                "capteurs live, nombre d'alertes 24h, statut. "
                "Utilise le code machine (ASC-A1, ASC-B2, ASC-C3)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "machine_code": {
                        "type": "string",
                        "description": "Code machine (ex: ASC-A1, ASC-B2, ASC-C3)",
                    },
                },
                "required": ["machine_code"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_alerts",
            "description": (
                "Récupère les alertes récentes. Peut filtrer par machine et/ou sévérité. "
                "Sévérités: urgence, surveillance."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "machine_code": {
                        "type": "string",
                        "description": "Code machine pour filtrer (optionnel)",
                    },
                    "severite": {
                        "type": "string",
                        "enum": ["urgence", "surveillance"],
                        "description": "Filtrer par sévérité (optionnel)",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Nombre max d'alertes (défaut: 10)",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_shap_explanation",
            "description": (
                "Explique pourquoi une machine a un score d'anomalie donné via SHAP. "
                "Renvoie les contributions de chaque capteur au score. "
                "Utile pour comprendre la cause d'une dégradation."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "machine_code": {
                        "type": "string",
                        "description": "Code machine (ex: ASC-A1)",
                    },
                },
                "required": ["machine_code"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_fleet_overview",
            "description": (
                "Vue d'ensemble de toutes les machines: HI, RUL, statut, nombre d'alertes. "
                "Utile pour comparer les machines ou prioriser les interventions."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_maintenance_tasks",
            "description": (
                "Récupère les tâches de maintenance GMAO: planifiées, en cours, terminées. "
                "Peut filtrer par machine."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "machine_code": {
                        "type": "string",
                        "description": "Code machine pour filtrer (optionnel)",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_cost_history",
            "description": (
                "Historique des coûts de maintenance par machine. "
                "Renvoie main d'oeuvre, pièces, total par mois."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "machine_code": {
                        "type": "string",
                        "description": "Code machine pour filtrer (optionnel)",
                    },
                },
            },
        },
    },
]

# ─── Tool implementations ─────────────────────────────────────────────────────


_MACHINE_CODE_RE = re.compile(r'^[A-Z]{2,5}-[A-Z0-9]{1,5}$')


def _exec_get_machine_status(machine_code: str, user: CurrentUser) -> dict:
    if not _MACHINE_CODE_RE.match(machine_code):
        return {"error": "Code machine invalide"}
    manager = get_manager()
    sb = get_supabase()

    machine_info = manager.get_machine_info(machine_code)
    if not machine_info:
        return {"error": f"Machine '{machine_code}' introuvable"}

    # Enforce scoping
    machine_filter = get_machine_filter(user)
    if machine_filter and machine_info['id'] != machine_filter:
        return {"error": "Accès interdit à cette machine"}

    last = manager.last_results.get(machine_code, {})
    rul = manager.predict_rul(machine_code)
    raw = manager.last_raw.get(machine_code, {})
    status = manager.get_status(machine_code)
    cycles = manager._cycle_counts.get(machine_code, 0)
    anom_count = fetch_alert_counts([machine_info["id"]]).get(machine_info["id"], 0)
    open_task_count = fetch_open_task_counts([machine_info["id"]]).get(machine_info["id"], 0)
    decision = build_machine_decision_snapshot(
        {**machine_info, "code": machine_code},
        manager,
        alerts_24h=anom_count,
        open_tasks=open_task_count,
    )

    return {
        "machine": machine_code,
        "nom": machine_info.get('nom', ''),
        "region": machine_info.get('region', ''),
        "hi_smooth": last.get('hi_smooth'),
        "zone": last.get('zone'),
        "rul_days": rul.get('rul_days') if rul else None,
        "rul_ci_low": rul.get('ci_low') if rul else None,
        "rul_ci_high": rul.get('ci_high') if rul else None,
        "sensors": {k: round(v, 3) for k, v in raw.items()} if raw else None,
        "cycles_today": cycles,
        "alerts_24h": anom_count,
        "open_tasks": open_task_count,
        "engine_uptime_s": status.get('uptime_seconds') if status else None,
        "decision": decision,
    }


def _exec_get_alerts(user: CurrentUser, machine_code: str | None = None,
                     severite: str | None = None, limit: int = 10) -> list:
    sb = get_supabase()
    manager = get_manager()

    query = sb.table('alertes').select('*, machines!inner(code, nom)') \
        .order('created_at', desc=True).limit(limit)

    machine_filter = get_machine_filter(user)
    if machine_filter:
        query = query.eq('machine_id', machine_filter)
    elif machine_code:
        uuid = manager.get_uuid(machine_code)
        if uuid:
            query = query.eq('machine_id', uuid)

    if severite:
        query = query.eq('severite', severite)

    res = query.execute()
    return [
        {
            "machine": a.get('machines', {}).get('code', ''),
            "titre": a.get('titre', ''),
            "description": a.get('description', ''),
            "severite": a.get('severite', ''),
            "acquitte": a.get('acquitte', False),
            "date": a.get('created_at', ''),
        }
        for a in (res.data or [])
    ]


def _exec_get_shap(machine_code: str, user: CurrentUser) -> dict:
    import numpy as np
    manager = get_manager()

    machine_filter = get_machine_filter(user)
    if machine_filter:
        uuid = manager.get_uuid(machine_code)
        if not uuid or uuid != machine_filter:
            return {"error": "Accès interdit à cette machine"}

    last = manager.last_results.get(machine_code)
    if not last:
        return {"error": f"Pas de données pour '{machine_code}' — démarrez le simulateur"}

    buf = manager.buffers.get(machine_code)
    if not buf:
        return {"error": f"Pas de buffer pour '{machine_code}'"}

    from routers.explain import FEATURE_NAMES, _compute_shap

    features = {
        'rms_mms': buf._rms[-1] if buf._rms else 0.0,
        'drms_dt': (buf._rms[-1] - buf._rms[-2]) if len(buf._rms) >= 2 else 0.0,
        'rms_variability': float(np.std(list(buf._rms))) if len(buf._rms) >= 2 else 0.0,
        'p_mean_kw': float(np.mean(list(buf._power))) if buf._power else 0.0,
        'p_rms_kw': float(np.sqrt(np.mean([p**2 for p in buf._power]))) if buf._power else 0.0,
        'dp_dt': (buf._power[-1] - buf._power[-2]) if len(buf._power) >= 2 else 0.0,
        'e_cycle_kwh': buf._e_cycle_kwh,
        'duration_ratio': buf._duration_ratio,
        't_mean_c': float(np.mean(list(buf._temp))) if buf._temp else 0.0,
        'dt_dt': (buf._temp_means[-1] - buf._temp_means[-61]) / 60.0 if len(buf._temp_means) > 60 else 0.0,
        'hr_std': float(np.std(list(buf._humidity))) if len(buf._humidity) >= 2 else 0.0,
        'corr_t_p': 0.0,
    }
    if len(buf._tp_pairs) >= 60:
        arr = np.array(list(buf._tp_pairs))
        t_std = float(np.std(arr[:, 0]))
        p_std = float(np.std(arr[:, 1]))
        if t_std > 1e-8 and p_std > 1e-8:
            c = float(np.corrcoef(arr[:, 0], arr[:, 1])[0, 1])
            features['corr_t_p'] = 0.0 if np.isnan(c) else c

    # Normalize features before SHAP (IF model trained on z-scored data)
    scaler = manager._scaler
    norm_features = {}
    for fname in FEATURE_NAMES:
        val = features.get(fname, 0.0)
        mean = scaler[fname]['mean']
        std = scaler[fname]['std']
        norm_features[fname] = (val - mean) / std

    try:
        shap_contributions = _compute_shap(manager._if, norm_features)
    except Exception as e:
        return {"error": f"SHAP failed: {e}"}

    # Human-readable feature names
    LABELS = {
        'rms_mms': 'Vibration RMS', 'drms_dt': 'Variation vibration',
        'rms_variability': 'Variabilité vibration', 'p_mean_kw': 'Puissance moyenne',
        'p_rms_kw': 'Puissance RMS', 'dp_dt': 'Variation puissance',
        'e_cycle_kwh': 'Énergie par cycle', 'duration_ratio': 'Ratio durée montée',
        't_mean_c': 'Température moyenne', 'dt_dt': 'Variation température',
        'hr_std': 'Variabilité humidité', 'corr_t_p': 'Corrélation temp/puissance',
    }

    return {
        "machine": machine_code,
        "hi_smooth": last.get('hi_smooth'),
        "zone": last.get('zone'),
        "top_3_factors": [
            {"feature": LABELS.get(k, k), "contribution": round(v, 4)}
            for k, v in list(shap_contributions.items())[:3]
        ],
        "all_contributions": {
            LABELS.get(k, k): round(v, 4)
            for k, v in shap_contributions.items()
        },
    }


def _exec_get_fleet(user: CurrentUser) -> list:
    manager = get_manager()
    result = []

    machine_filter = get_machine_filter(user)
    machine_ids = []
    scoped_machines: list[tuple[str, dict]] = []

    for code, info in manager.machine_cache.items():
        if machine_filter and info['id'] != machine_filter:
            continue
        scoped_machines.append((code, info))
        machine_ids.append(info["id"])

    alert_counts = fetch_alert_counts(machine_ids)
    open_task_counts = fetch_open_task_counts(machine_ids)

    for code, info in scoped_machines:
        last = manager.last_results.get(code, {})
        rul = manager.predict_rul(code)
        decision = build_machine_decision_snapshot(
            {**info, "code": code},
            manager,
            alerts_24h=alert_counts.get(info["id"], 0),
            open_tasks=open_task_counts.get(info["id"], 0),
        )

        result.append({
            "machine": code,
            "nom": info.get('nom', ''),
            "region": info.get('region', ''),
            "hi_smooth": last.get('hi_smooth'),
            "zone": last.get('zone'),
            "rul_days": rul.get('rul_days') if rul else None,
            "alerts_24h": alert_counts.get(info["id"], 0),
            "open_tasks": open_task_counts.get(info["id"], 0),
            "decision": decision,
        })

    return sorted(
        result,
        key=lambda machine: (machine.get("decision") or {}).get("urgency_score", 0),
        reverse=True,
    )


def _exec_get_tasks(user: CurrentUser, machine_code: str | None = None) -> list:
    sb = get_supabase()
    manager = get_manager()

    query = sb.table('gmao_taches').select('*, machines!inner(code, nom)') \
        .order('created_at', desc=True).limit(10)

    machine_filter = get_machine_filter(user)
    if machine_filter:
        query = query.eq('machine_id', machine_filter)
    elif machine_code:
        uuid = manager.get_uuid(machine_code)
        if uuid:
            query = query.eq('machine_id', uuid)

    res = query.execute()
    return [
        {
            "machine": t.get('machines', {}).get('code', ''),
            "titre": t.get('titre', ''),
            "statut": t.get('statut', ''),
            "type": t.get('type', ''),
            "technicien": t.get('technicien', ''),
            "date_planifiee": t.get('date_planifiee', ''),
            "cout_estime": t.get('cout_estime'),
        }
        for t in (res.data or [])
    ]


def _exec_get_costs(user: CurrentUser, machine_code: str | None = None) -> list:
    sb = get_supabase()
    manager = get_manager()

    query = sb.table('couts').select('*, machines!inner(code)') \
        .order('annee', desc=True).order('mois', desc=True).limit(12)

    machine_filter = get_machine_filter(user)
    if machine_filter:
        query = query.eq('machine_id', machine_filter)
    elif machine_code:
        uuid = manager.get_uuid(machine_code)
        if uuid:
            query = query.eq('machine_id', uuid)

    res = query.execute()
    return [
        {
            "machine": c.get('machines', {}).get('code', ''),
            "mois": c.get('mois'),
            "annee": c.get('annee'),
            "main_oeuvre": c.get('main_oeuvre'),
            "pieces": c.get('pieces'),
            "total": c.get('total'),
        }
        for c in (res.data or [])
    ]


def _dispatch_tool(name: str, args: dict, user: CurrentUser) -> str:
    """Execute a tool call and return JSON result."""
    try:
        if name == "get_machine_status":
            result = _exec_get_machine_status(args.get("machine_code", ""), user)
        elif name == "get_alerts":
            result = _exec_get_alerts(
                user,
                machine_code=args.get("machine_code"),
                severite=args.get("severite"),
                limit=args.get("limit", 10),
            )
        elif name == "get_shap_explanation":
            result = _exec_get_shap(args.get("machine_code", ""), user)
        elif name == "get_fleet_overview":
            result = _exec_get_fleet(user)
        elif name == "get_maintenance_tasks":
            result = _exec_get_tasks(user, args.get("machine_code"))
        elif name == "get_cost_history":
            result = _exec_get_costs(user, args.get("machine_code"))
        else:
            result = {"error": f"Unknown tool: {name}"}
    except Exception as e:
        logger.error("Tool dispatch error (%s): %s", name, e)
        result = {"error": f"Tool execution failed: {e}"}

    return json.dumps(result, default=str, ensure_ascii=False)


# ─── Chat endpoint ────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: list[dict] = Field(default_factory=list, max_length=20)
    audience: ChatAudience = "dual"


@router.post("")
async def chat(body: ChatRequest, user: CurrentUser = Depends(require_auth)):
    """
    POST /chat
    Send a message, get a streamed AI response.
    Groq Llama uses tool-use to query real machine data before answering.
    """
    if not check_user_rate(user.id, limit=15, window=3600):
        raise HTTPException(429, "Limite atteinte — max 15 requêtes IA par heure")

    if not settings.GROQ_API_KEY:
        raise HTTPException(503, "GROQ_API_KEY not configured")

    from groq import Groq

    client = Groq(api_key=settings.GROQ_API_KEY, timeout=30.0)

    # Build messages: system + history + new user message
    messages = [{"role": "system", "content": _build_system_prompt(body.audience)}]
    for msg in body.history[-16:]:
        role = msg.get("role", "user")
        if role in ("user", "assistant"):
            messages.append({"role": role, "content": msg.get("content", "")})
    messages.append({"role": "user", "content": body.message})

    # Agentic loop: keep calling Groq until we get a final text response
    max_rounds = 5

    for _ in range(max_rounds):
        try:
            response = await asyncio.to_thread(
                client.chat.completions.create,
                model="llama-3.3-70b-versatile",
                max_tokens=1024,
                messages=messages,
                tools=TOOLS,
                tool_choice="auto",
            )
        except Exception as e:
            logger.error("Groq API error: %s", e)
            return StreamingResponse(
                iter(["Erreur de l'IA. Veuillez réessayer."]),
                media_type="text/plain; charset=utf-8",
            )

        choice = response.choices[0]
        assistant_msg = choice.message

        # Check if the model wants to use tools
        if assistant_msg.tool_calls:
            # Append the assistant message (with tool_calls)
            messages.append({
                "role": "assistant",
                "content": assistant_msg.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in assistant_msg.tool_calls
                ],
            })

            # Execute each tool call and append results
            for tc in assistant_msg.tool_calls:
                try:
                    args = json.loads(tc.function.arguments)
                except (json.JSONDecodeError, TypeError):
                    args = {}
                result_str = _dispatch_tool(tc.function.name, args, user)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result_str,
                })
            continue

        # Final text response — stream it
        final_text = assistant_msg.content or ""

        async def stream_response():
            chunk_size = 20
            for i in range(0, len(final_text), chunk_size):
                yield final_text[i:i + chunk_size]

        return StreamingResponse(stream_response(), media_type="text/plain; charset=utf-8")

    # Fallback if max rounds exceeded
    return StreamingResponse(
        iter(["Désolé, je n'ai pas pu finaliser ma réponse. Veuillez reformuler votre question."]),
        media_type="text/plain; charset=utf-8",
    )
