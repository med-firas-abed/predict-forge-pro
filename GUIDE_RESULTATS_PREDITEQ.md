# Comprendre Simplement Comment PrediTeq Produit Ses Resultats

Ce document explique, de facon simple, comment PrediTeq arrive a produire:

- le `HI`
- le `stress`
- le `RUL`
- les `diagnostics`
- les `alertes`

Le but n'est pas de tout montrer.
Le but est de comprendre le fil logique du projet sans se perdre.

Tous les chemins sont cliquables avec `Ctrl + clic`.

---

## 1. L'idee generale

PrediTeq raconte toujours la meme histoire:

1. une machine produit des signaux
2. ces signaux sont transformes en informations utiles
3. on mesure si la machine reste dans un comportement normal
4. on calcule son etat de sante actuel
5. on estime si elle risque de tomber en panne bientot
6. on affiche cela dans l'application pour aider a decider

Les pieces les plus importantes sont ici:

- [prediteq_ml/config.py](./prediteq_ml/config.py)
- [prediteq_api/main.py](./prediteq_api/main.py)
- [prediteq_api/ml/engine_manager.py](./prediteq_api/ml/engine_manager.py)
- [prediteq_api/routers/diagnostics_rul.py](./prediteq_api/routers/diagnostics_rul.py)
- [prediteq_frontend/src/components/pages/DashboardPage.tsx](./prediteq_frontend/src/components/pages/DashboardPage.tsx)

Ou le voir en live:

- page `Dashboard`
- page `Diagnostics`

Commandes terminal utiles:

```powershell
cd prediteq_api
uvicorn main:app --reload
```

```powershell
cd prediteq_frontend
npm run dev
```

---

## 2. D'ou viennent les donnees

Il y a 2 mondes dans PrediTeq.

### Le monde 1: la preparation hors ligne

Avant d'avoir une application qui predit quelque chose, il faut construire et evaluer les modeles.

Pour cela, le projet cree des trajectoires de degradation, puis transforme ces trajectoires en jeux de donnees utilisables.

Les fichiers importants sont:

- [prediteq_ml/steps/step1_simulate.py](./prediteq_ml/steps/step1_simulate.py)
- [prediteq_ml/steps/step2_preprocess.py](./prediteq_ml/steps/step2_preprocess.py)
- [prediteq_ml/data/raw/trajectories.csv](./prediteq_ml/data/raw/trajectories.csv)
- [prediteq_ml/data/processed/features.csv](./prediteq_ml/data/processed/features.csv)

Commandes terminal utiles:

```powershell
cd prediteq_ml
python steps/step1_simulate.py
python steps/step2_preprocess.py
```

### Le monde 2: l'application en temps reel

Une fois les modeles prets, le backend les charge et les utilise pour les machines visibles dans l'app.

Les fichiers importants sont:

- [prediteq_api/ml/loader.py](./prediteq_api/ml/loader.py)
- [prediteq_api/ml/engine_manager.py](./prediteq_api/ml/engine_manager.py)
- [prediteq_ml/models/prediteq_engine.py](./prediteq_ml/models/prediteq_engine.py)

Ou le voir en live:

- page `Dashboard`
- page `Diagnostics`
- page `Simulateur`

Commandes terminal utiles:

```powershell
cd prediteq_api
uvicorn main:app --reload
```

---

## 3. La simulation, expliquee sans complication

Le simulateur sert a montrer une histoire industrielle credible en quelques minutes.

Il ne se contente pas d'afficher des cartes statiques.
Il fabrique vraiment des signaux qui passent dans le backend, puis le backend calcule les resultats.

L'idee simple est:

1. on choisit un scenario de machine
2. on lui donne une charge, un niveau d'usure, un environnement, un rythme d'utilisation
3. a partir de cela, on reconstruit vibration, puissance, courant, temperature et humidite
4. ces signaux sont injectes dans le moteur runtime
5. le moteur calcule `HI`, `stress`, `RUL` et diagnostics

