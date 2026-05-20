# Script complet des slides de soutenance

Ce fichier sert a reconstruire ou corriger la soutenance sans repartir de zero.

Pour chaque slide, tu retrouves :

1. le titre
2. ce qu'il faut montrer
3. ce que tu peux dire a l'oral
4. quoi ouvrir si le jury veut la preuve

Structure globale recommandee :

`probleme -> demarche methodologique -> jeu d'entrainement -> variables choisies -> 3 machines demo -> pipeline ML -> validation -> runtime -> produit -> integration live -> demo -> limites`

## Avant de commencer

Garde ces fichiers ouverts :

- [00_PANIC_SHEET_1_PAGE.md](./00_PANIC_SHEET_1_PAGE.md)
- [02_GUIDE_LIVE_JURY.md](./02_GUIDE_LIVE_JURY.md)
- [03_GUIDE_MISE_A_JOUR_SLIDES.md](./03_GUIDE_MISE_A_JOUR_SLIDES.md)
- [PrediTeq_Dossier_Ultime_Soutenance.pdf](./rapports/PrediTeq_Dossier_Ultime_Soutenance.pdf)

## Variante conseillee

Je te conseille un deck principal de `15 slides` plus `5 slides backup`.

Temps ideal :

- `7 min` : slides `1` a `12`, puis slides `13-15` en version plus courte
- `10 min` : slides `1` a `15`
- `Q&A` : slides `16` a `20`

## Slide 1 - Titre

### Titre

`PrediTeq - Maintenance predictive intelligente pour un stockeur vertical rotatif`

### Ce que je montre

- titre du projet
- promesse : `du signal machine a la decision de maintenance`
- logos / image machine

### Ce que je dis

> PrediTeq est une solution de maintenance predictive qui relie la physique de la machine, le pipeline ML, le backend runtime et l'application web pour aider a intervenir au bon moment.

### Si le jury relance

> Le projet ne s'arrete pas a la prediction ; il va jusqu'a la priorisation, au planning et au cout.

## Slide 2 - Probleme industriel

### Titre

`Pourquoi ce projet ?`

### Ce que je montre

- risque d'intervenir trop tard
- cout d'intervenir trop tot
- Health Index + RUL comme sorties metier

### Ce que je dis

> Le vrai besoin industriel est simple : eviter d'intervenir trop tard ou trop tot sur une machine utile a la production.

### Si le jury relance

> C'est pour cela que nous avons vise deux sorties principales : un Health Index lisible et un RUL exploitable.

## Slide 3 - Demarche methodologique

### Titre

`Quelle methode avons-nous suivie ?`

### Ce que je montre

- peu de donnees reelles longues au depart
- socle simule realiste pour demarrer
- progression par phases : signal -> indicateurs -> anomalies -> HI -> RUL
- validation bloc par bloc
- collecte live et historisation en parallele
- appui sur l'expertise technicien

### Ce que je dis

> Nous avons suivi une demarche simple : partir d'une machine reelle, construire une simulation defendable, avancer etape par etape, valider chaque bloc, puis preparer deja la collecte terrain.

### Si le jury relance

> La simulation ne remplace pas le terrain. Elle sert a lancer une chaine predictive complete dans un cadre controle, pendant que la collecte terrain et l'historisation se mettent en place. NASA CMAPSS sert ensuite de repere externe, pas de jeu principal du stockeur.

## Slide 4 - Donnees d'entrainement simulees

### Titre

`Que contient le jeu d'entrainement ?`

### Ce que je montre

- `200 trajectoires`
- `4 profils`
- `20 cas de charge`
- colonnes exportees dans `trajectories.csv`
- preuve [proof_code_07_training_dataset.png](../final_report/prediteq_overleaf_report/images_free/proof_code_07_training_dataset.png)

### Ce que je dis

> Une trajectoire est l'histoire complete d'une machine simulee dans le temps. Notre jeu d'entrainement n'est donc pas une simple table de nombres, mais un ensemble de scenarios complets qui evoluent seconde par seconde.

### Si le jury relance

> On peut le montrer directement dans [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py), la partie qui cree les colonnes et exporte `prediteq_ml/data/raw/trajectories.csv`.

## Slide 5 - Pourquoi ces variables

### Titre

`Pourquoi ces variables donnent des resultats defendables`

### Ce que je montre

- chaine simple :
  `charge -> puissance -> courant -> echauffement -> usure -> HI baisse -> vibration monte`
- rappel des constantes machine
- preuves [proof_code_01_sim_constants.png](../final_report/prediteq_overleaf_report/images_free/proof_code_01_sim_constants.png) et [proof_code_02_sim_power_current.png](../final_report/prediteq_overleaf_report/images_free/proof_code_02_sim_power_current.png)

### Ce que je dis

> Nous n'avons pas choisi des variables arbitraires. Nous avons choisi des mesures qui changent vraiment quand la machine travaille plus fort ou se degrade, puis nous les avons reliees dans une chaine cause-effet lisible.

