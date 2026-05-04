# PrediTeq — Index des résultats, algorithmes et simulations

**Projet** : PrediTeq — Maintenance prédictive moteur d'ascenseur SITI FC100L1-4 (2,2 kW, Aroteq Ben Arous)
**Auteur** : Firas Zouari — ISAMM PFE 2026
**Soutenance** : 23 avril 2026
**Dernière exécution pipeline** : 2026-04-27 (base commit `95d8943`, artefacts régénérés en working tree local, version `2.0-no-leakage`)

Ce document liste **dans l'ordre du pipeline** tous les scripts, données, modèles, scores et figures du projet. Chaque chemin est relatif à la racine du workspace (`pfe_MIME_26/`).

**État actuel des artefacts** : les artefacts bruts et transformés couvrent de nouveau **200 trajectoires** de bout en bout (`trajectories.csv` → `features.csv` → `anomaly_scores.csv` → `hi.csv`). `rul_predictions.csv` reste, par conception, un artefact de **holdout test** limité aux `40` trajectoires du split de validation.

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
| `RUL_MIN_TO_DAY` | 9 | Convention historique d'affichage du dataset synthétique : 800 min ↔ 90 jours ; utilisée seulement en fallback avant correction par rythme observé |
| `IF_N_ESTIMATORS` | 100 | Liu, Ting & Zhou, ICDM 2008 |
| `IF_CONTAMINATION` | 0,05 | Calibré empiriquement (plot5) |
| `HYBRID_ALPHA` | 0,2 | IF 20 % + RMS 80 % (recalibration train-only) |
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
| Contenu | 200 trajectoires brutes × 800 min × 12 features capteurs + cible HI |
| Profils | A linéaire (50) · B exponentiel / quadratique (50) · C stepwise (50) · D noisy linear (50) |
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
| Normalisation | Z-score appris sur la 1re heure saine du split train stratifié |

### Étape 3 — Détection d'anomalies Isolation Forest

| Propriété | Valeur |
|---|---|
| Script | `prediteq_ml/steps/step3_isolation_forest.py` |
| Entrée | `prediteq_ml/data/processed/features.csv` |
| Sortie modèle | `prediteq_ml/models/isolation_forest.pkl` (1,1 Mo) |
| Sortie scores | `prediteq_ml/data/processed/anomaly_scores.csv` (≈ 1,7 Go) |
| Algorithme | Isolation Forest — Liu, Ting & Zhou (ICDM 2008) |
| Hyperparams | `n_estimators=100`, `contamination=0,05`, `random_state=42` |
| Ensemble hybride | IF (α=0,2) + RMS z-score (α=0,8), seuil optimisé train = `0,29` |

### Étape 4 — Indice de santé (Health Index)

| Propriété | Valeur |
|---|---|
| Script | `prediteq_ml/steps/step4_health_index.py` |
| Entrée | `prediteq_ml/data/processed/features.csv` + `anomaly_scores.csv` |
| Sortie | `prediteq_ml/data/processed/hi.csv` (≈ 33,7 Mo) |
| Paramètres exportés | `prediteq_ml/models/hi_params.json`, `hybrid_params.json`, `scaler_params.json` |
| Zones HI | A ≥ 0,8 (sain) · B 0,6-0,8 (acceptable) · C 0,3-0,6 (dégradé) · D < 0,3 (critique) |
| Lissage | Moyenne glissante 120 s (constante thermique IEC 60034-1) |
| Corrélation observée | `r(hi_smooth, simulated_hi) = 0,943` sur l'artefact courant |

### Étape 5 — Régresseur RUL Random Forest

