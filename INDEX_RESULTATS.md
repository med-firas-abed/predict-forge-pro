# PrediTeq — Index des résultats, algorithmes et simulations

**Projet** : PrediTeq — Maintenance prédictive moteur d'ascenseur SITI FC100L1-4 (2,2 kW, Aroteq Ben Arous)
**Auteur** : Firas Zouari — ISAMM PFE 2026
**Soutenance** : 23 avril 2026
**Dernière exécution pipeline** : 2026-04-23 (commit `c49899a`, version `2.0-no-leakage`)

Ce document liste **dans l'ordre du pipeline** tous les scripts, données, modèles, scores et figures du projet. Chaque chemin est relatif à la racine du workspace (`pfe_MIME_26/`).

---

## 1. Livrables de soutenance (racine)

| Fichier | Chemin | Description |
|---|---|---|
| Dossier jury complet | `PrediTeq_Dossier_Jury.pdf` | PDF unifié 17 pages : justification de chaque valeur et méthode (À quoi ça sert / Pourquoi cette valeur) |
| Support de soutenance | `PrediTeq_Soutenance.pptx` | Deck 16 slides 16:9 pour la présentation orale |
| Cet index | `INDEX_RESULTATS.md` | Carte de tous les résultats et scripts |
| README projet | `README.md` | Description générale du repo |

---

## 2. Configuration centrale

| Fichier | Chemin | Rôle |
|---|---|---|
| Constantes du projet | `prediteq_ml/config.py` | Toutes les valeurs numériques (moteur, bruit, seuils HI, RF, IF) avec justification scientifique |
| Explication pipeline | `prediteq_ml/PIPELINE_EXPLAINED.txt` | Narration pédagogique étape par étape |

**Constantes clés (extraites de `config.py`) :**

| Nom | Valeur | Référence |
|---|---|---|
| `N_TRAJECTORIES` | 200 | Analogue CMAPSS FD001 (Saxena & Goebel 2008) |
| `TRAJECTORY_LEN_MIN` | 800 min-sim | 48 000 échantillons à 1 Hz |
| `RUL_MIN_TO_DAY` | 9 | Convention d'affichage : 800 min ↔ 90 jours (ISO 281 L10 SKF 6306) |
| `IF_N_ESTIMATORS` | 100 | Liu, Ting & Zhou, ICDM 2008 |
| `IF_CONTAMINATION` | 0,05 | Calibré empiriquement (plot5) |
| `HYBRID_ALPHA` | 0,6 | IF 60 % + RMS 40 % |
| `HI_EXCELLENT / GOOD / CRITICAL` | 0,8 / 0,6 / 0,3 | Zones ISO 10816-3:2009 A/B/C/D |
| `HI_SMOOTH_WINDOW_S` | 120 s | Constante thermique IEC 60034-1 §8.5 |
| `RUL_LOOKBACK_MIN` | 60 | 1 h d'historique HI |
| `RUL_CROSSING_PERSISTENCE` | 3 | IEEE Std 1856-2017 §6.3 |
| `RUL_N_ESTIMATORS` | 300 | Breiman 2001, OOB convergence sur ~4k samples |
| `CMAPSS_N_ESTIMATORS` | 500 | Probst & Boulesteix 2018, dataset ~13k samples |
| `RUL_CV_FOLDS` | 5 | GroupKFold k=5 (Kuhn & Johnson 2013) |
| `TRAIN_RATIO` | 0,80 | Split 80/20 stratifié par profil |
| `SPLIT_SEED` | 42 | Reproductibilité déterministe |

---

## 3. Pipeline ML (scripts, ordre d'exécution)

Exécuter dans l'ordre depuis `prediteq_ml/` : `python steps/stepN_xxx.py`

### Étape 1 — Simulation des trajectoires de dégradation

| Propriété | Valeur |
|---|---|
| Script | `prediteq_ml/steps/step1_simulate.py` |
| Entrée | Aucune (génération synthétique) |
| Sortie | `prediteq_ml/data/raw/trajectories.csv` (≈ 1,3 Go) |
| Contenu | 200 trajectoires × 800 min × 12 features capteurs + cible HI |
| Profils | A linéaire (50) · B exponentiel (50) · C stepwise (50) · D noisy linear (50) |
| Capteurs simulés | RMS vibration (VT-V122), puissance phase (PAC2200), température, humidité |
| Bruit | ±1,5 % VT, ±0,5 % PAC, ±0,1 °C, ±0,5 %HR (profil D : ×3 sur VT) |

