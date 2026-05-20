# Atlas Soutenance: ML Pipeline

Ce dossier est une carte de lecture. Il organise la partie ML pour la soutenance sans modifier le code reel.

## A quoi sert cette partie

Ici, tu expliques comment on passe:

- des signaux simules
- a des indicateurs calcules
- puis a une detection d'anomalies
- puis a un score de sante
- puis a une estimation du RUL
- puis a une validation et a un export pour le backend

## Ordre simple a ouvrir

1. [step2_preprocess.py](../../prediteq_ml/steps/step2_preprocess.py)
2. [step3_isolation_forest.py](../../prediteq_ml/steps/step3_isolation_forest.py)
3. [step4_health_index.py](../../prediteq_ml/steps/step4_health_index.py)
4. [step5_rul_model.py](../../prediteq_ml/steps/step5_rul_model.py)
5. [step6_evaluate.py](../../prediteq_ml/steps/step6_evaluate.py)
6. [step6b_cmapss.py](../../prediteq_ml/steps/step6b_cmapss.py)
7. [step6c_calibration.py](../../prediteq_ml/steps/step6c_calibration.py)
8. [step7_export.py](../../prediteq_ml/steps/step7_export.py)
9. [metrics.json](../../prediteq_ml/outputs/metrics.json)
10. [rul_cv_scores.json](../../prediteq_ml/outputs/rul_cv_scores.json)
11. [cmapss_metrics.json](../../prediteq_ml/outputs/cmapss_metrics.json)

## Version tres simple a dire

La logique ML est progressive:

1. on nettoie et on transforme les signaux bruts
2. on calcule des indicateurs utiles
3. on mesure si le comportement devient anormal
4. on construit un score de sante lisse et lisible
5. on estime le temps restant avant intervention
6. on verifie les resultats avant d'exporter

## Traduction des mots techniques

- `feature` = un indicateur calcule a partir des mesures brutes
- `anomaly score` = une note qui dit si le comportement ressemble ou non a un comportement habituel
- `HI` ou `Health Index` = une note de sante de la machine
- `RUL` = le temps restant avant qu'une action soit raisonnablement necessaire
- `calibration` = une correction pour rendre l'incertitude plus credible

## Ce que chaque etape prouve

- [step2_preprocess.py](../../prediteq_ml/steps/step2_preprocess.py)  
  Le modele n'apprend pas seulement a partir des 4 mesures brutes. Il apprend a partir d'indicateurs derives plus stables et plus parlants.

- [step3_isolation_forest.py](../../prediteq_ml/steps/step3_isolation_forest.py)  
  L'anomalie n'est pas une impression visuelle. Elle est calculee par une etape explicite.

- [step4_health_index.py](../../prediteq_ml/steps/step4_health_index.py)  
  Le score de sante est construit pour etre plus interpretable qu'un score brut.

- [step5_rul_model.py](../../prediteq_ml/steps/step5_rul_model.py)  
  L'estimation du RUL vient du comportement observable et du `hi_smooth`. Ce n'est pas un raccourci base directement sur un label cache.

- [step6_evaluate.py](../../prediteq_ml/steps/step6_evaluate.py)  
  On verifie les performances sur le jeu interne.

- [step6b_cmapss.py](../../prediteq_ml/steps/step6b_cmapss.py)  
  On ajoute une verification externe sur CMAPSS comme benchmark, sans le presenter comme la source principale du projet Aroteq.

- [step6c_calibration.py](../../prediteq_ml/steps/step6c_calibration.py)  
  On travaille la credibilite de l'intervalle et pas seulement la prediction ponctuelle.

- [step7_export.py](../../prediteq_ml/steps/step7_export.py)  
  Les artefacts exportes servent ensuite au backend runtime.

## Points de methode a rappeler

- on a avance par etapes
- chaque etape a ete justifiee avant de passer a la suivante
- la partie runtime ne re-entraine pas le modele
- le backend charge les artefacts depuis `prediteq_ml/models/`

## Faits surs a repeter

- le pipeline courant part de la simulation, puis pretraitement, anomalies, HI, RUL, evaluation, calibration, export
- le RUL final est construit a partir de `hi_smooth`
- la validation RUL est faite par trajectoire entiere pour eviter les fuites de donnees
- les nombres de reference doivent etre lus dans les JSON de `prediteq_ml/outputs/`

## Si le jury demande une preuve de code

Montre dans cet ordre:

1. [step2_preprocess.py](../../prediteq_ml/steps/step2_preprocess.py)
2. [step3_isolation_forest.py](../../prediteq_ml/steps/step3_isolation_forest.py)
3. [step4_health_index.py](../../prediteq_ml/steps/step4_health_index.py)
4. [step5_rul_model.py](../../prediteq_ml/steps/step5_rul_model.py)
5. [metrics.json](../../prediteq_ml/outputs/metrics.json)

## Aller ensuite vers

- [../01_simulation/README.md](../01_simulation/README.md)
- [../03_runtime_iot/README.md](../03_runtime_iot/README.md)
- [../04_web_app/README.md](../04_web_app/README.md)