| Propriété | Valeur |
|---|---|
| Script | `prediteq_ml/steps/step5_rul_model.py` |
| Entrée | `prediteq_ml/data/processed/hi.csv` |
| Sortie modèle | `prediteq_ml/models/random_forest_rul.pkl` (≈ 133,8 Mo) |
| Sortie prédictions | `prediteq_ml/data/processed/rul_predictions.csv` (≈ 4,6 Mo) |
| Algorithme | Random Forest Regressor — Breiman 2001 |
| Hyperparams | `n_estimators=300`, `max_depth=16`, `min_samples_leaf=10`, `max_features='sqrt'` |
| Features d'entrée | Fenêtre 60 min HI + stats glissantes |
| Cible | Minutes-simulation restantes avant HI < 0,3 persistant (3 points) |
| Split | 80/20 stratifié par profil, GroupKFold k=5 |
| Baselines | DummyRegressor (moyenne) + LinearRegression |

#### Lecture jury — HI, FPT, RUL et L10

Pour éviter toute confusion en soutenance, il faut distinguer **4 couches** :

| Notion | Rôle | Question à laquelle elle répond |
|---|---|---|
| `HI` | État de santé courant | "Dans quel état est la machine maintenant ?" |
| `FPT` | Gate méthodologique du pronostic | "A partir de quand a-t-on le droit scientifique d'afficher un RUL chiffré ?" |
| `RUL` | Pronostic personnalisé | "Si la dégradation continue ainsi, combien de temps/cycles restent-ils ?" |
| `L10` | Référence statistique du roulement | "Combien dure typiquement le composant, indépendamment du pronostic ML ?" |

Règles actuelles du projet :

1. **HI est toujours prioritaire** : il est calculé en ligne par le moteur d'inférence et peut être affiché très tôt.
2. **Le RUL n'est pas toujours affiché** : on applique un gate `FPT` conforme PHM.
3. **Avant FPT**, on montre `L10`, pas un faux RUL précis.
4. **Après FPT et après warm-up**, on montre un RUL chiffré avec incertitude.

Seuils à ne pas confondre :

| Seuil | Valeur | Usage |
|---|---:|---|
| `FPT_HI_THRESHOLD` | `0.80` | Décide si le frontend a le droit d'afficher un RUL chiffré |
| `HI_GOOD` | `0.60` | Frontière de zone HI (`Good` -> `Degraded`) |
| `HI_CRITICAL` | `0.30` | Frontière critique HI + seuil de fin de vie utilisé pour construire la cible RUL |
| `RUL_CROSSING_PERSISTENCE` | `3` points | Confirmation anti-bruit du franchissement de `HI < 0.30` |

Conséquence produit :

- **Si `HI >= 0.80`** : mode `no_prediction` -> le frontend affiche `L10`, pas de RUL chiffré.
- **Si `HI < 0.80` mais que l'historique HI est insuffisant** : mode `warming_up` -> calibration / attente, pas de RUL chiffré.
- **Si `HI < 0.80` et 60 points HI sont disponibles** : mode `prediction` -> affichage du RUL.

Pourquoi 60 points ?

- Le buffer RUL stocke **1 valeur HI par minute**.
- `RUL_LOOKBACK_MIN = 60` signifie donc **60 points = 60 minutes d'historique HI**.

Définition exacte de la cible RUL pendant l'entraînement :

- Le modèle apprend à prédire les **minutes-simulation restantes** avant le premier instant où `hi_smooth < 0.30` pendant **3 points consécutifs**.
- Cette formulation est volontairement **sans fuite d'étiquettes** : elle utilise `hi_smooth`, le même signal observable qu'en production, et non une vérité cachée inaccessible.

Conversion **minutes-simulation -> jours** au runtime :

1. **Sortie brute du RF** : `rul_min` en minutes-simulation.
2. **Fallback historique** si le rythme réel est inconnu :
   - `rul_days = rul_min / 9`
3. **Mode production préféré** si le rythme réel est disponible sur 7 jours :
   - `factor = 9 × (cycles_per_day_observed / 654)`
   - `rul_days = rul_min / factor`

Interprétation :

- si la machine fait **plus de cycles/jour** que la référence, elle consomme sa vie plus vite -> le même `rul_min` donne **moins de jours** ;
- si elle fait **moins de cycles/jour**, le même `rul_min` donne **plus de jours**.

Le système conserve aussi une unité plus physique :

- `cycles_remaining = rul_min × 73.6`

