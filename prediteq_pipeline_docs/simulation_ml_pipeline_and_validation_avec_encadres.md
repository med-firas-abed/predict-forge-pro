# PrediTeq - Simulation, pipeline ML et validation

Version pedagogique pour jury, avec un encadre `Ce qu'il faut retenir` a la fin de chaque section.

## 1. Objectif du projet

PrediTeq est un systeme de maintenance predictive applique a un moteur d'ascenseur industriel.

Son objectif est de repondre a deux questions :

- dans quel etat de sante est la machine maintenant ?
- combien de temps utile lui reste-t-il avant d'atteindre un etat critique ?

Le systeme ne cherche donc pas seulement a detecter une panne deja arrivee.
Il cherche surtout a anticiper la degradation avant la panne.

On peut le resumer comme suit :

- les capteurs observent la machine,
- le pipeline transforme ces observations en informations utiles,
- le systeme produit un indice de sante,
- puis il estime un RUL, c'est-a-dire une duree de vie residuelle.

> **Ce qu'il faut retenir**
>
> PrediTeq ne dit pas seulement "la machine est bonne" ou "la machine est en panne".
> Il cherche a dire "la machine commence a se degrader" puis "il reste environ X temps avant une maintenance urgente".

## 2. Pourquoi commencer par une simulation ?

Dans un projet de maintenance predictive, le principal obstacle est souvent le manque de donnees de panne reelle.

Pour un ascenseur industriel reel :

- on ne possede pas facilement des annees de mesures capteurs historisees,
- on ne peut pas attendre volontairement qu'une machine casse pour apprendre,
- on ne veut pas non plus provoquer des conditions dangereuses pour fabriquer un dataset.

La simulation permet donc de creer un ensemble de trajectoires coherentes de degradation.

L'idee n'est pas d'inventer un monde fantaisiste.
L'idee est de construire un terrain d'apprentissage controle, base sur la logique physique du moteur et de sa charge.

Analogie simple :

- en medecine, on apprend aussi sur des cas types avant d'observer tous les cas reels,
- ici, la simulation joue ce role de cas types de vieillissement.

> **Ce qu'il faut retenir**
>
> La simulation existe parce que les pannes reelles longues a observer sont rares, couteuses et risquee a collecter.
> Elle sert a entrainer un pipeline coherent avant l'exploitation longue duree sur le terrain.

## 3. Machine de reference et base physique du modele

Source principale : [`prediteq_ml/config.py`](../prediteq_ml/config.py)

Le projet est ancre sur une machine cible :

- moteur SITI FC100L1-4
- puissance nominale : `2.2 kW`
- vitesse nominale : `1410 RPM`
- tension : `400 V`
- facteur de puissance : `0.80`
- courant nominal : `4.85 A`

Contexte de l'ascenseur :

- `19` etages
- `15 kg` maximum par etage
- charge totale maximale : `285 kg`

La logique physique centrale retenue par le projet est :

`charge plus forte -> puissance plus forte -> courant plus fort -> echauffement plus fort -> degradation acceleree`

Pourquoi cette logique est defendable ?

- la tension est consideree comme constante,
- la vitesse est consideree comme constante,
- le courant devient donc la variable electrique la plus representative de l'effort de la machine.

Le modele ne pretend pas reproduire toute la physique detaillee d'un moteur industriel.
Il cherche plutot a capturer la bonne direction des effets dominants.

> **Ce qu'il faut retenir**
>
> La simulation n'est pas generique. Elle est construite a partir d'un moteur reel et d'une logique simple mais defendable : plus la charge est forte, plus le moteur force, chauffe et se degrade vite.

## 4. Construction de la simulation

Fichier principal : [`prediteq_ml/steps/step1_simulate.py`](../prediteq_ml/steps/step1_simulate.py)

Sortie principale : [`prediteq_ml/data/raw/trajectories.csv`](../prediteq_ml/data/raw/trajectories.csv)

### 4.1 Nombre de trajectoires

La version actuelle du pipeline utilise `200` trajectoires synthetiques.

Elles sont reparties sur `4` profils de degradation, soit `50` trajectoires par profil.

Pourquoi `200` est un bon compromis :

