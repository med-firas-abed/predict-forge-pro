# `prediteq_ml.diagnostics` — Module d'améliorations diagnostiques

Ce module ajoute cinq briques au pipeline PrediTeq **sans toucher** à
`step1…step7`, `config.py`, `prediteq_api/*` ni `prediteq_frontend/*`. Il vit
dans son propre dossier et s'importe à la demande.

## Raison d'être

Répond à deux observations de l'encadrant académique :

1. **« 71 jours à 82 % HI ne paraît pas logique »** — on ne peut pas répondre
   avec un chiffre unique. Il faut un intervalle et un badge de confiance pour
   que l'utilisateur perçoive l'incertitude du modèle.

2. **« Quel est le problème exact dans la machine ? »** — un régresseur RUL
   prédit *quand*, jamais *quoi*. Il faut un module de diagnostic séparé pour
   identifier les modes de défaillance probables.

## Les 5 briques

| #  | Brique                             | Fichier               | Dépendances |
|----|------------------------------------|-----------------------|-------------|
| 1  | RUL avec intervalle p10/p90        | `rul_confidence.py`   | numpy       |
| 2  | Badge de confiance (✓ / ~ / !)     | `rul_confidence.py`   | numpy       |
| 3  | Disclaimers UI (AI Act Art. 13)    | `disclaimers.py`      | aucune      |
| 4  | Règles expertes ISO/IEC/IEEE       | `diagnose.py`         | aucune      |
| 5  | Attribution SHAP par prédiction    | `explain.py`          | shap≥0.45   |

Toutes les dépendances externes (`numpy`, `scikit-learn`, `shap`, `joblib`)
sont **déjà** dans `prediteq_api/requirements.txt`. Rien à installer.

## Démo rapide — 30 secondes

Depuis la racine `pfe_MIME_26/` :

```bash
python prediteq_ml/diagnostics/demo.py
```

Affichera 3 scénarios (sain / dégradation débutante / défaillance proche)
avec les 5 briques appliquées sur chacun. Idéal pour montrer à l'encadrant
en live au moment de la défense.

## Utilisation dans un script Python

```python
from prediteq_ml.diagnostics import (
    predict_with_interval,
    confidence_badge,
    diagnose,
    explain_prediction,
    disclaimers,
)
import joblib, numpy as np

rf = joblib.load("prediteq_ml/models/random_forest_rul.pkl")
X = np.array([[...]])  # vecteur 17 features dans l'ordre step5

# Items 1+2
pred = predict_with_interval(rf, X)
print(pred.format_ui())          # '60–85 j'
print(pred.confidence)            # ConfidenceLevel.MEDIUM
print(pred.cvi)                   # 0.27

# Item 3
print(disclaimers.RUL_NATURE)

# Item 4
alerts = diagnose({"rms_mms": 4.8, "temp_mot_c": 72, ...})
for a in alerts:
    print(a.severity, a.cause, a.action, a.refs)

# Item 5
explanation = explain_prediction(rf, X, top_k=5)
for c in explanation["contributions"]:
    print(f"{c.feature:<30} {c.impact_days:+.1f} j")
```

## Intégration à l'API (à faire après la soutenance)

**Le backend n'est pas touché pour l'instant** — conformément à la
consigne. Voici néanmoins la procédure pour brancher ce module dans
`prediteq_api/` en temps voulu. Tout tient en deux fichiers nouveaux,
sans modification des existants.

### Étape 1 — Nouveau routeur `prediteq_api/routers/diagnostics.py`