### Si le jury relance

> La logique est dans [config.py](../prediteq_ml/config.py) et [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py) : charge, cycle, puissance, courant, vibration, temperature et humidite sont relies explicitement.

## Slide 6 - Les 3 machines simulees

### Titre

`Pourquoi avons-nous 3 machines demo differentes ?`

### Ce que je montre

- `ASC-A1` : usage leger, charges faibles a moyennes, HI haut
- `ASC-B2` : trafic mixte, demi-charges, HI moyen
- `ASC-C3` : charges lourdes, ambiance severe, HI bas
- preuves [proof_code_08_demo_machine_scenarios.png](../final_report/prediteq_overleaf_report/images_free/proof_code_08_demo_machine_scenarios.png) et [proof_code_09_demo_machine_runtime_logic.png](../final_report/prediteq_overleaf_report/images_free/proof_code_09_demo_machine_runtime_logic.png)

### Ce que je dis

> Ces trois machines ne sont pas trois couleurs choisies pour la demo. Elles racontent trois contextes d'usage differents. Le simulateur change les charges, le stress, l'usure et le point de depart pour obtenir trois regimes d'etat de sante distincts.

### Si le jury relance

> Les parametres declaratifs sont dans [demo_scenarios.py](../prediteq_api/demo_scenarios.py), et la logique runtime qui transforme ces parametres en charges et signaux est dans [simulator.py](../prediteq_api/routers/simulator.py).

## Slide 7 - Pipeline ML dans l'ordre

### Titre

`Pipeline ML complet`

### Ce que je montre

1. Simulation
2. Preprocessing
3. Detection d'anomalies
4. Health Index
5. RUL
6. Evaluation
7. Validation NASA
8. Calibration
9. Export runtime

### Ce que je dis

> Le projet n'est pas un seul modele. C'est une chaine ordonnee de scripts qui avance bloc par bloc et produit ensuite des artefacts utilisables par le backend.

### Si le jury relance

> L'ordre verifie est bien `step1 -> step2 -> step3 -> step4 -> step5 -> step6 -> step6b -> step6c -> step7`.

## Slide 8 - Des signaux bruts vers un Health Index

### Titre

`Des mesures brutes a une lecture intelligible`

### Ce que je montre

- `4 mesures brutes -> indicateurs intermediaires`
- une feature = un indicateur calcule
- score d'ecart
- note de sante

### Ce que je dis

> Pour un jury non technique, une feature est simplement un indicateur calcule a partir des mesures brutes, par exemple une moyenne, une variation ou une duree de montee. Ensuite, le pipeline transforme cela en une note de sante plus facile a lire.

### Si le jury relance

> Les indicateurs intermediaires sont construits dans [step2_preprocess.py](../prediteq_ml/steps/step2_preprocess.py), le score d'ecart est dans [step3_isolation_forest.py](../prediteq_ml/steps/step3_isolation_forest.py), puis la note de sante est construite dans [step4_health_index.py](../prediteq_ml/steps/step4_health_index.py).

## Slide 9 - Prediction du RUL

### Titre

`Predire le temps restant avant la zone critique`

### Ce que je montre

- RUL = temps restant avant action necessaire
- construit a partir de `hi_smooth`
- preuve de validation sans fuite

### Ce que je dis

> La valeur ajoutee n'est pas seulement de dire qu'une machine va mal, mais d'estimer le temps restant avant qu'il faille agir.

### Si le jury relance

> Le point important est que le RUL n'apprend pas une verite cachee inaccessible au runtime ; il est construit depuis un signal observable.

## Slide 10 - Validation et credibilite

### Titre

`Comment avons-nous valide le pipeline ?`

### Ce que je montre

- test separe
- validation par trajectoires completes
- benchmark externe NASA
- calibration

### Ce que je dis

> Le pipeline n'a pas ete seulement montre. Il a ete verifie sur un test separe, sur des trajectoires completes, puis sur un benchmark externe NASA.

### Si le jury relance

> Le message a retenir est que la chaine reste stable sous plusieurs verifications, pas seulement sur un exemple interne.

## Slide 11 - Du ML offline au backend runtime

### Titre

`Comment le pipeline devient un systeme vivant`

### Ce que je montre

- sources
- bridge
- FastAPI runtime
- Supabase
- application

### Ce que je dis

> L'entrainement vit dans `prediteq_ml`, puis le backend charge les artefacts exportes et les applique a la telemetrie runtime.

### Si le jury relance

> Le bon chemin de code est [main.py](../prediteq_api/main.py) -> [loader.py](../prediteq_api/ml/loader.py) -> [engine_manager.py](../prediteq_api/ml/engine_manager.py).

## Slide 12 - Application web

### Titre

`De la prediction a la decision`

### Ce que je montre

- dashboard
- diagnostics
- planner
- maintenance
- costs

### Ce que je dis

