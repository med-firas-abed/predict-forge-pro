# Script oral 7 minutes

Ce fichier est la version courte, fluide et presentable devant le jury.

Il suit l'ordre actuel des slides :

`probleme -> demarche methodologique -> jeu d'entrainement -> variables choisies -> 3 machines demo -> pipeline ML -> validation -> runtime -> app -> integration live -> conclusion`

Slides de reference :

- [04_SCRIPT_COMPLET_SLIDES_SOUTENANCE.md](./04_SCRIPT_COMPLET_SLIDES_SOUTENANCE.md)
- [03_GUIDE_MISE_A_JOUR_SLIDES.md](./03_GUIDE_MISE_A_JOUR_SLIDES.md)
- [02_GUIDE_LIVE_JURY.md](./02_GUIDE_LIVE_JURY.md)

## Plan de temps

- `0:00 - 0:35` : slides 1 et 2
- `0:35 - 1:50` : slides 3, 4 et 5
- `1:50 - 2:35` : slide 6
- `2:35 - 3:20` : slides 7 et 8
- `3:20 - 4:00` : slide 9
- `4:00 - 4:35` : slide 10
- `4:35 - 5:15` : slides 11 et 12
- `5:15 - 6:05` : slides 13 et 14
- `6:05 - 7:00` : slide 15 + conclusion

## Script complet

### Slides 1 et 2 - Titre et probleme industriel

Bonjour. Notre projet s'appelle PrediTeq. Il s'agit d'une solution de maintenance predictive appliquee a un stockeur vertical rotatif industriel. L'objectif est de partir du comportement de la machine pour aller jusqu'a une decision de maintenance lisible dans une application web.

Le besoin industriel est simple. Si on intervient trop tard, on risque une panne ou un arret. Si on intervient trop tot, on cree un cout inutile. L'idee de PrediTeq est donc d'aider a intervenir au bon moment, avec une lecture plus lisible de l'etat de sante et du temps restant avant une zone critique.

### Slides 3, 4 et 5 - Demarche methodologique, jeu d'entrainement et variables choisies

Comme nous n'avions pas encore de longues historiques de pannes terrain annotees, nous avons suivi une demarche progressive. Nous sommes partis d'une machine reelle, nous avons construit une simulation realiste pour demarrer, puis nous avons avance par phases du signal brut vers le RUL. En parallele, nous avons deja prepare la collecte live et l'historisation qui serviront a raffiner la suite.

Quand un dataset externe du meme domaine existe, il peut aussi servir de repere. Dans notre cas, NASA CMAPSS sert surtout de validation externe methodologique, pas de donnees principales du stockeur.

Notre jeu d'entrainement contient `200 trajectoires`, `4 profils de degradation` et `20 cas de charge`. Une trajectoire correspond a l'histoire complete d'une machine simulee dans le temps, avec ses mesures seconde par seconde.

Les variables n'ont pas ete choisies au hasard. Nous suivons une chaine simple : plus la charge augmente, plus la puissance et le courant augmentent, donc l'echauffement et l'usure augmentent, ce qui fait baisser l'etat de sante et monter la vibration. C'est pour cela que nous avons travaille sur des variables comme la vibration, la puissance, le courant, la temperature et l'humidite.

### Slide 6 - Les 3 machines simulees

Nous avons aussi construit `3` machines demo pour raconter `3` contextes d'usage differents. `ASC-A1` correspond a une machine protegee avec usage leger. `ASC-B2` correspond a une machine sous surveillance avec trafic mixte. `ASC-C3` correspond a une machine critique avec charges lourdes et environnement plus severe. Ce ne sont donc pas trois machines aleatoires : le simulateur change vraiment les charges, le stress, l'usure et le point de depart.

### Slides 7 et 8 - Pipeline ML

Ensuite, nous avons construit un pipeline ML complet. Il suit un ordre clair : simulation, preprocessing, detection d'anomalies, construction du Health Index, prediction du RUL, evaluation, validation externe sur NASA CMAPSS, calibration, puis export des artefacts vers le runtime.