```python
from fastapi import APIRouter, HTTPException
from prediteq_ml.diagnostics import (
    predict_with_interval,
    diagnose,
    explain_prediction,
    disclaimers,
)
from ..ml.loader import get_rf_model
from ..telemetry import build_feature_vector, fetch_current_features

router = APIRouter(prefix="/machines", tags=["diagnostics"])

@router.get("/{machine_id}/rul-interval")
def rul_with_interval(machine_id: str):
    X = build_feature_vector(machine_id)
    pred = predict_with_interval(get_rf_model(), X)
    return {**pred.to_dict(), "disclaimer": disclaimers.RUL_NATURE}

@router.get("/{machine_id}/diagnose")
def diagnose_machine(machine_id: str):
    features = fetch_current_features(machine_id)
    return {"diagnoses": [d.to_dict() for d in diagnose(features)]}

@router.get("/{machine_id}/explain")
def explain_rul(machine_id: str):
    X = build_feature_vector(machine_id)
    result = explain_prediction(get_rf_model(), X, top_k=5)
    # Sérialiser les dataclass → dict
    result["contributions"] = [c.to_dict() for c in result["contributions"]]
    return result
```

### Étape 2 — Enregistrer le routeur dans `prediteq_api/main.py`

Une seule ligne à ajouter :

```python
from .routers import diagnostics
app.include_router(diagnostics.router)
```

C'est tout. Les endpoints existants (`/machines/{id}/status`, etc.) ne sont
pas touchés. Le nouveau routeur est opt-in : les frontends qui ne l'appellent
pas continuent à fonctionner identiquement.

### Étape 3 — Côté frontend (optionnel)

Trois composants à ajouter dans `prediteq_frontend/components/` :

- `RulIntervalCard.tsx` — remplace/complète la carte "RUL ESTIMÉ" existante
- `DiagnosisPanel.tsx` — nouvelle section sous les capteurs
- `ExplanationDrawer.tsx` — drawer latéral ouvert par clic sur "?"

Aucune modification des composants existants requise — les nouvelles cartes
s'insèrent dans le dashboard, les anciennes restent.

## Fondement scientifique

Chaque brique cite ses sources dans ses docstrings. Liste agrégée :

- **Breiman (2001)** — Random Forests
- **Meinshausen (2006)** — Quantile Regression Forests (IC sans hypothèse gaussienne)
- **Shapley (1953)** — A Value for N-Person Games (théorie sous-jacente à SHAP)
- **Lundberg & Lee (NeurIPS 2017)** — TreeSHAP, algorithme exact polynomial
- **ISO 10816-3:2009** — Zones de sévérité vibration RMS
- **IEC 60034-1:2017** — Limites thermiques moteur, classes d'isolation
- **IEEE Std 1856-2017** — Prognostics for Systems (persistance, IC)
- **IEEE Std 117-2015** — Règle d'Arrhenius (durée de vie isolation)
- **Harris (2001)** — Rolling Bearing Analysis
- **Thomson & Fenger (2001)** — MCSA pour défauts moteur induction
- **Règlement (UE) 2024/1689 (AI Act)** — Article 13, transparence

## Auto-tests

Chaque module expose un `__main__` exécutable :

```bash
python prediteq_ml/diagnostics/rul_confidence.py   # items 1+2
python prediteq_ml/diagnostics/diagnose.py         # item 4
python prediteq_ml/diagnostics/explain.py          # item 5 (nécessite shap)
python prediteq_ml/diagnostics/disclaimers.py      # item 3 (aperçu texte)
python prediteq_ml/diagnostics/demo.py             # tout ensemble
```

Aucun test nécessite de réseau, de base de données ou de re-entraînement.

## Ce qui n'est PAS dans ce module (par design)

- **Classifieur de mode de défaillance ML** — nécessite régénération du
  dataset avec profils BPFO / BPFI / balourd étiquetés. C'est la v2
  (chapitre « Perspectives » du rapport).
- **Analyse spectrale FFT** — nécessite passage du capteur VT-V122 de 1 Hz
  à 2 kHz (limite de Shannon-Nyquist pour fr = 23.5 Hz). Prérequis matériel.
- **Recalibration empirique `RUL_MIN_TO_DAY`** — nécessite 3+ mois de
  données de production réelles sur Aroteq. Procédure documentée mais non
  exécutable avant déploiement.

Ces trois items restent en section « Perspectives » du mémoire.

## Auteur

Firas Zouari — ISAMM PFE 2026. Module ajouté après observations de
l'encadrant académique sur les limites de l'estimation RUL ponctuelle et
le besoin d'un diagnostic actionnable.