### Étape 2 — Feature engineering

| Propriété | Valeur |
|---|---|
| Script | `prediteq_ml/steps/step2_preprocess.py` |
| Entrée | `prediteq_ml/data/raw/trajectories.csv` |
| Sortie | `prediteq_ml/data/processed/features.csv` (≈ 4,6 Go) |
| Fenêtrage | 60 s · statistiques RMS, crest factor, kurtosis, skewness, peak-to-peak |
| Corrélations | temp × puissance, HR × RMS (dérives climatiques captées) |

### Étape 3 — Détection d'anomalies Isolation Forest

| Propriété | Valeur |
|---|---|
| Script | `prediteq_ml/steps/step3_isolation_forest.py` |
| Entrée | `prediteq_ml/data/processed/features.csv` |
| Sortie modèle | `prediteq_ml/models/isolation_forest.pkl` (1,1 Mo) |
| Sortie scores | `prediteq_ml/data/processed/anomaly_scores.csv` (≈ 1,7 Go) |
| Algorithme | Isolation Forest — Liu, Ting & Zhou (ICDM 2008) |
| Hyperparams | `n_estimators=100`, `contamination=0,05`, `random_state=42` |
| Ensemble hybride | IF (α=0,6) + RMS z-score (α=0,4) |

### Étape 4 — Indice de santé (Health Index)

| Propriété | Valeur |
|---|---|
| Script | `prediteq_ml/steps/step4_health_index.py` |
| Entrée | `prediteq_ml/data/processed/features.csv` + `anomaly_scores.csv` |
| Sortie | `prediteq_ml/data/processed/hi.csv` (34 Mo) |
| Paramètres exportés | `prediteq_ml/models/hi_params.json`, `hybrid_params.json`, `scaler_params.json` |
| Zones HI | A ≥ 0,8 (sain) · B 0,6-0,8 (acceptable) · C 0,3-0,6 (dégradé) · D < 0,3 (critique) |
| Lissage | Moyenne glissante 120 s (constante thermique IEC 60034-1) |

### Étape 5 — Régresseur RUL Random Forest

| Propriété | Valeur |
|---|---|
| Script | `prediteq_ml/steps/step5_rul_model.py` |
| Entrée | `prediteq_ml/data/processed/hi.csv` |
| Sortie modèle | `prediteq_ml/models/random_forest_rul.pkl` (58 Mo) |
| Sortie prédictions | `prediteq_ml/data/processed/rul_predictions.csv` (4,1 Mo) |
| Algorithme | Random Forest Regressor — Breiman 2001 |
| Hyperparams | `n_estimators=300`, `max_depth=12`, `min_samples_leaf=10` |
| Features d'entrée | Fenêtre 60 min HI + stats glissantes |
| Cible | Minutes-simulation restantes avant HI < 0,3 persistant (3 points) |
| Split | 80/20 stratifié par profil, GroupKFold k=5 |
| Baselines | DummyRegressor (moyenne) + LinearRegression |

### Étape 6 — Évaluation et métriques

| Propriété | Valeur |
|---|---|
| Script | `prediteq_ml/steps/step6_evaluate.py` |
| Entrée | `prediteq_ml/data/processed/rul_predictions.csv` + `hi.csv` |
| Sortie métriques | `prediteq_ml/outputs/metrics.json` |
| Sortie CV détaillé | `prediteq_ml/outputs/rul_cv_scores.json` |
| Figures | `prediteq_ml/outputs/plots/plot1..plot5` |

### Étape 6B — Validation externe NASA CMAPSS FD001

| Propriété | Valeur |
|---|---|
| Script | `prediteq_ml/steps/step6b_cmapss.py` |
| Données d'entrée | `prediteq_ml/data/cmapss/train_FD001.txt`, `test_FD001.txt`, `RUL_FD001.txt` |
| Sortie | `prediteq_ml/outputs/cmapss_metrics.json` + `plots/plot6_cmapss.png` |
| Algorithme | Pipeline identique (IF → HI → RF) avec `n_estimators=500` |
| Objectif | Prouver la généralisation du pipeline sur benchmark public |

