"""
Étape 7 — Export & Sérialisation
Packager tous les modèles + valider PrediteqEngine + exporter le schéma MQTT.
Sortie : models/prediteq_engine.py (déjà créé), outputs/mqtt_schema.json
"""

import numpy as np
import pandas as pd
import joblib
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from config import *

BASE_DIR    = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
MODELS_DIR  = os.path.join(BASE_DIR, 'models')
OUT_DIR     = os.path.join(BASE_DIR, 'outputs')
OUT_SCHEMA  = os.path.join(OUT_DIR, 'mqtt_schema.json')

os.makedirs(OUT_DIR, exist_ok=True)
sys.path.insert(0, MODELS_DIR)

# ─── Charger tous les artefacts ───────────────────────────────────────────────────

def load_artifacts():
    print("Chargement des artefacts de modèles ...")

    if_model = joblib.load(os.path.join(MODELS_DIR, 'isolation_forest.pkl'))
    rf_model = joblib.load(os.path.join(MODELS_DIR, 'random_forest_rul.pkl'))

    with open(os.path.join(MODELS_DIR, 'scaler_params.json')) as f:
        scaler_params = json.load(f)

    with open(os.path.join(MODELS_DIR, 'hi_params.json')) as f:
        hi_params = json.load(f)

    hybrid_params_path = os.path.join(MODELS_DIR, 'hybrid_params.json')
    if os.path.exists(hybrid_params_path):
        with open(hybrid_params_path) as f:
            hybrid_params = json.load(f)
        print(f"  Paramètres hybrides : alpha={hybrid_params['hybrid_alpha']}, "
              f"seuil={hybrid_params['hybrid_threshold']:.2f}")
    else:
        hybrid_params = None
        print("  Paramètres hybrides : non trouvés (mode IF seul)")

    print(f"  Modèle IF       : {type(if_model).__name__}")
    print(f"  Modèle RF       : {type(rf_model).__name__} "
          f"({len(rf_model.estimators_)} arbres)")
    print(f"  Paramètres scaler : {len(scaler_params)} caractéristiques")
    print(f"  HI params     : p5={hi_params['p5']:.4f}, "
          f"p95={hi_params['p95']:.4f}")

    return if_model, rf_model, scaler_params, hi_params, hybrid_params

# ─── Valider le moteur ────────────────────────────────────────────────────────

def validate_engine(if_model, rf_model, scaler_params, hi_params, hybrid_params):
    print("\nValidation du PrediteqEngine ...")
    from prediteq_engine import PrediteqEngine

    engine = PrediteqEngine(if_model, rf_model, scaler_params, hi_params,
                            hybrid_params=hybrid_params)

    # Simuler 70 secondes de données capteurs saines
    healthy_payload = {
        'rms_mms':      1.1,
        'power_kw':     1.45,
        'temp_c':       22.0,
        'humidity_rh':  65.0,
    }

    # Ajouter toutes les caractéristiques attendues par le scaler
    for feat in scaler_params:
        if feat not in healthy_payload:
            healthy_payload[feat] = scaler_params[feat]['mean']

    print("  Simulation de 70 secondes de mises à jour ...")
    for i in range(70):
        result = engine.update(healthy_payload)

    print(f"  Après 70s : HI={result['hi_smooth']} Zone={result['zone']}")
    print(f"  Buffer IF : {result['buffer_if_len']} | Buffer HI : {result['buffer_hi_len']}")

    # RUL devrait retourner « en préchauffage » (< 60 min écoulées)
    rul = engine.predict_rul()
    print(f"  Statut RUL : {rul['status']}")

    # Simuler 60 minutes (3600 secondes) rapidement
    print("  Simulation de 60 minutes (rapide) ...")
    for i in range(3600):
        engine.update(healthy_payload)

    rul = engine.predict_rul()
    print(f"  RUL après 60 min : {rul['rul_days']} jours "
          f"[{rul['ci_low']} - {rul['ci_high']}]")

    # Test de rejet de valeurs aberrantes
    bad_payload = dict(healthy_payload)
    bad_payload['rms_mms'] = 999.0
    result_bad = engine.update(bad_payload)
    print(f"  Test aberrant : {result_bad.get('error')} -> zone={result_bad['zone']}")

    # Test de payload incomplet
    result_inc = engine.update({'rms_mms': 1.1})
    print(f"  Test incomplet : {result_inc.get('error')} -> zone={result_inc['zone']}")

    # Test de réinitialisation
    engine.reset_after_maintenance()
    status = engine.get_status()
    print(f"  Après réinit : buffer_if={status['buffer_if_len']} "
          f"buffer_hi={status['buffer_hi_len']}")

    print("  Validation du moteur RÉUSSIE.")
    return engine

# ─── Exporter le schéma MQTT ───────────────────────────────────────────────────