- assez de diversite pour l'entrainement,
- assez de repetabilite pour comparer les profils,
- assez de volume pour stabiliser la validation croisee,
- sans produire un dataset artificiellement gigantesque.

### 4.2 Cas de charge

Le projet simule `20` cas de charge :

- `0 kg`, `15 kg`, `30 kg`, ..., `285 kg`

Pourquoi c'est logique :

- il y a 19 etages,
- chaque etage peut ajouter jusqu'a 15 kg,
- il faut donc couvrir toute la plage de fonctionnement de la machine.

### 4.3 Structure d'un cycle

Le cycle retenu est :

- `12 s` montee
- `12 s` descente
- `20 s` pause
- soit `44 s` par cycle

Ce point est tres important car un ascenseur ne consomme pas de facon continue.
Il alterne des phases d'effort et des phases de repos.

### 4.4 Bruit capteur

La simulation ajoute un bruit de mesure realiste sur :

- la vibration,
- la puissance,
- la temperature,
- l'humidite.

Cela evite d'entrainer le modele sur des signaux trop parfaits, ce qui serait trompeur.

### 4.5 Conditions d'environnement

La simulation tient compte d'une plage climatique de Ben Arous :

- temperature de `14 C` a `28 C`
- humidite de `55 %` a `80 %`

L'objectif est d'eviter un environnement artificiellement stable et de conserver un minimum de realisme thermique.

> **Ce qu'il faut retenir**
>
> La simulation ne produit pas juste des courbes aleatoires.
> Elle suit une logique de charge, de cycle, de bruit capteur et d'environnement pour rendre les trajectoires plausibles.

## 5. Les 4 profils de degradation

Le projet utilise quatre formes de vieillissement :

- `A_linear` : degradation reguliere
- `B_quadratic` : degradation lente au debut puis plus rapide a la fin
- `C_stepwise` : degradation par paliers
- `D_noisy_linear` : degradation physique lineaire mais mesures plus bruitees

Pourquoi ce choix est important ?

Parce que toutes les machines ne vieillissent pas de la meme maniere.

Certaines se degradent progressivement.
D'autres restent stables longtemps puis chutent.
D'autres encore montrent des sauts plus brusques.

Le profil `D_noisy_linear` est particulierement utile :

- la physique reste simple,
- mais les capteurs deviennent plus difficiles a lire,
- cela teste la robustesse du pipeline.

> **Ce qu'il faut retenir**
>
> Les 4 profils existent pour apprendre au modele que la degradation n'a pas une seule forme. Le pipeline doit reconnaitre plusieurs styles de vieillissement, pas seulement une pente lineaire parfaite.

## 6. Le Health Index synthetique dans la simulation

Dans la simulation, chaque trajectoire possede une variable cachee appelee `simulated_hi`.

Cette variable varie entre :

- `1` pour un etat tres sain,
- `0` pour un etat tres degrade.

Elle sert de verite terrain synthetique.

Le point important est le suivant :

- `simulated_hi` sert a construire les signaux capteurs,
- mais ce n'est pas directement la sortie finale utilisee en production.

Autrement dit :

- dans la simulation, on connait la sante "interne" de la machine,
- dans la vraie vie, on ne la connait pas,
- donc le pipeline doit reconstruire un indice de sante a partir des signaux observes.

Le code pousse volontairement les trajectoires suffisamment loin pour entrer dans la zone critique.
Cela permet au modele de bien voir la fin de vie, et pas seulement son approche.

> **Ce qu'il faut retenir**
>
> `simulated_hi` est la verite cachee de la simulation. Elle sert a fabriquer les donnees et a verifier la coherence du pipeline, mais ce n'est pas la variable que le systeme utilise telle quelle en runtime reel.

## 7. Passage des signaux bruts aux caracteristiques utiles

Fichier : [`prediteq_ml/steps/step2_preprocess.py`](../prediteq_ml/steps/step2_preprocess.py)

Sorties :

- [`prediteq_ml/data/processed/features.csv`](../prediteq_ml/data/processed/features.csv)
- [`prediteq_ml/models/scaler_params.json`](../prediteq_ml/models/scaler_params.json)

