# Script oral 10 minutes

Ce fichier est la version plus confortable pour une soutenance de `10 minutes`.

Il te laisse plus de respiration et plus d'explications non techniques,
notamment sur :

- le jeu d'entrainement simule
- le choix des variables
- les `3` machines demo
- l'integration machine reelle / PLC / LabVIEW

Base slides :

- [04_SCRIPT_COMPLET_SLIDES_SOUTENANCE.md](./04_SCRIPT_COMPLET_SLIDES_SOUTENANCE.md)
- [03_GUIDE_MISE_A_JOUR_SLIDES.md](./03_GUIDE_MISE_A_JOUR_SLIDES.md)
- [00_PANIC_SHEET_1_PAGE.md](./00_PANIC_SHEET_1_PAGE.md)

## Repartition conseillee

- `0:00 - 0:40` : slides 1 et 2
- `0:40 - 2:30` : slides 3, 4, 5 et 6
- `2:30 - 3:30` : slides 7 et 8
- `3:30 - 4:20` : slide 9
- `4:20 - 5:00` : slide 10
- `5:00 - 5:50` : slides 11 et 12
- `5:50 - 6:50` : slide 13
- `6:50 - 7:35` : slide 14
- `7:35 - 8:30` : slide 15
- `8:30 - 10:00` : respiration, relances, conclusion plus lente

## Script complet

### Introduction

Bonjour. Nous allons vous presenter PrediTeq, une solution de maintenance predictive appliquee a un stockeur vertical rotatif industriel. L'idee generale du projet est de transformer des signaux machine en decisions de maintenance lisibles, actionnables et integrables dans une application web.

### Slides 1 et 2 - Positionnement du projet et besoin industriel

PrediTeq n'est pas seulement un modele de Machine Learning. C'est une chaine complete qui relie quatre couches : une couche de simulation et de preparation de donnees, une couche de Machine Learning offline, une couche runtime backend qui charge les artefacts, et enfin une couche produit avec une interface web.

Le besoin industriel vient d'un probleme tres concret. Si on intervient trop tard, on risque une panne ou un arret. Si on intervient trop tot, on cree un cout inutile. L'objectif est donc d'apporter un outil d'aide a la decision qui permette de surveiller l'etat de sante, de prioriser les actions et d'anticiper le bon moment pour intervenir.

### Slides 3, 4, 5 et 6 - Simulation, jeu d'entrainement, variables choisies et 3 machines demo

Au debut du projet, nous ne disposions pas encore de longues historiques de pannes terrain proprement annotees. Nous avons donc choisi une demarche industrielle progressive : partir d'une machine reelle, construire une simulation defendable techniquement pour demarrer, avancer par phases du signal vers le RUL, valider chaque bloc, puis preparer deja la collecte live et l'historisation qui permettront de raffiner plus tard.

Quand un dataset externe voisin existe, il peut aussi servir de repere. Dans notre cas, NASA CMAPSS ne sert pas de source principale pour le stockeur, mais de validation externe methodologique.

Cette simulation produit un vrai jeu d'entrainement. Il contient `200 trajectoires`, `4 profils de degradation` et `20 cas de charge`. Une trajectoire correspond a l'histoire complete d'une machine simulee dans le temps, avec ses mesures seconde par seconde.

Le point important est que les variables n'ont pas ete choisies au hasard. Nous suivons une chaine cause-effet simple : quand la charge augmente, la puissance augmente, donc le courant augmente, donc l'echauffement et l'usure augmentent, ce qui fait baisser l'etat de sante et monter la vibration. C'est pour cela que nous avons travaille sur des variables comme la vibration, la puissance, le courant, la temperature et l'humidite. Elles sont defendables physiquement et reutilisables plus tard dans le runtime.

Nous avons aussi construit `3` machines demo pour raconter `3` contextes d'usage differents. `ASC-A1` represente une machine protegee avec usage leger. `ASC-B2` represente une machine sous surveillance avec trafic mixte. `ASC-C3` represente une machine critique avec charges lourdes et environnement plus severe. Cela montre que la demo n'est pas un simple changement de couleur : le simulateur change les charges, le stress, l'usure et le point de depart.

### Slides 7 et 8 - Pipeline ML

Sur cette base, nous avons construit un pipeline ML complet et ordonne. Il suit les etapes suivantes : simulation, preprocessing, detection d'anomalies, construction du Health Index, prediction du RUL, evaluation, validation externe NASA CMAPSS, calibration, puis export runtime.

Ce point est important : PrediTeq n'est pas un seul modele noir. C'est une succession d'etapes ou chaque bloc a un role, et nous n'avons pas cherche a tout modeliser d'un coup. Le preprocessing enrichit les signaux avec des indicateurs intermediaires. Pour un jury non technique, une feature est simplement un indicateur calcule a partir des mesures brutes, par exemple une moyenne, une variation ou une duree de montee. La detection d'anomalies permet ensuite d'identifier des comportements inhabituels. Le Health Index resume l'etat global de sante. Enfin, le RUL estime le temps restant avant une zone critique.

### Slide 9 - RUL

Le RUL, Remaining Useful Life, est une sortie cle car elle transforme une alerte en horizon d'action. Dans notre pipeline, le RUL final est construit a partir de `hi_smooth`, donc a partir d'un signal observable en runtime, ce qui rend la logique plus defendable qu'un apprentissage direct sur une verite cachee purement simulee.

### Slide 10 - Validation