> La valeur produit est ici : la prediction devient une action lisible, planifiable et chiffrable.

### Si le jury relance

> Les pages cles sont [DashboardPage.tsx](../prediteq_frontend/src/components/pages/DashboardPage.tsx), [DiagnosticsPage.tsx](../prediteq_frontend/src/components/pages/DiagnosticsPage.tsx) et [PlannerPage.tsx](../prediteq_frontend/src/components/pages/PlannerPage.tsx).

## Slide 13 - Integration machine reelle / PLC / LabVIEW

### Titre

`Comment PrediTeq se branche a une machine reelle`

### Ce que je montre

- flux : `LabVIEW / PLC -> PC relais cote client -> MQTT ou HTTP -> /ingest/live -> backend -> frontend`
- `4` mesures minimales : `rms_mms`, `power_kw`, `temp_c`, `humidity_rh`
- nuance : `ARO-01` utilise le meme moteur runtime que les machines demo, mais elle ne passe pas par le simulateur
- nuance : on peut precharger une heure recente d'historique pour eviter un warmup trop long
- preuve [proof_code_10_live_ingest_bridge.png](../final_report/prediteq_overleaf_report/images_free/proof_code_10_live_ingest_bridge.png)

### Ce que je dis

> Le contrat live existe deja. Aujourd'hui, nous montrons une source LabVIEW de demonstration. `ARO-01` suit deja le vrai chemin produit, et demain la vraie acquisition PLC ou LabVIEW remplacera surtout la source d'entree, alors que le bridge et le backend resteront les memes.

### Si le jury relance

> Le point d'entree HTTP est dans [live_ingest.py](../prediteq_api/routers/live_ingest.py), la preparation fluide de `ARO-01` est dans [setup_real_machine_demo.py](../prediteq_api/scripts/setup_real_machine_demo.py), et la vue pratique cote PC relais est dans [RELAY_PC_SETUP_SIMPLE.md](../prediteq_api/RELAY_PC_SETUP_SIMPLE.md).

## Slide 14 - Flux live de demonstration

### Titre

`Demonstration live facile a suivre`

### Ce que je montre

- `ARO-01` deja creee et bootstrappee
- source CSV LabVIEW de demonstration
- calcul backend
- resultat dans l'application

### Ce que je dis

> Pour la soutenance, nous montrons deja une chaine PC relais -> bridge -> backend -> application. Le bootstrap sert seulement a donner assez d'historique recent a `ARO-01`, puis la machine continue sur le vrai chemin live PrediTeq.

### Si le jury relance

> Aujourd'hui, seule la source reste une source de demonstration de type LabVIEW avant l'integration industrielle finale.

## Slide 15 - Limites et prochaine etape

### Titre

`Limites actuelles et suite logique`

### Ce que je montre

- jeu d'entrainement encore simule
- vraie acquisition industrielle encore a generaliser
- plus de donnees terrain annotees a collecter

### Ce que je dis

> Nous avons une chaine complete, mesurable et montrable. La prochaine marche indispensable est la validation terrain longue duree avec integration industrielle finale.

### Si le jury relance

> C'est justement ce qui rend le projet defensable : nous montrons clairement ce qui est deja solide et ce qui reste a industrialiser.

## Backup 16 - Jeu d'entrainement + simulation

Ce que je dis :

> Voici la preuve directe dans le code : comment le jeu d'entrainement est fabrique, puis les constantes moteur, le cycle machine, la puissance et le courant.

## Backup 17 - Les 3 machines demo

Ce que je dis :

> On voit ici que les trois machines ont des profils et des contraintes declares explicitement, puis que le simulateur applique des motifs de charge, de stress et d'usure differents.

## Backup 18 - Preuves ML

Ce que je dis :

> On voit ici les vraies briques du pipeline ML : construction des features, score hybride, cible RUL issue de `hi_smooth` et validation GroupKFold.

## Backup 19 - Integration live + commandes

Ce que je dis :

> Si besoin, nous pouvons aussi montrer le contrat live et lancer la chaine locale de demonstration avec les commandes deja preparees.

## Backup 20 - Fichiers reflexe a ouvrir

Si quelqu'un dit "ouvrez le code", va directement ici :

1. [config.py](../prediteq_ml/config.py)
2. [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
3. [demo_scenarios.py](../prediteq_api/demo_scenarios.py)
4. [simulator.py](../prediteq_api/routers/simulator.py)
5. [step2_preprocess.py](../prediteq_ml/steps/step2_preprocess.py)
6. [step5_rul_model.py](../prediteq_ml/steps/step5_rul_model.py)
7. [live_ingest.py](../prediteq_api/routers/live_ingest.py)
8. [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py)

## Version ultra-resumee du deck

Si tu veux retenir l'histoire generale en une seule ligne :

`besoin industriel -> simulation -> jeu d'entrainement -> variables choisies -> 3 machines demo -> ML -> validation -> runtime -> web app -> integration live -> demo -> limites`