Le role de cette etape est de transformer les mesures brutes en variables plus utiles pour l'apprentissage.

Exemples de features construites :

- niveau de vibration,
- vitesse de variation de la vibration,
- variabilite de la vibration,
- puissance moyenne,
- vitesse de variation de la puissance,
- energie d'un cycle,
- temperature moyenne,
- vitesse de variation de la temperature,
- correlation entre temperature et puissance.

Pourquoi ces transformations sont utiles :

- une valeur brute seule ne raconte pas toute l'histoire,
- une tendance, une derive ou une instabilite sont souvent plus revelatrices.

Le pipeline utilise aussi plusieurs fenetres temporelles, par exemple :

- `60 s` pour les signaux rapides,
- `300 s` pour la temperature,
- `3600 s` pour des correlations plus stables.

Enfin, les features sont normalisees a partir d'une reference saine prise sur :

- la premiere heure,
- uniquement sur les trajectoires train,
- avec une sante encore bonne.

Cette normalisation cree une vraie base de comparaison du type :

- "qu'est-ce qu'un comportement normal pour cette machine ?"

> **Ce qu'il faut retenir**
>
> Le feature engineering transforme les mesures brutes en indicateurs plus intelligents : niveaux, tendances, stabilite, energie, thermique. La normalisation s'appuie sur une reference saine pour que le modele sache ce que veut dire "normal".

## 8. Detection d'anomalies

Fichier : [`prediteq_ml/steps/step3_isolation_forest.py`](../prediteq_ml/steps/step3_isolation_forest.py)

Sorties :

- [`prediteq_ml/data/processed/anomaly_scores.csv`](../prediteq_ml/data/processed/anomaly_scores.csv)
- [`prediteq_ml/models/isolation_forest.pkl`](../prediteq_ml/models/isolation_forest.pkl)
- [`prediteq_ml/models/hybrid_params.json`](../prediteq_ml/models/hybrid_params.json)

Le premier niveau de decision du pipeline est la detection d'anomalies.

Le systeme utilise un algorithme de type Isolation Forest.

Son role est simple :

- apprendre ce qu'est un comportement sain,
- puis reconnaitre ce qui s'en ecarte.

Pourquoi il est entraine sur des donnees saines uniquement ?

Parce qu'un detecteur d'anomalies doit d'abord comprendre la normalite.

S'il apprenait aussi largement la degradation, il deviendrait plus tolerant a des comportements anormaux qu'il doit justement signaler.

Parametres importants :

- `100` arbres
- contamination `0.05`
- seed `42`

Ce sont des choix raisonnables pour avoir un detecteur stable, reproductible et pas inutilement complique.

> **Ce qu'il faut retenir**
>
> L'Isolation Forest est le premier filtre du systeme. Il apprend le fonctionnement sain, puis signale les ecarts. Son role est de dire : "ce comportement ressemble-t-il encore a une machine normale ?"

## 9. Pourquoi le score hybride est meilleur qu'un seul detecteur

Le projet ne se contente pas du score de l'Isolation Forest.
Il construit un score hybride :

- `20 %` score IF
- `80 %` vibration RMS normalisee

Parametre central actuel : `HYBRID_ALPHA = 0.2`

Pourquoi ce choix est defendable ?

- dans la logique physique de PrediTeq, la vibration reste le signal mecanique le plus directement lie a la degradation,
- l'Isolation Forest apporte une vue plus globale du comportement multivarie,
- mais RMS porte l'essentiel du signal utile dans ce projet.

Le resultat est donc un compromis :

- la vibration apporte la force physique principale,
- le detecteur multivarie apporte une surveillance complementaire.

Le seuil hybride final est appris sur le train uniquement, ce qui permet de garder une evaluation test honnete.

> **Ce qu'il faut retenir**
>
> Le score hybride est meilleur parce qu'il combine le meilleur des deux mondes : la vibration, qui est le symptome mecanique principal, et l'Isolation Forest, qui surveille aussi le comportement global du systeme.

## 10. Construction du Health Index observable

Fichier : [`prediteq_ml/steps/step4_health_index.py`](../prediteq_ml/steps/step4_health_index.py)

Sorties :

