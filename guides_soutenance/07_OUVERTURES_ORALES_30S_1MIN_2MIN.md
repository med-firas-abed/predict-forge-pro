# Ouvertures orales 30 s, 1 min et 2 min

Ce fichier est la version la plus simple pour bien commencer la soutenance.

Objectif :

1. commencer clairement
2. donner tout de suite une methode lisible
3. rester 100 % aligne avec les fichiers de code actuels

## Version 30 secondes

> Bonjour. Notre projet s'appelle PrediTeq. Il s'agit d'une solution de maintenance predictive appliquee a un stockeur vertical rotatif industriel. Nous sommes partis d'une machine reelle, mais sans longues historiques de pannes annotees au debut. Nous avons donc construit une simulation realiste, puis un pipeline ML progressif qui passe des signaux bruts au Health Index puis au RUL. Enfin, nous avons integre cette logique dans un backend FastAPI et une application web pour aider a decider quand intervenir.

## Version 1 minute

> Bonjour. Nous allons vous presenter PrediTeq, une solution de maintenance predictive pour un stockeur vertical rotatif industriel. Le point de depart est simple : nous avions un vrai cas machine, mais pas encore assez de donnees longues et annotees pour entrainer directement un systeme complet sur le terrain.  
> Nous avons donc suivi une demarche progressive. D'abord, construire une simulation realiste a partir des caracteristiques de la machine, de son cycle et de ses charges. Ensuite, transformer les signaux bruts en indicateurs plus parlants, detecter les anomalies, calculer un Health Index lisible, puis estimer un RUL, c'est-a-dire le temps restant avant qu'une action devienne necessaire.  
> Enfin, nous avons charge ces artefacts dans un backend runtime et une application web qui transforment cette lecture en dashboard, diagnostic, alertes, planning et suivi live.

## Version 2 minutes

> Bonjour. Notre projet s'appelle PrediTeq. Il vise a aider a intervenir au bon moment sur un stockeur vertical rotatif industriel, ni trop tard, ni trop tot.  
> Au debut du projet, nous avions un vrai cas machine et une vraie logique industrielle, mais pas encore de longues historiques de pannes annotees. Au lieu de bloquer le projet, nous avons suivi une demarche methodologique progressive et defendable.  
> La premiere phase a ete de construire une simulation realiste, ancree dans la machine reelle, son cycle de fonctionnement, ses charges et une logique physique simple : quand la charge augmente, la puissance et le courant augmentent, ce qui augmente l'echauffement et la degradation.  
> La deuxieme phase a ete de traiter les signaux bruts pour en faire des indicateurs plus lisibles par le modele. Pour un non-technicien, une feature est simplement un indicateur calcule a partir des mesures brutes, par exemple une moyenne, une variation ou une correlation.  
> La troisieme phase a ete de detecter les comportements anormaux, puis de les convertir en un Health Index facile a comprendre. Ensuite seulement, nous avons construit le RUL, c'est-a-dire le temps restant avant qu'une action devienne necessaire.  
> La quatrieme phase a ete la validation : test separe, validation par trajectoires completes, benchmark externe NASA CMAPSS et calibration.  
> Enfin, nous avons integre cette logique dans un backend FastAPI et une application web, tout en preparant deja la suite logique : la collecte live depuis LabVIEW ou PLC vers le backend, afin d'affiner plus tard le systeme avec davantage de donnees terrain reelles.

## Si le jury m'interrompt juste apres l'ouverture

Ouvrir dans cet ordre :

1. [config.py](../prediteq_ml/config.py)
2. [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
3. [step2_preprocess.py](../prediteq_ml/steps/step2_preprocess.py)
4. [step5_rul_model.py](../prediteq_ml/steps/step5_rul_model.py)
5. [live_ingest.py](../prediteq_api/routers/live_ingest.py)

## Ce qu'il ne faut pas dire

- ne pas parler d'une ancienne methode si elle n'apparait pas dans le code courant
- ne pas dire que le RUL final est entraine directement sur un label cache de simulation
- ne pas dire que NASA CMAPSS est le dataset principal du stockeur
- ne pas dire que le backend reentraine les modeles

## Formule tres sure

> Nous sommes partis d'un cas reel, nous avons construit une simulation defendable, nous avons avance par phases du signal vers le RUL, nous avons valide chaque bloc, puis nous avons deja prepare la collecte live.