### Étape 7 — Export production

| Propriété | Valeur |
|---|---|
| Script | `prediteq_ml/steps/step7_export.py` |
| Sortie | `prediteq_ml/outputs/mqtt_schema.json` |
| Moteur d'inférence | `prediteq_ml/models/prediteq_engine.py` |
| Rôle | Spécifie le format MQTT pour la télémétrie temps réel vers le backend FastAPI |

### Utilitaire

| Script | Chemin | Rôle |
|---|---|---|
| Générateur trajectoire de test | `prediteq_ml/steps/generate_test_trajectory.py` | Produit `data/raw/test_trajectories.csv` (6,9 Mo) pour démos frontend |

---

## 4. Scores finaux (source : `outputs/metrics.json`, exécution 2026-04-23)

### 4.1 Régression RUL — Random Forest

**Holdout (test stratifié 20 %, 40 trajectoires, 21 434 échantillons) :**

| Métrique | Valeur |
|---|---|
| **R² test** | **0,854** |
| R² train | 0,937 |
| RMSE | 70,71 min-sim / **7,86 jours** |
| MAE | 41,49 min-sim / **4,61 jours** |
| n_train samples / groupes | 76 506 / 154 |
| n_test samples / groupes | 21 434 / 40 |

**Cross-validation GroupKFold k=5 :**

| Métrique | Valeur |
|---|---|
| **R² moyen** | **0,798 ± 0,045** |
| RMSE moyen | 8,80 ± 0,92 jours |
| Fold 1 | R² = 0,838 · RMSE = 7,86 j |
| Fold 2 | R² = 0,806 · RMSE = 8,77 j |
| Fold 3 | R² = 0,805 · RMSE = 8,78 j |
| Fold 4 | R² = 0,831 · RMSE = 8,11 j |
| Fold 5 | R² = 0,712 · RMSE = 10,49 j |

**Baselines (holdout, preuve de non-trivialité) :**

| Baseline | R² | RMSE (jours) |
|---|---|---|
| DummyRegressor (moyenne) | −0,010 | 20,64 |
| LinearRegression | 0,677 | 11,67 |
| **Random Forest (nôtre)** | **0,854** | **7,86** |

**Équilibre par profil dans le split :**

| Profil | Train (total/gardés) | Test (total/gardés) |
|---|---|---|
| A linéaire | 38 / 38 | 10 / 10 |
| B exponentiel | 38 / 38 | 10 / 10 |
| C stepwise | 38 / 38 | 10 / 10 |
| D noisy linear | 40 / 40 | 10 / 10 |

### 4.2 Validation externe NASA CMAPSS FD001 (`cmapss_metrics.json`)

| Métrique | Nôtre | Cible NASA | Verdict |
|---|---|---|---|
| **R²** | **0,886** | 0,87 | ✅ Dépasse |
| RMSE | 14,11 cycles | 18,4 | ✅ Meilleur |
| MAE | 9,64 cycles | 13,2 | ✅ Meilleur |
| Score NASA | 16 296 | — | — |

### 4.3 Détection d'anomalies (`metrics.json`)

| Méthode | Précision | Rappel | F1 |
|---|---|---|---|
| Isolation Forest seul | 0,410 | 1,000 | 0,582 |
| RMS z-score baseline | 0,783 | 1,000 | 0,878 |
| Hybrid ensemble (α=0,6) | 0,760 | 0,877 | 0,814 |
| Hybrid AND (confirmation) | 0,783 | 1,000 | 0,878 |

---

## 5. Figures générées

| Figure | Chemin | Contenu |
|---|---|---|
| Courbes HI | `prediteq_ml/outputs/plots/plot1_hi_curves.png` | 200 trajectoires HI(t) par profil |
| Scatter RUL | `prediteq_ml/outputs/plots/plot2_rul_scatter.png` | Prédit vs Réel sur holdout |
| Timeline anomalies | `prediteq_ml/outputs/plots/plot3_anomaly_timeline.png` | Détections IF sur trajectoires |
| SHAP summary | `prediteq_ml/outputs/plots/plot4_shap_summary.png` | Importance des features (explicabilité) |
| Heatmap sensibilité | `prediteq_ml/outputs/plots/plot5_sensitivity_heatmap.png` | Robustesse `contamination` × `alpha` |
| Validation CMAPSS | `prediteq_ml/outputs/plots/plot6_cmapss.png` | Prédit vs Réel FD001 |