Les fichiers a ouvrir sont:

- [prediteq_api/demo_scenarios.py](./prediteq_api/demo_scenarios.py)
- [prediteq_api/routers/simulator.py](./prediteq_api/routers/simulator.py)
- [prediteq_api/ml/engine_manager.py](./prediteq_api/ml/engine_manager.py)
- [prediteq_frontend/src/components/pages/SimulatorPage.tsx](./prediteq_frontend/src/components/pages/SimulatorPage.tsx)

Ou le voir en live:

- page `Simulateur`
- puis `Dashboard`
- puis `Diagnostics`
- puis `Centre d'alertes`

Commandes vraiment utiles:

```powershell
cd prediteq_api
uvicorn main:app --reload
```

```powershell
cd prediteq_frontend
npm run dev
```

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:8000/simulator/status" -UseBasicParsing
```

---

## 4. Les 3 machines de demo, en version simple

Les 3 machines sont la partie la plus importante pour raconter la demo.

Elles n'ont pas ete choisies pour faire joli.
Elles representent 3 conditions de travail differentes.

Le fichier central est:

- [prediteq_api/demo_scenarios.py](./prediteq_api/demo_scenarios.py)

La mise en scene runtime est ici:

- [prediteq_api/routers/simulator.py](./prediteq_api/routers/simulator.py)

### ASC-A1: la machine protegee

`ASC-A1` represente une machine qui travaille dans de bonnes conditions.

Ce qu'on lui donne:

- une charge plutot faible
- un rythme modere
- peu de surcharge
- un environnement plus frais
- un environnement plus sec
- une usure faible

Ce que cela produit:

- peu de stress
- peu de derive vibratoire
- un `HI` eleve
- un `RUL` plutot long

Les lignes a regarder sont ici:

- [prediteq_api/demo_scenarios.py](./prediteq_api/demo_scenarios.py)
- [prediteq_api/routers/simulator.py](./prediteq_api/routers/simulator.py)

Ou le voir en live:

- page `Simulateur`
- carte machine `ASC-A1`
- page `Dashboard`

Commande terminal utile:

```powershell
rg -n "\"ASC-A1\"|target_hi|base_load_kg|cycles_per_day|thermal_stress|humidity_stress" prediteq_api\demo_scenarios.py
```

### ASC-B2: la machine intermediaire

`ASC-B2` represente une machine qui travaille normalement, mais avec plus de contraintes que `ASC-A1`.

Ce qu'on lui donne:

- des charges mixtes
- un trafic regulier
- des periodes de pointe
- un peu plus de stress ambiant
- une usure intermediaire

Ce que cela produit:

- un comportement moins stable
- un `HI` plus bas
- une zone de surveillance
- un `RUL` plus court que `ASC-A1`

Les lignes a regarder sont ici:

- [prediteq_api/demo_scenarios.py](./prediteq_api/demo_scenarios.py)
- [prediteq_api/routers/simulator.py](./prediteq_api/routers/simulator.py)

Ou le voir en live:

- page `Simulateur`
- carte machine `ASC-B2`
- page `Diagnostics`

Commande terminal utile:

```powershell
rg -n "\"ASC-B2\"|target_hi|base_load_kg|cycles_per_day|thermal_stress|humidity_stress|overload_bias" prediteq_api\demo_scenarios.py
```

### ASC-C3: la machine critique

`ASC-C3` represente la machine la plus durement sollicitee.

Ce qu'on lui donne:

- des charges lourdes proches du maximum
- un rythme tres intense
- plus de chaleur
- plus d'humidite
- plus de surcharge
- plus de derive vibratoire
- une usure forte

Ce que cela produit:

- un stress eleve
- un `HI` tres faible
- un etat critique
- des alertes
- des emails
- un `RUL` court

Les fichiers a ouvrir sont:

- [prediteq_api/demo_scenarios.py](./prediteq_api/demo_scenarios.py)
- [prediteq_api/routers/simulator.py](./prediteq_api/routers/simulator.py)
- [prediteq_api/core/email_client.py](./prediteq_api/core/email_client.py)
- [prediteq_api/scheduler.py](./prediteq_api/scheduler.py)

Ou le voir en live:

- page `Simulateur`
- page `Centre d'alertes`
- reception de l'email

