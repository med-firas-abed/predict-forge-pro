# Guides de soutenance

## Pack canonique

Si tu veux eviter toute confusion :

- utilise **uniquement** ce dossier [guides_soutenance](./)
- considere ce dossier comme le **pack jury officiel courant**
- quand un doc externe contredit ce dossier, fais confiance d'abord au code source puis a ce pack

Ne pas utiliser comme source jury principale, sauf verification manuelle contre le code :

- [prediteq_pipeline_docs](../prediteq_pipeline_docs)
- [references](../references)
- [PrediTeq_Rapport_Final](../PrediTeq_Rapport_Final)

Vraies sources de verite pour la simulation et le ML :

- [config.py](../prediteq_ml/config.py)
- [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
- [demo_scenarios.py](../prediteq_api/demo_scenarios.py)
- [simulator.py](../prediteq_api/routers/simulator.py)
- [step2_preprocess.py](../prediteq_ml/steps/step2_preprocess.py)
- [step5_rul_model.py](../prediteq_ml/steps/step5_rul_model.py)
- [live_ingest.py](../prediteq_api/routers/live_ingest.py)
- [setup_real_machine_demo.py](../prediteq_api/scripts/setup_real_machine_demo.py)

Ce dossier contient les fichiers de soutenance a garder ouverts ou a utiliser pendant la preparation :

## Atlas par domaine

Si tu veux une organisation "presentation" sans toucher aux vrais dossiers du projet, utilise aussi cet atlas:

- [01_simulation/README.md](./01_simulation/README.md)
- [02_ml_pipeline/README.md](./02_ml_pipeline/README.md)
- [03_runtime_iot/README.md](./03_runtime_iot/README.md)
- [04_web_app/README.md](./04_web_app/README.md)

Ces `4` dossiers sont des cartes de lecture vers le vrai code. Ils ne deplacent aucun fichier du produit et ne cassent rien dans l'app.

- [slides/PrediTeq_Soutenance_Jury_Generated.pptx](./slides/PrediTeq_Soutenance_Jury_Generated.pptx)  
  Deck PowerPoint genere automatiquement a partir des visuels verifies du rapport et des artefacts ML.

- [slides/PrediTeq_Soutenance_Jury_Generated.pdf](./slides/PrediTeq_Soutenance_Jury_Generated.pdf)  
  Export PDF du deck, utile pour relire rapidement ou imprimer.

- [rapports/PrediTeq_Dossier_Ultime_Soutenance.pdf](./rapports/PrediTeq_Dossier_Ultime_Soutenance.pdf)  
  Copie centralisee du dossier ultime pour ne pas changer de dossier pendant la soutenance.

- [01_GUIDE_DETAILLE_PERSO.md](./01_GUIDE_DETAILLE_PERSO.md)  
  Version longue pour toi : comprendre toute la chaine, savoir quoi ouvrir, savoir quoi dire, et savoir quoi lancer si on te pose une question technique.

- [02_GUIDE_LIVE_JURY.md](./02_GUIDE_LIVE_JURY.md)  
  Version courte pour la soutenance : ordre de demo, fichiers a montrer vite, commandes utiles, et reponses courtes si le jury challenge.

- [00_PANIC_SHEET_1_PAGE.md](./00_PANIC_SHEET_1_PAGE.md)  
  Version ultra-courte a garder ouverte pendant la soutenance pour retrouver tres vite quoi montrer, quoi dire et quoi lancer.

- [03_GUIDE_MISE_A_JOUR_SLIDES.md](./03_GUIDE_MISE_A_JOUR_SLIDES.md)  
  Guide separe pour remettre les slides dans la meme structure que le rapport et les guides de soutenance, avec le bloc sur le jeu d'entrainement simule, les variables choisies, les 3 machines demo et l'integration machine reelle.

- [04_SCRIPT_COMPLET_SLIDES_SOUTENANCE.md](./04_SCRIPT_COMPLET_SLIDES_SOUTENANCE.md)  
  Script complet slide par slide, pret a recopier dans PowerPoint, avec texte a mettre, visuels a utiliser et notes orales.

- [05_SCRIPT_ORAL_7_MIN.md](./05_SCRIPT_ORAL_7_MIN.md)  
  Version orale courte, fluide et chronometree pour une soutenance de `7 minutes`.

- [06_SCRIPT_ORAL_10_MIN.md](./06_SCRIPT_ORAL_10_MIN.md)  
  Version orale plus confortable pour une soutenance de `10 minutes`, avec transitions plus naturelles.

- [07_OUVERTURES_ORALES_30S_1MIN_2MIN.md](./07_OUVERTURES_ORALES_30S_1MIN_2MIN.md)  
  Trois introductions pretes a dire des les premieres secondes, toujours alignees avec les fichiers de code actuels.

- [08_FINALISATION_APP_MACHINE_REELLE_MQTT.md](./08_FINALISATION_APP_MACHINE_REELLE_MQTT.md)  
  Note finale de cloture du projet : ce qui a ete termine dans l'application, quels fichiers portent l'integration `ARO-01`, comment fonctionne le chemin `CSV LabVIEW-style -> PC relais -> MQTT -> backend -> app`, et ce qui a ete reverifie localement.

- [09_CHECKLIST_REALISE_PARTIEL_FUTUR.md](./09_CHECKLIST_REALISE_PARTIEL_FUTUR.md)  
  Checklist stricte : ce qui est deja realise, ce qui reste encore en mode demo, et comment passera plus tard le vrai flux depuis un autre PC cote client avec les fichiers exacts a utiliser.

- [10_FAQ_JURY_ET_AROTEQ_SANS_BLOCAGE.md](./10_FAQ_JURY_ET_AROTEQ_SANS_BLOCAGE.md)  
  Questions reponses pretes pour la soutenance et pour les discussions Aroteq / terrain, toujours avec les fichiers de preuve a ouvrir.

- [11_MATRICE_IDEES_COUVERTURE.md](./11_MATRICE_IDEES_COUVERTURE.md)  
  Vue d'ensemble tres stricte : chaque grande idee du projet, son statut, les fichiers code de verite et les documents qui la couvrent.

- [12_AUDIT_APP_BACKING_ETAT_REEL.md](./12_AUDIT_APP_BACKING_ETAT_REEL.md)  
  Audit concret des pages et de leur backing backend, avec la verification locale de ce qui repond vraiment aujourd'hui et la nouvelle regle de dashboard par defaut sur `ASC-A1`.

- [13_URLS_EN_LIGNE_ET_CSV_LABVIEW.md](./13_URLS_EN_LIGNE_ET_CSV_LABVIEW.md)  
  Raccourci tres pratique pour retrouver les vraies URLs publiques, le backend Render, le CSV LabVIEW canonique, le CSV live local et les fichiers de configuration du bridge.

- [jury_demo_cheat_sheet.md](./jury_demo_cheat_sheet.md)  
  Fiche memo rapide pour te recaler juste avant ou pendant la soutenance.

- [tools/create_soutenance_pptx.py](./tools/create_soutenance_pptx.py)  
  Script de regeneration du deck PowerPoint et de son export PDF.

Tu peux aussi garder comme base le guide general initial :

- [GUIDE_PIPELINE_SIMULATION_ML_ET_DEMO_LOCAL.md](./GUIDE_PIPELINE_SIMULATION_ML_ET_DEMO_LOCAL.md)

Astuce pratique :

- ouvre [PrediTeq-Jury.code-workspace](../PrediTeq-Jury.code-workspace)
- garde `2` terminaux minimum prets : backend + frontend
- si tu veux montrer le flux LabVIEW demo, prepare `3` terminaux de plus

Controle coherence :

- le pack canonique `guides_soutenance/` a ete reverifie contre les fichiers de code actuels
- aucune mention active d'une methode ancienne n'est conservee dans ce pack
- quand une formulation pouvait preter a confusion, elle a ete remplacee par une formulation plus sure
