# FAQ jury et Aroteq sans blocage

Ce document sert a une chose :

- t'eviter une question qui te bloque

Utilisation simple :

- si la question est tres soutenance, lis la partie `Jury`
- si la question est tres terrain / integration / exploitation, lis la partie `Aroteq`
- si quelqu'un demande une preuve, ouvre les fichiers cites juste sous la reponse

## Jury

### Pourquoi avoir commence par de la simulation ?

Reponse sure :

> Parce que nous avions un vrai cas machine, mais pas encore de longues historiques de pannes annotees. Au lieu de bloquer le projet, nous avons construit une simulation realiste et defendable pour lancer la chaine complete, tout en preparant en parallele la collecte live qui servira a raffiner la suite.

Fichiers a montrer :

- [config.py](../prediteq_ml/config.py)
- [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
- [PIPELINE_EXPLAINED.txt](../prediteq_ml/PIPELINE_EXPLAINED.txt)

### Qu'est-ce qu'une trajectoire ?

Reponse sure :

> Une trajectoire est l'histoire complete d'une machine simulee dans le temps. Dans notre pipeline, le jeu d'entrainement contient `200` trajectoires, `4` profils de degradation et `20` cas de charge.

Fichiers a montrer :

- [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
- [config.py](../prediteq_ml/config.py)

### Pourquoi ces variables ?

Reponse sure :

> Nous avons choisi des variables qui changent vraiment quand la machine travaille plus fort ou se degrade : charge, puissance, courant, vibration, temperature et humidite. Elles suivent une logique de cause a effet lisible : charge -> puissance -> courant -> echauffement / usure -> vibration.

Fichiers a montrer :

- [config.py](../prediteq_ml/config.py)
- [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
- [labview_demo.py](../prediteq_api/core/labview_demo.py)

### Qu'est-ce qu'une feature ?

Reponse sure :

> Une feature est simplement un indicateur calcule a partir des mesures brutes, par exemple une moyenne, une variation, une correlation ou une duree de montee.

Fichiers a montrer :

- [step2_preprocess.py](../prediteq_ml/steps/step2_preprocess.py)
- [engine_manager.py](../prediteq_api/ml/engine_manager.py)

### Qu'est-ce que le Health Index ?

Reponse sure :

> Le Health Index est une note de sante lisible entre `0` et `1`. Il sert a traduire des signaux techniques en un niveau d'etat plus simple a comprendre.

Fichiers a montrer :

- [step4_health_index.py](../prediteq_ml/steps/step4_health_index.py)
- [diagnostics_rul.py](../prediteq_api/routers/diagnostics_rul.py)

### Qu'est-ce que le RUL ?

Reponse sure :

> Le RUL est une estimation du temps restant avant qu'une action devienne necessaire. Dans notre pipeline actuel, le RUL final est construit a partir d'un workflow sans fuite base sur `hi_smooth`, puis utilise en runtime via les artefacts exportes.

Fichiers a montrer :

- [step5_rul_model.py](../prediteq_ml/steps/step5_rul_model.py)
- [diagnostics_rul.py](../prediteq_api/routers/diagnostics_rul.py)

### Pourquoi trois machines de demo ?

Reponse sure :

> Pour montrer trois contextes d'usage differents et trois niveaux de sante differents. `ASC-A1` represente un cas sain, `ASC-B2` un cas sous surveillance, et `ASC-C3` un cas critique.

Fichiers a montrer :

- [demo_scenarios.py](../prediteq_api/demo_scenarios.py)
- [simulator.py](../prediteq_api/routers/simulator.py)

### Est-ce que `ARO-01` est une quatrieme machine simulee ?

Reponse sure :

> Non. `ARO-01` est la machine reelle cote application. Elle utilise le meme moteur runtime que les autres machines, mais elle n'entre pas par le simulateur. Elle entre par le chemin live.

Fichiers a montrer :

- [08_FINALISATION_APP_MACHINE_REELLE_MQTT.md](./08_FINALISATION_APP_MACHINE_REELLE_MQTT.md)
- [mqtt.py](../prediteq_api/routers/mqtt.py)
- [live_ingest.py](../prediteq_api/routers/live_ingest.py)

### Est-ce que le backend re-entraine les modeles ?

Reponse sure :

> Non. Le backend charge les artefacts deja exportes par le pipeline ML et les applique a la telemetrie runtime.

Fichiers a montrer :

- [loader.py](../prediteq_api/ml/loader.py)
- [engine_manager.py](../prediteq_api/ml/engine_manager.py)
- [prediteq_ml/models](../prediteq_ml/models)

### Pourquoi faire un bootstrap de `ARO-01` ?

Reponse sure :

> Le bootstrap sert seulement a donner a la machine reelle assez d'historique recent pour que HI, calendrier et RUL soient disponibles plus vite pendant la demo. Cela ne transforme pas `ARO-01` en machine simulee.

Fichiers a montrer :

- [setup_real_machine_demo.py](../prediteq_api/scripts/setup_real_machine_demo.py)
- [live_ingest.py](../prediteq_api/routers/live_ingest.py)

### Est-ce que le flux live est vraiment en MQTT ?

Reponse sure :

> Oui. Le PC relais publie sur le topic `prediteq/{machine_id}/sensors`, et le backend PrediTeq est abonne a ce topic.

Fichiers a montrer :

- [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py)
- [mqtt.py](../prediteq_api/routers/mqtt.py)

### Qu'est-ce qui est encore demo aujourd'hui ?

Reponse sure :

> La partie encore de demonstration est surtout la source terrain finale, remplacee ici par un CSV LabVIEW-style rejoue en temps reel. En revanche, le bridge, le transport MQTT/HTTP, le backend runtime et l'application suivent deja la vraie logique produit.

Fichiers a montrer :

- [LABVIEW_CSV_BRIDGE_DEMO.md](../prediteq_api/LABVIEW_CSV_BRIDGE_DEMO.md)
- [08_FINALISATION_APP_MACHINE_REELLE_MQTT.md](./08_FINALISATION_APP_MACHINE_REELLE_MQTT.md)
- [09_CHECKLIST_REALISE_PARTIEL_FUTUR.md](./09_CHECKLIST_REALISE_PARTIEL_FUTUR.md)

### Quelles sont les limites honnetes du projet ?

Reponse sure :

> Aujourd'hui, le projet est solide sur la chaine simulation -> ML -> runtime -> application -> flux live. Ce qui reste a enrichir, c'est surtout la partie historique terrain reel long, annote, et la connexion finale au materiel exact du site.

Fichiers a montrer :

- [09_CHECKLIST_REALISE_PARTIEL_FUTUR.md](./09_CHECKLIST_REALISE_PARTIEL_FUTUR.md)

## Aroteq

### Si on prend un autre PC cote client, que fait-il exactement ?

Reponse sure :

> Il joue le role de PC relais. Il ne fait pas tourner tout PrediTeq. Il lit la source locale terrain, la normalise dans le format PrediTeq, puis l'envoie au backend via MQTT ou HTTP.

Fichiers a montrer :

- [RELAY_PC_SETUP_SIMPLE.md](../prediteq_api/RELAY_PC_SETUP_SIMPLE.md)
- [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py)
- [LABVIEW_PLC_INTEGRATION.md](../prediteq_api/LABVIEW_PLC_INTEGRATION.md)

### Si LabVIEW ecrit un CSV, est-ce deja supporte ?

Reponse sure :

> Oui. Le mode `csv-last-row` du bridge est justement prevu pour cela.

Fichiers a montrer :

- [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py)
- [PrediTeq_Bridge_Kit/run_windows_real_csv.ps1](../prediteq_api/PrediTeq_Bridge_Kit/run_windows_real_csv.ps1)
- [TRANSFER_TO_PC2/RUN_RELAY_PC_REAL_CSV.ps1](../prediteq_api/TRANSFER_TO_PC2/RUN_RELAY_PC_REAL_CSV.ps1)

### Si LabVIEW ecrit un JSON, est-ce deja supporte ?

Reponse sure :

> Oui. Le bridge sait aussi lire un fichier JSON local avec le mode `json-file`.

Fichiers a montrer :

- [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py)
- [scripts/.env.bridge.example](../prediteq_api/scripts/.env.bridge.example)

### Si le site ne donne ni CSV ni JSON ?

Reponse sure :

> On garde la meme architecture. On adapte seulement la lecture locale de la source dans `read_from_custom_source()` du bridge.

Fichiers a montrer :

- [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py)
- [LABVIEW_PLC_INTEGRATION.md](../prediteq_api/LABVIEW_PLC_INTEGRATION.md)

### Quels champs minimum le backend attend-il ?

Reponse sure :

> Les champs minimum sont `machine_id`, `observed_at`, `rms_mms`, `power_kw`, `temp_c` et `humidity_rh`.

Fichiers a montrer :

- [LABVIEW_PLC_INTEGRATION.md](../prediteq_api/LABVIEW_PLC_INTEGRATION.md)
- [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py)
- [engine_manager.py](../prediteq_api/ml/engine_manager.py)

### Et si le site ne fournit pas encore `power_kw` ou `humidity_rh` ?

Reponse sure :

> Alors il y a un vrai gap d'integration a traiter avant une exploitation complete, parce que le moteur runtime actuel depend de cette forme de telemetrie.

Fichiers a montrer :

- [LABVIEW_PLC_INTEGRATION.md](../prediteq_api/LABVIEW_PLC_INTEGRATION.md)
- [engine_manager.py](../prediteq_api/ml/engine_manager.py)

### Est-ce qu'il faut enregistrer la machine avant les donnees live ?

Reponse sure :

> Oui, c'est la bonne pratique. Sinon, les messages d'une machine inconnue peuvent etre ignores.

Fichiers a montrer :

- [register_machine.py](../prediteq_api/scripts/register_machine.py)
- [mqtt.py](../prediteq_api/routers/mqtt.py)

### Qu'est-ce qu'il faut configurer sur le backend ?

Reponse sure :

> Le broker MQTT prive, ou alternativement le point d'entree HTTP, puis la machine, puis le redemarrage du backend.

Fichiers a montrer :

- [prediteq_api/.env](../prediteq_api/.env)
- [RELAY_PC_SETUP_SIMPLE.md](../prediteq_api/RELAY_PC_SETUP_SIMPLE.md)
- [LABVIEW_PLC_INTEGRATION.md](../prediteq_api/LABVIEW_PLC_INTEGRATION.md)

### Qu'est-ce qu'il faut configurer sur le PC relais ?

Reponse sure :

> Il faut Python, les dependances bridge, puis un fichier de configuration de type `.env.bridge` pointant vers le vrai broker ou le vrai endpoint HTTP et vers la vraie source locale.

Fichiers a montrer :

- [scripts/.env.bridge.example](../prediteq_api/scripts/.env.bridge.example)
- [PrediTeq_Bridge_Kit/START_HERE.txt](../prediteq_api/PrediTeq_Bridge_Kit/START_HERE.txt)
- [TRANSFER_TO_PC2/README_FIRST.txt](../prediteq_api/TRANSFER_TO_PC2/README_FIRST.txt)

### Quel est le chemin le plus rapide pour un premier vrai test ?

Reponse sure :

> Le plus rapide est un PC relais qui lit un CSV ou un JSON local et l'envoie via le bridge actuel. C'est la voie la moins risquee parce que le code existe deja.

Fichiers a montrer :

- [RELAY_PC_SETUP_SIMPLE.md](../prediteq_api/RELAY_PC_SETUP_SIMPLE.md)
- [LABVIEW_PLC_INTEGRATION.md](../prediteq_api/LABVIEW_PLC_INTEGRATION.md)
- [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py)

### Quelle est la partie qui changera le moins entre demo et vrai site ?

Reponse sure :

> Le backend PrediTeq, le moteur runtime, le transport MQTT/HTTP et l'application changent tres peu. Ce qui change surtout, c'est la facon de lire la source locale terrain sur le PC relais.

Fichiers a montrer :

- [08_FINALISATION_APP_MACHINE_REELLE_MQTT.md](./08_FINALISATION_APP_MACHINE_REELLE_MQTT.md)
- [09_CHECKLIST_REALISE_PARTIEL_FUTUR.md](./09_CHECKLIST_REALISE_PARTIEL_FUTUR.md)
- [LABVIEW_PLC_INTEGRATION.md](../prediteq_api/LABVIEW_PLC_INTEGRATION.md)

## Trois phrases finales ultra-sures

### Version jury

> Nous avons deja une chaine complete et defendable : simulation, ML, runtime, application et flux live. La seule partie encore remplacee par une source de demonstration est l'entree terrain finale.

### Version Aroteq

> Si le site nous donne un CSV ou un JSON sur un PC relais, nous pouvons reutiliser presque toute la chaine telle quelle. Si le site donne une source plus specifique, nous adaptons seulement le lecteur local du bridge.

### Version la plus honnete

> Le projet est finalise pour la soutenance et pour un demonstrateur live credible. La derniere etape purement site-dependante sera d'adapter la lecture exacte de la vraie source terrain cote PC relais.
