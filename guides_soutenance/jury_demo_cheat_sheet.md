# PrediTeq
## Fiche memo de soutenance

Si tu bloques sur la derniere integration machine reelle / MQTT, ouvre aussi :

- [08_FINALISATION_APP_MACHINE_REELLE_MQTT.md](./08_FINALISATION_APP_MACHINE_REELLE_MQTT.md)
- [10_FAQ_JURY_ET_AROTEQ_SANS_BLOCAGE.md](./10_FAQ_JURY_ET_AROTEQ_SANS_BLOCAGE.md)
- [11_MATRICE_IDEES_COUVERTURE.md](./11_MATRICE_IDEES_COUVERTURE.md)
- [12_AUDIT_APP_BACKING_ETAT_REEL.md](./12_AUDIT_APP_BACKING_ETAT_REEL.md)
- [13_URLS_EN_LIGNE_ET_CSV_LABVIEW.md](./13_URLS_EN_LIGNE_ET_CSV_LABVIEW.md)

### Fil directeur en 10 secondes

> PrediTeq est une chaine complete d'aide a la decision pour la maintenance predictive.  
> On part d'un jeu d'entrainement simule defendable, on construit une lecture ML de la sante et du temps restant, puis on transforme cela en action, budget et suivi dans l'application.

---

## URLs et CSV a connaitre

- frontend public prefere : `https://prediteq.aro-teq.com/`
- frontend secours : `https://prediteq-saas.vercel.app/`
- backend public : `https://prediteq-saas.onrender.com/`
- CSV LabVIEW canonique : [ARO-01_labview_demo_template.csv](../prediteq_api/scripts/sample_data/ARO-01_labview_demo_template.csv)
- CSV live local pendant la demo : `C:\labview\prediteq_log.csv`

---

## Reset jury en 20 secondes

**Juste avant la soutenance**

- Le dashboard ouvre maintenant par defaut sur `ASC-A1`, la machine saine et verte
- Ouvrir `Simulateur`
- Si une session tourne, cliquer `Pause`
- Cliquer `Reinitialiser`
- Cliquer `Demarrer`
- Attendre quelques secondes, puis revenir sur `Tableau de bord`

**Logique a garder en tete**

- `ASC-A1` = cas bon / stable / usage leger
- `ASC-B2` = cas moyen / surveillance / trafic mixte
- `ASC-C3` = cas critique / usage severe / charges lourdes

---

## Histoire en 30 secondes

1. Nous sommes partis d'une machine reelle, mais sans longues historiques de pannes annotees au debut.
2. Nous avons donc lance une simulation realiste et defendable au lieu de bloquer le projet.
3. Le jeu d'entrainement contient `200 trajectoires`, `4 profils` et `20 cas de charge`.
4. Les variables suivent une logique simple : `charge -> puissance -> courant -> echauffement -> usure -> vibration`.
5. Le pipeline avance par phases : signaux -> indicateurs -> anomalies -> `Health Index` -> `RUL`.
6. Chaque niveau est valide, y compris avec un repere externe NASA.
7. Le flux live existe deja via `LabVIEW / PLC -> PC relais cote client -> MQTT ou HTTP -> /ingest/live -> backend -> app`.

---

## Demo recommandee en 2 a 3 minutes

### 1. ASC-A1 - lecture saine

**Ce que je clique**

- `Tableau de bord`
- `ASC-A1`

**Ce que je dis**

> Ici, je montre le cas sain. La machine est dans un contexte d'usage leger, le Health Index reste haut, et le produit reste prudent sur le RUL chiffre tant que la derive observee n'est pas assez installee.

---

### 2. ASC-B2 - surveillance

**Ce que je clique**

- Toujours sur `Tableau de bord`
- `ASC-B2`
- Montrer `Action suggeree`, `Stress`, puis `Ouvrir le diagnostic`

**Ce que je dis**

> Ici, on n'est plus dans un cas totalement sain, mais on n'est pas encore dans l'urgence critique. La valeur produit est de transformer des signaux faibles en controle terrain cible.

---

### 3. ASC-C3 - urgence, cout et rapport

**Ce que je clique**

- `ASC-C3`
- `Ouvrir le diagnostic`
- `Couts & Budget`
- `Analyse & Rapport IA`

**Ce que je dis**

> Ici, je montre le cas critique. La lecture ne s'arrete pas a un indicateur global : la page diagnostic justifie la priorite, la page budget chiffre l'impact, puis le rapport formalise la lecture.

**Cloture de cette partie**

> Donc PrediTeq ne montre pas seulement qu'une machine va mal. Il pousse une action prioritaire, chiffrable et exportable.

---

## Variante machine reelle `ARO-01`

### Ce que je lance avant d'ouvrir l'app

```powershell
cd prediteq_api
python scripts/generate_labview_demo_csv.py --machine-id ARO-01 --scenario surveillance
python scripts/setup_real_machine_demo.py --machine-id ARO-01 --name "Machine reelle" --scenario surveillance
python scripts/replay_labview_demo_csv.py --input scripts/sample_data/ARO-01_labview_demo_template.csv --output C:\labview\prediteq_log.csv --interval 1.0
python scripts/mqtt_bridge_sender.py --transport mqtt --mode csv-last-row --machine-id ARO-01 --csv-path C:\labview\prediteq_log.csv
```

### Ce que j'ouvre dans l'app