Commandes terminal utiles:

```powershell
rg -n "\"ASC-C3\"|target_hi|base_load_kg|cycles_per_day|thermal_stress|humidity_stress|overload_bias" prediteq_api\demo_scenarios.py
```

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:8000/simulator/status" -UseBasicParsing
```

---

## 5. Comment la simulation fabrique vraiment les signaux

La simulation part d'un niveau de degradation, puis elle reconstruit plusieurs signaux capteurs.

Ce n'est pas seulement un `HI` pre-rempli.

Les principaux morceaux sont:

- construction de la degradation: [prediteq_api/routers/simulator.py](./prediteq_api/routers/simulator.py)
- construction de la charge: [prediteq_api/routers/simulator.py](./prediteq_api/routers/simulator.py)
- reconstruction de la vibration RMS: [prediteq_api/routers/simulator.py](./prediteq_api/routers/simulator.py)
- reconstruction de la puissance et du courant: [prediteq_api/routers/simulator.py](./prediteq_api/routers/simulator.py)
- reconstruction temperature et humidite: [prediteq_api/routers/simulator.py](./prediteq_api/routers/simulator.py)

Ce qu'il faut retenir:

- plus la machine est chargee et usee, plus elle force
- plus elle force, plus la puissance et le courant montent
- plus elle chauffe, plus la degradation s'accelere
- tout cela se retrouve ensuite dans le `HI`, le `stress` et le `RUL`

Ou le voir en live:

- lancer `Simulateur`
- observer l'evolution sur `Dashboard`
- ouvrir `Diagnostics` pour voir l'explication

Commandes terminal utiles:

```powershell
rg -n "_compute_hi|_build_load_series|_hi_to_rms|_compute_power_current|_compute_temp_humidity" prediteq_api\routers\simulator.py
```

---

## 6. La pipeline ML, en langage simple

La pipeline ML fait 5 choses faciles a retenir.

### Etape 1: creer des trajectoires

On genere des histoires de vie machine plausibles.

Fichiers:

- [prediteq_ml/steps/step1_simulate.py](./prediteq_ml/steps/step1_simulate.py)
- [prediteq_ml/data/raw/trajectories.csv](./prediteq_ml/data/raw/trajectories.csv)

Commandes terminal:

```powershell
cd prediteq_ml
python steps/step1_simulate.py
```

### Etape 2: transformer les signaux en variables utiles

On fabrique des features:

- moyennes
- variations
- derives
- correlations

Fichiers:

- [prediteq_ml/steps/step2_preprocess.py](./prediteq_ml/steps/step2_preprocess.py)
- [prediteq_ml/data/processed/features.csv](./prediteq_ml/data/processed/features.csv)

Commandes terminal:

```powershell
cd prediteq_ml
python steps/step2_preprocess.py
```

### Etape 3: detecter l'anormal

On utilise `Isolation Forest` pour voir quand la machine quitte son comportement normal.

Fichiers:

- [prediteq_ml/steps/step3_isolation_forest.py](./prediteq_ml/steps/step3_isolation_forest.py)
- [prediteq_ml/models/isolation_forest.pkl](./prediteq_ml/models/isolation_forest.pkl)
- [prediteq_ml/data/processed/anomaly_scores.csv](./prediteq_ml/data/processed/anomaly_scores.csv)

Commandes terminal:

```powershell
cd prediteq_ml
python steps/step3_isolation_forest.py
```

### Etape 4: calculer le HI

On transforme l'information technique en un indice de sante lisible.

Fichiers:

- [prediteq_ml/steps/step4_health_index.py](./prediteq_ml/steps/step4_health_index.py)
- [prediteq_ml/data/processed/hi.csv](./prediteq_ml/data/processed/hi.csv)
- [prediteq_ml/models/hi_params.json](./prediteq_ml/models/hi_params.json)

Commandes terminal:

```powershell
cd prediteq_ml
python steps/step4_health_index.py
```

### Etape 5: predire le RUL

On regarde l'historique recent du `HI` pour estimer le temps restant avant la zone critique.

Fichiers:

- [prediteq_ml/steps/step5_rul_model.py](./prediteq_ml/steps/step5_rul_model.py)
- [prediteq_ml/models/random_forest_rul.pkl](./prediteq_ml/models/random_forest_rul.pkl)
- [prediteq_ml/data/processed/rul_predictions.csv](./prediteq_ml/data/processed/rul_predictions.csv)

Commandes terminal:

```powershell
cd prediteq_ml
python steps/step5_rul_model.py
```

### Etape 6: verifier que cela marche

On mesure la qualite et la generalisation.

Fichiers:

- [prediteq_ml/steps/step6_evaluate.py](./prediteq_ml/steps/step6_evaluate.py)
- [prediteq_ml/steps/step6b_cmapss.py](./prediteq_ml/steps/step6b_cmapss.py)
- [prediteq_ml/steps/step6c_calibration.py](./prediteq_ml/steps/step6c_calibration.py)
- [prediteq_ml/outputs/metrics.json](./prediteq_ml/outputs/metrics.json)
- [prediteq_ml/outputs/cmapss_metrics.json](./prediteq_ml/outputs/cmapss_metrics.json)
- [prediteq_ml/outputs/calibration_metrics.json](./prediteq_ml/outputs/calibration_metrics.json)

Commandes terminal pour recalculer les metriques:

```powershell
cd prediteq_ml
python steps/step6_evaluate.py
python steps/step6b_cmapss.py
python steps/step6c_calibration.py
```

Commandes terminal pour prouver les resultats:

```powershell
Get-Content prediteq_ml\outputs\metrics.json -TotalCount 120
Get-Content prediteq_ml\outputs\cmapss_metrics.json -TotalCount 120
Get-Content prediteq_ml\outputs\calibration_metrics.json -TotalCount 120
```

Ou le voir en live:

- le resultat visible n'est pas dans la pipeline offline
- il apparait ensuite dans `Dashboard`, `Diagnostics` et `Simulateur`

Commande terminal pour refaire toute la sequence principale:

```powershell
cd prediteq_ml
python steps/step1_simulate.py
python steps/step2_preprocess.py
python steps/step3_isolation_forest.py
python steps/step4_health_index.py
python steps/step5_rul_model.py
python steps/step6_evaluate.py
python steps/step7_export.py
```

---

## 7. Comment on passe de la pipeline a l'application

Une fois la pipeline terminee:

1. les modeles sont exportes
2. l'API les charge
3. le backend calcule les resultats par machine
4. le frontend les affiche

Les fichiers importants sont:

- [prediteq_ml/steps/step7_export.py](./prediteq_ml/steps/step7_export.py)
- [prediteq_ml/models/prediteq_engine.py](./prediteq_ml/models/prediteq_engine.py)
- [prediteq_api/ml/loader.py](./prediteq_api/ml/loader.py)
- [prediteq_api/ml/engine_manager.py](./prediteq_api/ml/engine_manager.py)
- [prediteq_api/routers/diagnostics_rul.py](./prediteq_api/routers/diagnostics_rul.py)
- [prediteq_frontend/src/components/pages/DashboardPage.tsx](./prediteq_frontend/src/components/pages/DashboardPage.tsx)
- [prediteq_frontend/src/components/pages/DiagnosticsPage.tsx](./prediteq_frontend/src/components/pages/DiagnosticsPage.tsx)

Ou le voir en live:

- `Dashboard`
- `Diagnostics`

Commandes minimales utiles:

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -UseBasicParsing
Invoke-WebRequest -Uri "http://127.0.0.1:8000/health/public-metrics" -UseBasicParsing
```