def export_mqtt_schema():
    schema = {
        "topic":       "prediteq/{machine_id}/sensors",
        "frequency":   "1 Hz",
        "description": "Payload capteurs temps réel du système de surveillance ascenseur",
        "payload": {
            "machine_id":   {"type": "string",  "example": "AscSITI1",
                             "description": "Identifiant unique machine"},
            "timestamp":    {"type": "string",  "example": "2026-03-15T10:23:00Z",
                             "format": "ISO 8601 UTC"},
            "rms_mms":      {"type": "float",   "unit": "mm/s",
                             "sensor": "VTV122",
                             "healthy_range": [0.8, 1.5],
                             "description": "Vibration RMS"},
            "power_kw":     {"type": "float",   "unit": "kW",
                             "sensor": "PAC2200",
                             "description": "Puissance active par phase"},
            "current_a":    {"type": "float",   "unit": "A",
                             "description": "Courant moteur"},
            "pf":           {"type": "float",   "unit": "sans dimension",
                             "description": "Facteur de puissance cos phi",
                             "healthy_range": [0.76, 0.82]},
            "temp_c":       {"type": "float",   "unit": "degC",
                             "sensor": "HMT370EX",
                             "description": "Température ambiante + surface moteur"},
            "humidity_rh":  {"type": "float",   "unit": "%HR",
                             "sensor": "HMT370EX",
                             "description": "Humidité relative"}
        },
        "response": {
            "hi_smooth":      {"type": "float",  "range": [0, 1],
                               "description": "Indice de Santé lissé"},
            "zone":           {"type": "string",
                               "values": ["Excellent", "Good", "Degraded", "Critical"],
                               "description": "Étiquette de zone de santé"},
            "rul_days":       {"type": "float",
                               "description": "Durée de Vie Résiduelle en jours"},
            "ci_low":         {"type": "float",
                               "description": "Borne basse IC RUL (10ème pct)"},
            "ci_high":        {"type": "float",
                               "description": "Borne haute IC RUL (90ème pct)"}
        },
        "alert_logic": {
            "Degraded":  "Email hebdomadaire à l'admin (hi_smooth < 0.6)",
            "Critical":  "Email immédiat au chef + admin (hi_smooth < 0.3)",
            "cooldown":  "24h entre alertes pour la même machine"
        },
        "data_frequency": {
            "mqtt_ingestion":   "1 Hz — update() appelé chaque seconde",
            "hi_buffer":        "120 points — moyenne glissante 2 min",
            "rul_buffer":       "60 points — 1 valeur/min sur 60 min de rétrospection",
            "rul_prediction":   "Toutes les 60 secondes — predict_rul()",
            "dashboard_refresh":"Sur demande — lit Supabase, pas de recalcul ML",
            "after_maintenance":"reset_after_maintenance() vide tous les buffers"
        }
    }

    with open(OUT_SCHEMA, 'w') as f:
        json.dump(schema, f, indent=2)
    print(f"\n✅ Schéma MQTT sauvegardé -> {OUT_SCHEMA}")

# ─── Résumé ─────────────────────────────────────────────────────────────────────────

def print_summary():
    print("\n" + "="*55)
    print("  PIPELINE ML PREDITEQ — COMPLET")
    print("="*55)
    files = [
        ('models/isolation_forest.pkl',      'Détecteur d\'anomalies IF'),
        ('models/random_forest_rul.pkl',      'Régresseur RUL'),
        ('models/scaler_params.json',         'Normalisation Z-score'),
        ('models/hi_params.json',             'Paramètres HI p5/p95'),
        ('models/hybrid_params.json',         'Paramètres ensemble hybride'),
        ('models/prediteq_engine.py',         'Moteur d\'inférence à état'),
        ('data/processed/features.csv',       '12 caractéristiques ingéniérées'),
        ('data/processed/anomaly_scores.csv', 'Scores d\'anomalie IF'),
        ('data/processed/hi.csv',             'Indice de Santé (lissé)'),
        ('data/processed/rul_predictions.csv','Prédictions RUL + IC'),
        ('outputs/metrics.json',              'Métriques d\'\u00e9valuation'),
        ('outputs/mqtt_schema.json',          'Schéma payload MQTT'),
        ('outputs/plots/plot1_hi_curves.png', 'Courbes HI'),
        ('outputs/plots/plot2_rul_scatter.png','Nuage RUL'),
        ('outputs/plots/plot3_anomaly_timeline.png','Chronologie anomalies'),
        ('outputs/plots/plot4_shap_summary.png',    'Importance SHAP'),
        ('outputs/plots/plot5_sensitivity_heatmap.png','Sensibilité'),
    ]
    for fname, desc in files:
        full = os.path.join(BASE_DIR, fname)
        exists = os.path.exists(full)
        size   = os.path.getsize(full) if exists else 0
        status = f"OK ({size/1024:.1f} KB)" if exists else "MISSING"
        print(f"  {'OK' if exists else 'XX'}  {fname:<45} {desc}")
    print("="*55)

# ─── Principal ─────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    if_model, rf_model, scaler_params, hi_params, hybrid_params = load_artifacts()
    validate_engine(if_model, rf_model, scaler_params, hi_params, hybrid_params)
    export_mqtt_schema()
    print_summary()
    print("\n✅ Étape 7 terminée — pipeline entièrement exporté et validé.")