- [`prediteq_ml/data/processed/hi.csv`](../prediteq_ml/data/processed/hi.csv)
- [`prediteq_ml/models/hi_params.json`](../prediteq_ml/models/hi_params.json)

Le Health Index final du pipeline est `hi_smooth`.

Il est obtenu a partir du score hybride, puis :

- normalise avec des bornes robustes `p5` et `p95`,
- lisse sur `120 secondes`,
- sous-echantillonne ensuite a une valeur par minute.

Le projet classe ensuite l'etat machine en 4 zones :

- `Excellent`
- `Good`
- `Degraded`
- `Critical`

Seuils actuels :

- `0.8`
- `0.6`
- `0.3`

Ces seuils sont importants car ils servent a la fois :

- a rendre l'etat de la machine lisible pour un humain,
- et a definir la logique du RUL.

Le lissage sur `120 s` est un bon compromis :

- assez long pour reduire le bruit,
- assez court pour rester reactif.

Validation interne importante :

- la correlation entre `hi_smooth` et `simulated_hi` est d'environ `0.943`

Cela montre que l'indice observable reconstruit suit tres bien la sante synthetique cachee.

> **Ce qu'il faut retenir**
>
> Le Health Index observable n'est pas invente arbitrairement. Il est reconstruit a partir des signaux et il reste fortement coherent avec la sante synthetique cachee de la simulation.

## 11. Prediction du RUL

Fichier : [`prediteq_ml/steps/step5_rul_model.py`](../prediteq_ml/steps/step5_rul_model.py)

Sorties :

- [`prediteq_ml/data/processed/rul_predictions.csv`](../prediteq_ml/data/processed/rul_predictions.csv)
- [`prediteq_ml/models/random_forest_rul.pkl`](../prediteq_ml/models/random_forest_rul.pkl)
- [`prediteq_ml/outputs/rul_cv_scores.json`](../prediteq_ml/outputs/rul_cv_scores.json)

Le RUL est la duree de vie residuelle.

Le point methodologique le plus fort du projet est le suivant :

- le RUL n'est pas appris directement a partir de `simulated_hi`,
- il est defini a partir de `hi_smooth`, qui est un signal observable reconstruit.

La fin de vie est definie quand :

- `hi_smooth` passe sous `0.3`,
- pendant `3` points consecutifs.

Pourquoi ce choix est tres important ?

Parce qu'en production, on n'aura jamais acces a la verite cachee de la simulation.
Il aurait donc ete scientifiquement malhonnete de former le modele avec une information impossible a mesurer dans la vraie vie.

Le modele utilise ensuite :

- 12 features capteurs,
- 5 resumes du HI,
- une fenetre historique de `60 minutes`,
- un Random Forest de `300` arbres.

Pourquoi Random Forest est un bon choix ici :

- il gere bien les non-linearites,
- il reste robuste,
- il produit aussi une dispersion de predictions via ses arbres, utile pour l'incertitude.

> **Ce qu'il faut retenir**
>
> Le RUL de PrediTeq est construit proprement : il apprend a partir d'un signal observable, pas d'une verite cachee inaccessible dans le reel. C'est l'un des points methodologiques les plus solides du projet.

## 12. Validation interne du modele RUL

Les performances principales sont sauvegardees dans :

- [`prediteq_ml/outputs/metrics.json`](../prediteq_ml/outputs/metrics.json)
- [`prediteq_ml/outputs/rul_cv_scores.json`](../prediteq_ml/outputs/rul_cv_scores.json)

Resultats actuels du holdout :

- `R2 test ~ 0.947`
- `RMSE ~ 5.05 jours`
- `MAE ~ 2.36 jours`

Validation croisee `GroupKFold` :

- `R2 moyen ~ 0.967`
- `RMSE moyen ~ 3.95 jours`

Pourquoi ces validations sont credibles ?

- le split est fait par trajectoire entiere,
- il y a stratification par profil,
- une trajectoire n'est pas decoupee entre train et test,
- la validation croisee verifie que les scores ne dependent pas d'un seul split chanceux.

Le projet compare aussi le modele final a des baselines plus simples :

- moyenne constante,
- regression lineaire,
- extrapolation lineaire du HI.