```powershell
cd prediteq_ml
python steps/step7_export.py
```

---

## 8. Ou regarder selon ce que l'on veut expliquer

### Si on veut expliquer le fonctionnement global

- [prediteq_frontend/src/components/pages/DashboardPage.tsx](./prediteq_frontend/src/components/pages/DashboardPage.tsx)
- [prediteq_api/ml/engine_manager.py](./prediteq_api/ml/engine_manager.py)

### Si on veut expliquer pourquoi une machine est critique

- [prediteq_frontend/src/components/pages/DiagnosticsPage.tsx](./prediteq_frontend/src/components/pages/DiagnosticsPage.tsx)
- [prediteq_api/routers/diagnostics_rul.py](./prediteq_api/routers/diagnostics_rul.py)

### Si on veut expliquer la demo

- [prediteq_frontend/src/components/pages/SimulatorPage.tsx](./prediteq_frontend/src/components/pages/SimulatorPage.tsx)
- [prediteq_api/demo_scenarios.py](./prediteq_api/demo_scenarios.py)
- [prediteq_api/routers/simulator.py](./prediteq_api/routers/simulator.py)

### Si on veut expliquer les alertes et les emails

- [prediteq_frontend/src/components/pages/AlertsPage.tsx](./prediteq_frontend/src/components/pages/AlertsPage.tsx)
- [prediteq_api/scheduler.py](./prediteq_api/scheduler.py)
- [prediteq_api/core/email_client.py](./prediteq_api/core/email_client.py)
- [prediteq_api/routers/seuils.py](./prediteq_api/routers/seuils.py)