- `Machines`
- `Dashboard`
- `Diagnostics`
- `Planner`
- `Calendar`
- `Analyse & Rapport IA`

### Ce que je dis

> Ici, `ARO-01` est la machine reelle cote produit. Elle utilise le meme moteur runtime que les machines demo, mais elle ne passe pas par le simulateur. Le bootstrap nous sert seulement a lui donner assez d'historique recent pour publier plus vite HI, calendrier et RUL.

---

## Phrases sures a reutiliser

### Pour le jeu d'entrainement

> Une trajectoire est l'histoire complete d'une machine simulee dans le temps. Notre jeu d'entrainement contient 200 trajectoires, 4 profils et 20 cas de charge.

### Pour la methode suivie

> Nous avons suivi une demarche progressive : partir du reel, simuler de facon defendable, avancer bloc par bloc, valider chaque niveau, puis preparer deja la collecte terrain.

### Pour le choix des variables

> Nous avons choisi des variables qui changent vraiment quand la machine travaille plus fort ou se degrade : charge, puissance, courant, vibration, temperature et humidite.

### Pour les 3 machines demo

> Les trois machines demo ne sont pas aleatoires. Elles representent trois contextes d'usage differents avec trois regimes de sante differents.

### Pour le runtime

> Le backend ne reentraine pas les modeles ; il charge les artefacts exportes et les applique a la telemetrie runtime.

### Pour le bridge live

> Le contrat live existe deja. Aujourd'hui, seule la source CSV de demonstration remplace encore la source LabVIEW ou PLC finale.

### Pour expliquer MQTT simplement

> Sur le terrain, LabVIEW ou le PLC ecrit les mesures sur un PC relais choisi par le client. Ce PC lit les nouvelles valeurs, les normalise, puis les publie sur le topic MQTT `prediteq/{machine_id}/sensors`. Le backend PrediTeq est abonne a ce topic, recupere ces valeurs reelles, puis met a jour HI, diagnostic, calendrier et les autres vues de l'application.

### Pour `ARO-01`

> `ARO-01` n'est pas une quatrieme machine simulee. C'est la machine reelle cote application, branchee au vrai chemin runtime.

---

## Reponses flash si le jury challenge

### "Pourquoi avoir utilise de la simulation ?"

> Parce qu'il nous fallait un cadre reproductible, controle et exploitable pour demarrer, tout en preparant en parallele la collecte terrain qui servira ensuite a raffiner et annoter le systeme.

### "Qu'est-ce qu'une feature ?"

> Une feature est simplement un indicateur calcule a partir des mesures brutes, par exemple une moyenne, une variation ou une duree de montee.

### "Pourquoi trois machines demo ?"

> Pour montrer trois contextes d'usage differents : machine protegee, machine sous surveillance et machine critique.

### "Comment vous branchez-vous a une machine reelle ?"

> Le flux cible est deja defini : LabVIEW ou PLC -> PC relais cote client -> MQTT ou HTTP -> /ingest/live -> backend -> application.

### "Comment les valeurs reelles arrivent-elles avec MQTT ?"

> Les capteurs ou LabVIEW ne parlent pas directement a l'application web. Ils alimentent d'abord un PC relais cote client. Ce PC construit un message simple avec les valeurs machine et le publie sur MQTT. PrediTeq ecoute ce topic, ingere la telemetrie, puis recalcule HI, RUL, diagnostics et planning dans l'application.

### "Est-ce que tout ce qu'on voit vient directement du modele ?"

> Non. Le pronostic RUL vient du pipeline ML quand les conditions sont reunies. D'autres lectures et recommandations passent aussi par la couche runtime et les regles metier.

---

## Deux choses a ne pas dire

- Ne pas dire : "tout ce qui est affiche est du raw ML".
- Ne pas dire : "le simulateur est une image neutre et pure du modele final".

### Formulation sure

> PrediTeq est un systeme hybride d'aide a la decision : jeu d'entrainement simule pour lancer la chaine, moteur runtime pour les indicateurs live, ML pour le pronostic, et couche produit pour guider l'intervention.

---

## Chiffres a garder en tete

- Jeu d'entrainement courant : `200 trajectoires`
- Machines demo : `ASC-A1`, `ASC-B2`, `ASC-C3`
- Charge max simulee : `285 kg`
- Cycle machine simule : `44 s`
- RUL holdout : `R2 = 0.980`, `RMSE = 2.49 jours`
- RUL GroupKFold : `R2 moyen = 0.982`
- Validation externe NASA CMAPSS : `R2 = 0.886`, `RMSE = 14.1 cycles`

---

## Si je dois ouvrir le code tres vite

- jeu d'entrainement / simulation : [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
- variables et constantes : [config.py](../prediteq_ml/config.py)
- 3 machines demo : [demo_scenarios.py](../prediteq_api/demo_scenarios.py)
- logique runtime demo : [simulator.py](../prediteq_api/routers/simulator.py)
- features : [step2_preprocess.py](../prediteq_ml/steps/step2_preprocess.py)
- RUL : [step5_rul_model.py](../prediteq_ml/steps/step5_rul_model.py)
- integration live : [live_ingest.py](../prediteq_api/routers/live_ingest.py)
- bridge PC relais : [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py)
- bootstrap machine reelle : [setup_real_machine_demo.py](../prediteq_api/scripts/setup_real_machine_demo.py)