---

## 6. Données

### Données brutes

| Fichier | Chemin | Taille | Rôle |
|---|---|---|---|
| Trajectoires d'entraînement | `prediteq_ml/data/raw/trajectories.csv` | 1,3 Go | 200 simulations × 800 min |
| Trajectoire de test | `prediteq_ml/data/raw/test_trajectories.csv` | 6,9 Mo | Démo frontend |
| CMAPSS train FD001 | `prediteq_ml/data/cmapss/train_FD001.txt` | — | Benchmark NASA |
| CMAPSS test FD001 | `prediteq_ml/data/cmapss/test_FD001.txt` | — | Benchmark NASA |
| CMAPSS RUL FD001 | `prediteq_ml/data/cmapss/RUL_FD001.txt` | — | Labels benchmark |

### Données transformées

| Fichier | Chemin | Taille | Produit par |
|---|---|---|---|
| Features 60 s | `prediteq_ml/data/processed/features.csv` | 4,6 Go | step2 |
| Scores anomalies | `prediteq_ml/data/processed/anomaly_scores.csv` | 1,7 Go | step3 |
| Health Index | `prediteq_ml/data/processed/hi.csv` | 34 Mo | step4 |
| Prédictions RUL | `prediteq_ml/data/processed/rul_predictions.csv` | 4,1 Mo | step5 |

---

## 7. Modèles sérialisés

| Artefact | Chemin | Taille |
|---|---|---|
| Isolation Forest | `prediteq_ml/models/isolation_forest.pkl` | 1,1 Mo |
| Random Forest RUL | `prediteq_ml/models/random_forest_rul.pkl` | 58 Mo |
| Paramètres HI | `prediteq_ml/models/hi_params.json` | — |
| Paramètres hybrid | `prediteq_ml/models/hybrid_params.json` | — |
| Paramètres scaler | `prediteq_ml/models/scaler_params.json` | — |
| Moteur d'inférence | `prediteq_ml/models/prediteq_engine.py` | Classe utilisée par le backend |

---

## 8. Schéma d'intégration

| Artefact | Chemin | Rôle |
|---|---|---|
| Schéma MQTT | `prediteq_ml/outputs/mqtt_schema.json` | Contrat télémétrie ESP32 → FastAPI |
| Backend | `prediteq_api/` | Consomme `prediteq_engine.py` |
| Frontend | `prediteq_frontend/` | Affiche RUL (min-sim ÷ 9 = jours) |

---

## 9. Reproduire le pipeline complet

```bash
cd prediteq_ml
python steps/step1_simulate.py          # ~3 min
python steps/step2_preprocess.py        # ~6 min
python steps/step3_isolation_forest.py  # ~4 min
python steps/step4_health_index.py      # ~2 min
python steps/step5_rul_model.py         # ~5 min
python steps/step6_evaluate.py          # ~2 min (génère plots + metrics.json)
python steps/step6b_cmapss.py           # ~2 min (validation externe)
python steps/step7_export.py            # < 1 s
```

Toutes les sorties sont déterministes (`random_state=42`, `SPLIT_SEED=42`).

---

## 10. Résumé exécutif (à réciter au jury en 30 s)

> *« PrediTeq génère 200 trajectoires synthétiques de dégradation moteur (step 1), les transforme en features temps-fréquence (step 2), détecte les anomalies par Isolation Forest (step 3), construit un indice de santé normalisé sur les zones ISO 10816-3 (step 4), et prédit le RUL par Random Forest 300 arbres (step 5). Le modèle atteint R² = 0,854 en holdout et 0,798 ± 0,045 en cross-validation GroupKFold, avec une MAE de 4,6 jours sur un horizon de 90 jours. Validé sur le benchmark public NASA CMAPSS FD001 à R² = 0,886 (cible NASA : 0,87), il dépasse l'état de l'art sur dataset de référence. »*

---

*Document généré pour faciliter la navigation lors de la soutenance — toute valeur citée est traçable à son fichier source.*