Cela montre que le choix du Random Forest est justifie et non decoratif.

Une ablation capteurs seuls vs capteurs + HI montre aussi que :

- les capteurs portent deja l'essentiel de l'information,
- les features HI ajoutent une amelioration,
- mais le modele ne se contente pas de recopier une variable presque deja finale.

> **Ce qu'il faut retenir**
>
> Les performances internes du RUL sont elevees et surtout evaluees de facon honnete. Le projet verifie a la fois le holdout, la validation croisee, les baselines et une ablation de features.

## 13. Validation externe sur NASA CMAPSS FD001

Fichier : [`prediteq_ml/steps/step6b_cmapss.py`](../prediteq_ml/steps/step6b_cmapss.py)

Sorties :

- [`prediteq_ml/outputs/cmapss_metrics.json`](../prediteq_ml/outputs/cmapss_metrics.json)
- [`prediteq_ml/outputs/plots/plot6_cmapss.png`](../prediteq_ml/outputs/plots/plot6_cmapss.png)

Cette etape est capitale pour la credibilite du projet.

Pourquoi ?

Parce qu'un bon score sur ses propres donnees synthetiques ne suffit pas.
Il faut montrer que la logique du pipeline garde de la valeur sur un benchmark public reconnu.

Resultats actuels :

- `R2 ~ 0.886`
- `RMSE ~ 14.11 cycles`
- `MAE ~ 9.64 cycles`

Nuance importante a presenter honnetement :

- dans la version executable actuelle, les chiffres sont produits sur un split interne `80/20` du jeu train CMAPSS,
- il faut donc le presenter comme une validation benchmark publique avec protocole interne de validation dans le script courant.

Malgre cette nuance, cette etape montre clairement que :

- la logique du pipeline depasse le seul cas synthetique de l'ascenseur,
- elle reste pertinente sur un benchmark de prognostic connu.

> **Ce qu'il faut retenir**
>
> La validation CMAPSS sert a prouver que la logique methodologique de PrediTeq n'est pas enfermee dans son propre monde synthetique. Le pipeline reste performant sur un benchmark public reconnu.

## 14. Calibration des intervalles de confiance

Fichier : [`prediteq_ml/steps/step6c_calibration.py`](../prediteq_ml/steps/step6c_calibration.py)

Sorties :

- [`prediteq_ml/outputs/calibration_metrics.json`](../prediteq_ml/outputs/calibration_metrics.json)
- [`prediteq_ml/outputs/plots/plot7_calibration.png`](../prediteq_ml/outputs/plots/plot7_calibration.png)

Predire une valeur moyenne ne suffit pas.
Le projet veut aussi annoncer un intervalle de confiance.

Question essentielle :

- quand le modele dit "80 % de confiance", est-ce que cela correspond vraiment a environ 80 % de couverture ?

Resultats actuels :

- couverture native IC80 : environ `87 %`
- couverture empirique au niveau 80 % : environ `88 %`
- `ECE ~ 0.088`

Interpretation :

- les intervalles sont legerement conservateurs,
- ils sont donc plutot un peu trop larges qu'excessivement optimistes.

Dans un contexte de maintenance, ce biais est generalement acceptable, voire prudent.

> **Ce qu'il faut retenir**
>
> PrediTeq ne donne pas seulement une prediction ponctuelle. Il verifie aussi si ses intervalles d'incertitude sont credibles. Les intervalles actuels sont plutot prudents, ce qui est rassurant pour un usage de maintenance.

## 15. Passage au runtime et au systeme deployable

Fichiers principaux :

- [`prediteq_ml/models/prediteq_engine.py`](../prediteq_ml/models/prediteq_engine.py)
- [`prediteq_api/ml/loader.py`](../prediteq_api/ml/loader.py)
- [`prediteq_api/ml/engine_manager.py`](../prediteq_api/ml/engine_manager.py)
- [`prediteq_ml/outputs/mqtt_schema.json`](../prediteq_ml/outputs/mqtt_schema.json)

Le pipeline n'est pas seulement un notebook ou un exercice offline.
Il a ete converti en moteur runtime.

En ligne, le systeme :