Donc en soutenance, la formulation juste est :

- **jours** = langage GMAO / planning maintenance ;
- **cycles** = langage PHM / engineering ;
- **L10** = référence statistique composant ;
- **RUL** = pronostic personnalisé, affiché seulement après FPT.

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

### Étape 6C — Calibration des intervalles de confiance

| Propriété | Valeur |
|---|---|
| Script | `prediteq_ml/steps/step6c_calibration.py` |
| Entrée | `prediteq_ml/data/processed/rul_predictions.csv` |
| Sortie | `prediteq_ml/outputs/calibration_metrics.json` + `plots/plot7_calibration.png` |
| Objectif | Vérifier que les IC publiés par le RF couvrent correctement la vérité terrain |

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

## 4. Scores finaux (source : `outputs/metrics.json`, exécution 2026-04-27)

### 4.1 Régression RUL — Random Forest

**Holdout (test stratifié 20 %, 40 trajectoires, 25 355 échantillons) :**

| Métrique | Valeur |
|---|---|
| **R² test** | **0,947** |
| R² train | 0,987 |
| RMSE | 45,46 min-sim / **5,05 jours** |
| MAE | 21,26 min-sim / **2,36 jours** |
| n_train samples / groupes | 103 699 / 160 |
| n_test samples / groupes | 25 355 / 40 |

**Cross-validation GroupKFold k=5 :**

| Métrique | Valeur |
|---|---|
| **R² moyen** | **0,967 ± 0,011** |
| RMSE moyen | 3,95 ± 0,65 jours |
| Fold 1 | R² = 0,945 · RMSE = 5,17 j |
| Fold 2 | R² = 0,977 · RMSE = 3,36 j |
| Fold 3 | R² = 0,975 · RMSE = 3,46 j |
| Fold 4 | R² = 0,968 · RMSE = 3,92 j |
| Fold 5 | R² = 0,969 · RMSE = 3,86 j |

**Baselines (holdout, preuve de non-trivialité) :**

| Baseline | R² | RMSE (jours) |
|---|---|---|
| DummyRegressor (moyenne) | −0,000 | 22,05 |
| LinearRegression | 0,806 | 9,71 |
| **Random Forest (nôtre)** | **0,947** | **5,05** |

**Équilibre par profil dans le split :**

| Profil | Train (total/gardés) | Test (total/gardés) |
|---|---|---|
| A linéaire | 40 / 40 | 10 / 10 |
| B_exponential (libellé historique du profil B) | 40 / 40 | 10 / 10 |
| C stepwise | 40 / 40 | 10 / 10 |
| D noisy linear | 40 / 40 | 10 / 10 |

### 4.2 Validation externe NASA CMAPSS FD001 (`cmapss_metrics.json`)

| Métrique | Nôtre | Cible NASA | Verdict |
|---|---|---|---|
| **R²** | **0,886** | 0,87 | ✅ Dépasse |
| RMSE | 14,11 cycles | 18,4 | ✅ Meilleur |
| MAE | 9,64 cycles | 13,2 | ✅ Meilleur |
| Score NASA | 16 263,9 | — | — |

### 4.3 Détection d'anomalies (`metrics.json`)

| Méthode | Précision | Rappel | F1 |
|---|---|---|---|
| Isolation Forest seul | 0,410 | 1,000 | 0,581 |
| RMS z-score baseline | 0,782 | 1,000 | 0,877 |
| Hybrid ensemble (α=0,2) | 0,947 | 0,930 | 0,938 |
| Hybrid AND (confirmation) | 0,782 | 1,000 | 0,877 |

### 4.4 Calibration des IC (`calibration_metrics.json`)

| Métrique | Valeur |
|---|---|
| Nombre de prédictions évaluées | 25 355 |
| Couverture native IC80 | 87,2 % |
| ECE (Expected Calibration Error) | 0,088 |
| Biais moyen | +1,05 jours |
| Interprétation | Intervalles légèrement larges (sur-couverture modérée) |

---

## 5. Figures générées