Pour evaluer la credibilite de la chaine, nous avons travaille a plusieurs niveaux. Nous avons d'abord fait un test separe sur nos donnees. Ensuite, nous avons utilise une validation par trajectoires completes avec `GroupKFold`, afin d'eviter de melanger artificiellement l'apprentissage et le test sur une meme trajectoire. Nous avons aussi mene une validation externe sur NASA CMAPSS. Enfin, nous avons ajoute une calibration pour mieux lire le niveau de confiance. Pour un non specialiste, le message important est simple : le pipeline ne tient pas seulement sur un seul essai, mais sur plusieurs controles differents, et pas seulement a la toute fin du projet.

### Slides 11 et 12 - Runtime backend et application web

Une fois le pipeline offline termine, nous exportons des artefacts qui sont ensuite charges par le backend. Le backend n'entraine pas les modeles. Son role est de recevoir les donnees live ou simulees, d'appliquer la logique runtime et d'exposer les sorties vers le frontend. Cette separation entre offline training et runtime rend l'architecture plus claire.

L'application web est la couche visible par l'utilisateur. Elle permet de consulter le dashboard, les diagnostics, les alertes, les priorites, le planner de maintenance, ainsi que les impacts en cout. Notre objectif n'etait donc pas seulement d'obtenir de bonnes predictions, mais de les rendre utilisables dans un produit.

### Slide 13 - Integration machine reelle / PLC / LabVIEW

Nous montrons egalement comment PrediTeq peut se brancher a une machine reelle. Le contrat live existe deja. Le flux cible est le suivant : LabVIEW ou le PLC collecte les mesures, un PC relais cote client les relaye via MQTT ou HTTP, puis le backend les injecte via `/ingest/live` avant de recalculer les indicateurs pour l'application.

Les `4` mesures minimales sont la vibration RMS, la puissance, la temperature et l'humidite. Des variables comme le courant, la charge ou le statut sont utiles en plus, mais le coeur du contrat est deja defini. Aujourd'hui, pour la soutenance, nous utilisons une source CSV de demonstration de type LabVIEW. Avant ce flux, nous pouvons aussi precharger une heure recente d'historique sur `ARO-01` pour rendre HI, calendrier et RUL plus fluides. Demain, la vraie acquisition remplacera surtout cette source d'entree, alors que le bridge et le backend resteront les memes.

### Slide 14 - Flux live de demonstration

Pour la soutenance, nous montrons aussi un flux live de demonstration. Il part d'une source CSV de type LabVIEW, passe par le bridge MQTT ou HTTP, alimente le backend puis l'application web. Le bootstrap `ARO-01` sert seulement a lui donner assez d'historique recent pour eviter un warmup trop long, puis la machine continue sur le vrai chemin live. Cela montre que la chaine n'est pas limitee a un notebook ou a un script offline. Nous avons deja une logique d'integration live coherente avec une future connexion reelle a un environnement industriel.

### Slide 15 - Limites et perspectives

Nous presentons enfin les limites avec clarte. Aujourd'hui, la simulation est une premiere base et doit encore etre enrichie par davantage de donnees terrain reelles. Le flux LabVIEW montre la voie d'integration live, mais certaines parties restent encore en mode demonstration. En revanche, l'architecture generale est deja en place et le projet est suffisamment structure pour evoluer vers une integration plus complete et vers un historique terrain mieux annote.

### Conclusion

En conclusion, PrediTeq apporte une chaine complete de maintenance predictive : nous partons d'un jeu d'entrainement simule defendable, nous construisons un pipeline ML ordonne et verifie, nous decrivons trois contextes machine lisibles, nous deployons ensuite les artefacts dans un backend runtime, et nous les exposons dans une application web orientee decision. C'est cette coherence de bout en bout qui fait la force du projet.

## Version encore plus simple si je bloque

- probleme industriel
- simulation pour construire un socle defendable
- jeu d'entrainement = trajectoires machine
- variables choisies pour leur logique physique
- `3` machines demo pour `3` usages
- pipeline ML complet et ordonne
- backend runtime et application web
- integration live deja preparee
- suite : plus de terrain reel

## Fichiers a ouvrir si on m'interrompt

- jeu d'entrainement / simulation : [config.py](../prediteq_ml/config.py), [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
- 3 machines demo : [demo_scenarios.py](../prediteq_api/demo_scenarios.py), [simulator.py](../prediteq_api/routers/simulator.py)
- signaux -> HI : [step2_preprocess.py](../prediteq_ml/steps/step2_preprocess.py), [step3_isolation_forest.py](../prediteq_ml/steps/step3_isolation_forest.py), [step4_health_index.py](../prediteq_ml/steps/step4_health_index.py)
- RUL : [step5_rul_model.py](../prediteq_ml/steps/step5_rul_model.py)
- resultats verifies : [metrics.json](../prediteq_ml/outputs/metrics.json), [rul_cv_scores.json](../prediteq_ml/outputs/rul_cv_scores.json), [cmapss_metrics.json](../prediteq_ml/outputs/cmapss_metrics.json), [lead_time.json](../prediteq_ml/outputs/lead_time.json)
- runtime : [engine_manager.py](../prediteq_api/ml/engine_manager.py), [diagnostics_rul.py](../prediteq_api/routers/diagnostics_rul.py), [live_ingest.py](../prediteq_api/routers/live_ingest.py)
- live : [setup_real_machine_demo.py](../prediteq_api/scripts/setup_real_machine_demo.py), [generate_labview_demo_csv.py](../prediteq_api/scripts/generate_labview_demo_csv.py), [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py), [RELAY_PC_SETUP_SIMPLE.md](../prediteq_api/RELAY_PC_SETUP_SIMPLE.md)