Pour un jury non technique, une feature est simplement un indicateur calcule a partir des mesures brutes, par exemple une moyenne, une variation ou une duree de montee. Puis le pipeline transforme ces informations en une note de sante plus facile a lire.

### Slide 9 - RUL

La deuxieme sortie importante est le RUL, c'est-a-dire le temps restant avant d'atteindre une zone critique. C'est important car detecter un probleme ne suffit pas. Il faut aussi aider a planifier l'action. Dans notre pipeline, ce RUL est construit a partir de `hi_smooth`, donc a partir d'un signal exploitable en runtime.

### Slide 10 - Validation

Pour rendre le pipeline credible, nous avons valide chaque bloc avant d'aller plus loin. Cela passe par un test separe sur nos donnees, par des trajectoires completes hors apprentissage, par le jeu externe NASA CMAPSS, et enfin par une calibration. Le message important pour un non specialiste est simple : la chaine tient sur plusieurs controles differents.

### Slides 11 et 12 - Runtime et application web

Une fois les artefacts ML produits offline, ils sont charges par le backend runtime. Le backend ne reentraine pas les modeles ; il applique les exports deja prepares. L'application web consomme ensuite ces sorties pour afficher le tableau de bord, les diagnostics, les priorites, la maintenance et les couts. Nous avons donc une chaine continue allant du signal jusqu'a l'interface decisionnelle.

### Slides 13 et 14 - Integration machine reelle et demo live

Nous montrons aussi comment PrediTeq peut se brancher a une machine reelle. Le contrat live existe deja : LabVIEW ou le PLC envoient les mesures vers un PC relais cote client, puis vers MQTT ou HTTP, puis le backend les injecte via `/ingest/live`.

Les `4` mesures minimales sont la vibration RMS, la puissance, la temperature et l'humidite. Aujourd'hui, pour la soutenance, nous utilisons une source CSV de demonstration de type LabVIEW. Avant de lancer ce flux, nous pouvons aussi precharger une heure recente d'historique sur `ARO-01` pour rendre HI, calendrier et RUL plus fluides. Demain, la vraie acquisition remplacera surtout cette source d'entree, alors que le bridge et le backend resteront les memes.

### Slide 15 - Conclusion

Pour conclure, PrediTeq apporte une chaine complete de maintenance predictive : une demarche methodologique defendable, un jeu d'entrainement simule realiste, un pipeline ML ordonne, trois machines demo lisibles, un backend runtime, une application web et une integration live preparee. La prochaine etape est d'augmenter encore les donnees terrain reelles et de consolider l'annotation terrain.

## Si je manque de temps

- Je fusionne slides `3, 4 et 5` en une seule idee.
- Je reduis la validation a une phrase.
- Je garde une seule phrase sur le flux live.

## Si le jury devient technique

- preuve jeu d'entrainement : [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
- preuve variables de simulation : [config.py](../prediteq_ml/config.py), [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
- preuve 3 machines demo : [demo_scenarios.py](../prediteq_api/demo_scenarios.py), [simulator.py](../prediteq_api/routers/simulator.py)
- preuve signaux -> HI : [step2_preprocess.py](../prediteq_ml/steps/step2_preprocess.py), [step3_isolation_forest.py](../prediteq_ml/steps/step3_isolation_forest.py), [step4_health_index.py](../prediteq_ml/steps/step4_health_index.py)
- preuve RUL/validation : [step5_rul_model.py](../prediteq_ml/steps/step5_rul_model.py), [metrics.json](../prediteq_ml/outputs/metrics.json), [rul_cv_scores.json](../prediteq_ml/outputs/rul_cv_scores.json), [cmapss_metrics.json](../prediteq_ml/outputs/cmapss_metrics.json)
- preuve runtime : [engine_manager.py](../prediteq_api/ml/engine_manager.py)
- preuve live : [live_ingest.py](../prediteq_api/routers/live_ingest.py), [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py)