| Figure | Chemin | Contenu |
|---|---|---|
| Courbes HI | `prediteq_ml/outputs/plots/plot1_hi_curves.png` | 200 trajectoires HI(t) dans l'artefact actuel |
| Scatter RUL | `prediteq_ml/outputs/plots/plot2_rul_scatter.png` | Prédit vs Réel sur holdout |
| Timeline anomalies | `prediteq_ml/outputs/plots/plot3_anomaly_timeline.png` | Détections IF sur trajectoires |
| SHAP summary | `prediteq_ml/outputs/plots/plot4_shap_summary.png` | Importance des features (explicabilité) |
| Heatmap sensibilité | `prediteq_ml/outputs/plots/plot5_sensitivity_heatmap.png` | Robustesse `contamination` × `alpha` |
| Validation CMAPSS | `prediteq_ml/outputs/plots/plot6_cmapss.png` | Prédit vs Réel FD001 |
| Calibration RUL | `prediteq_ml/outputs/plots/plot7_calibration.png` | Couverture empirique des IC vs niveaux nominaux |

---

## 6. Données

### Données brutes

| Fichier | Chemin | Taille | Rôle |
|---|---|---|---|
| Trajectoires d'entraînement | `prediteq_ml/data/raw/trajectories.csv` | 1,3 Go | 200 simulations brutes × 800 min |
| Trajectoire de test | `prediteq_ml/data/raw/test_trajectories.csv` | 6,9 Mo | Démo frontend |
| CMAPSS train FD001 | `prediteq_ml/data/cmapss/train_FD001.txt` | — | Benchmark NASA |
| CMAPSS test FD001 | `prediteq_ml/data/cmapss/test_FD001.txt` | — | Benchmark NASA |
| CMAPSS RUL FD001 | `prediteq_ml/data/cmapss/RUL_FD001.txt` | — | Labels benchmark |

### Données transformées

| Fichier | Chemin | Taille | Produit par |
|---|---|---|---|
| Features 60 s | `prediteq_ml/data/processed/features.csv` | 4,6 Go | step2 · 200 trajectoires uniques |
| Scores anomalies | `prediteq_ml/data/processed/anomaly_scores.csv` | 1,7 Go | step3 |
| Health Index | `prediteq_ml/data/processed/hi.csv` | 33,7 Mo | step4 · 200 trajectoires uniques |
| Prédictions RUL | `prediteq_ml/data/processed/rul_predictions.csv` | 4,6 Mo | step5 |

---

## 7. Modèles sérialisés

| Artefact | Chemin | Taille |
|---|---|---|
| Isolation Forest | `prediteq_ml/models/isolation_forest.pkl` | 1,1 Mo |
| Random Forest RUL | `prediteq_ml/models/random_forest_rul.pkl` | 133,8 Mo |
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
| Frontend | `prediteq_frontend/` | Affiche HI en continu, applique le gate FPT (`HI < 0.80`) et présente soit `L10`, soit `RUL v2` converti par rythme observé (fallback `÷9` si données insuffisantes) |

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
python steps/step6c_calibration.py      # ~1 min (calibration des intervalles)
python steps/step7_export.py            # < 1 s
```

Toutes les sorties sont déterministes (`random_state=42`, `SPLIT_SEED=42`).

---

## 10. Résumé exécutif (à réciter au jury en 30 s)

> *« PrediTeq traite 200 trajectoires dans toute la chaîne brute et transformée (simulation, features, scores d'anomalie, Health Index). Le fichier `rul_predictions.csv` reste un artefact de holdout limité aux 40 trajectoires de test, conformément au protocole d'évaluation. Après recalibration train-only du score hybride et réalignement du split stratifié entre les étapes, le modèle atteint R² = 0,947 en holdout et 0,967 ± 0,011 en cross-validation GroupKFold, avec une MAE de 2,36 jours. Le benchmark NASA CMAPSS FD001 reste validé à R² = 0,886 et score NASA = 16 263,9. »*

---

*Document généré pour faciliter la navigation lors de la soutenance — toute valeur citée est traçable à son fichier source.*