---

## 9. Le minimum pour une demo locale propre

Backend:

```powershell
cd prediteq_api
uvicorn main:app --reload
```

Frontend:

```powershell
cd prediteq_frontend
npm run dev
```

Verification simple:

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -UseBasicParsing
```

Prouver les metriques en terminal:

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:8000/health/public-metrics" -UseBasicParsing
```

Ensuite, dans l'application:

1. ouvrir `Dashboard`
2. ouvrir `Diagnostics`
3. lancer `Simulateur`
4. montrer les 3 machines
5. ouvrir `Centre d'alertes`

---

## 10. Les chemins les plus utiles a garder

- [prediteq_api/demo_scenarios.py](./prediteq_api/demo_scenarios.py)
- [prediteq_api/routers/simulator.py](./prediteq_api/routers/simulator.py)
- [prediteq_api/ml/engine_manager.py](./prediteq_api/ml/engine_manager.py)
- [prediteq_api/routers/diagnostics_rul.py](./prediteq_api/routers/diagnostics_rul.py)
- [prediteq_api/scheduler.py](./prediteq_api/scheduler.py)
- [prediteq_api/core/email_client.py](./prediteq_api/core/email_client.py)
- [prediteq_ml/steps/step1_simulate.py](./prediteq_ml/steps/step1_simulate.py)
- [prediteq_ml/steps/step4_health_index.py](./prediteq_ml/steps/step4_health_index.py)
- [prediteq_ml/steps/step5_rul_model.py](./prediteq_ml/steps/step5_rul_model.py)
- [prediteq_ml/outputs/metrics.json](./prediteq_ml/outputs/metrics.json)
- [prediteq_frontend/src/components/pages/DashboardPage.tsx](./prediteq_frontend/src/components/pages/DashboardPage.tsx)
- [prediteq_frontend/src/components/pages/DiagnosticsPage.tsx](./prediteq_frontend/src/components/pages/DiagnosticsPage.tsx)