- recoit des donnees capteurs,
- reconstruit les features,
- calcule le score hybride,
- calcule `hi_smooth`,
- conserve des buffers temporels,
- predit le RUL,
- fournit aussi les bornes de confiance.

Les buffers runtime respectent la meme logique que l'offline :

- buffer de `120 s` pour le HI
- buffer de `60 min` pour le RUL

Cela est important car un modele deploye doit recevoir des donnees construites de la meme facon que lors de l'entrainement.

> **Ce qu'il faut retenir**
>
> Le projet n'est pas uniquement theorique. La logique du pipeline a ete transformee en moteur d'inference utilisable par le backend et le frontend.

## 16. Difference entre simulation offline et simulateur live

Fichier central : [`prediteq_api/routers/simulator.py`](../prediteq_api/routers/simulator.py)

Le simulateur live reutilise les memes briques physiques que la simulation offline, mais il ajoute une logique de demonstration.

Il peut par exemple :

- placer les machines A1, B2, C3 dans des stades differents,
- garder une demo visuellement stable,
- reutiliser des configurations deterministes pour l'explication au jury.

Il faut donc bien distinguer :

- la simulation offline qui sert a construire le dataset d'entrainement,
- le simulateur live qui sert a faire fonctionner une demonstration pedagogique alimentee par le vrai moteur d'inference.

> **Ce qu'il faut retenir**
>
> Le simulateur live n'est pas juste une relecture brute du dataset offline. C'est une couche de demonstration coherente qui alimente le vrai moteur de prediction pour rendre la soutenance lisible et stable.

## 17. Limites et honnetete methodologique

Un bon projet doit montrer ses forces sans cacher ses limites.

### 17.1 Donnees principalement synthetiques

La base d'apprentissage reste une simulation, meme si elle est guidee par la physique.

Il faut donc presenter le projet ainsi :

- la methode est solide,
- les performances sont coherentes,
- mais la consolidation a long terme sur davantage de donnees reelles reste une etape future naturelle.

### 17.2 Conversion minutes simulation -> jours reels

Le facteur de conversion vers les jours sert a rendre le RUL lisible humainement.

Il faut l'assumer comme :

- une convention d'affichage utile,
- pas une loi physique universelle exacte.

### 17.3 Seuils runtime

Les seuils du pipeline offline peuvent etre adaptes en runtime via la base, selon la logique backend.

Il ne faut donc pas presenter les seuils comme totalement figes pour tous les contextes.

### 17.4 Backend et entrainement sont separes

Le backend charge les modeles, mais n'effectue pas l'entrainement.

Cette separation est saine :

- `prediteq_ml/` entraine,
- `prediteq_api/` sert,
- `prediteq_frontend/` affiche.

> **Ce qu'il faut retenir**
>
> Le projet est solide, mais il doit etre presente honnetement : la base est synthetique, les conventions d'affichage doivent etre annoncees, et la consolidation sur du reel plus long reste une suite logique.

## 18. Conclusion finale pour le jury

PrediTeq est un pipeline complet de maintenance predictive pour moteur d'ascenseur.

Il :

- simule des trajectoires de degradation plausibles,
- transforme les signaux en variables plus intelligentes,
- detecte les comportements anormaux,
- reconstruit un Health Index interpretable,
- predit un RUL sans fuite d'information,
- valide ses performances en interne et sur benchmark externe,
- puis deploie la meme logique dans un moteur runtime.

Sa force principale est sa coherence methodologique :

- une simulation physiquement guidee,
- un indice observable valide,
- un RUL proprement defini,
- une evaluation honnete,
- une transition vers le runtime.

Phrase simple a retenir pour la soutenance :

PrediTeq apprend a reconnaitre comment un moteur d'ascenseur passe progressivement d'un etat sain a un etat critique, puis estime combien de temps il lui reste avant qu'une maintenance urgente devienne necessaire.

> **Ce qu'il faut retenir**
>
> PrediTeq n'est pas seulement un modele de prediction. C'est une chaine complete, coherent et defendable, qui part de la physique de la machine, passe par l'apprentissage automatique, puis arrive jusqu'a un systeme exploitable en supervision runtime.
