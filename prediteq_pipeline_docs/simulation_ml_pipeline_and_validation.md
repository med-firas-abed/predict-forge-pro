# PrediTeq - Explication claire de la simulation, du pipeline ML et de la validation

## 1. A quoi sert exactement ce systeme ?

PrediTeq cherche a repondre a deux questions simples pour un moteur d'ascenseur industriel :

- Dans quel etat de sante est la machine maintenant ?
- Combien de temps utile lui reste-t-il avant d'atteindre un etat critique ?

Autrement dit, le systeme ne veut pas seulement dire :

- "la machine est en panne"

Il veut dire plus tot :

- "la machine commence a se degrader"
- "elle reste encore exploitable, mais il faut surveiller"
- "si la tendance continue, il reste environ X jours avant un seuil critique"

L'idee generale est proche d'un suivi medical :

- les capteurs jouent le role des signes vitaux,
- l'indice de sante joue le role d'un score global,
- le RUL joue le role du pronostic.

## 2. Pourquoi avoir commence par une simulation ?

Dans un projet de maintenance predictive, le probleme principal est souvent le manque de donnees de panne reelle.

Pour un ascenseur industriel reel :

- on ne dispose pas facilement de plusieurs annees de capteurs historises,
- on ne peut pas attendre volontairement qu'un moteur casse juste pour collecter des donnees,
- on ne veut pas non plus mettre l'installation en danger pour fabriquer un dataset.

C'est pour cela que PrediTeq commence par une simulation physiquement guidee.

Le but n'est pas de "remplacer le reel par de l'imaginaire".
Le but est de creer un terrain d'entrainement coherent, base sur la physique de la machine, pour apprendre au modele ce qu'est :

- un comportement sain,
- une derive progressive,
- un etat degrade,
- un etat critique.

Analogie simple :

- en aeronautique, on utilise une soufflerie avant de tester en vol,
- ici, on utilise une simulation avant de deployer sur de longues periodes reelles.

## 3. Quelle est la machine de reference ?

La simulation n'est pas generique. Elle est ancree sur la machine cible du projet.

Source principale : [`prediteq_ml/config.py`](../prediteq_ml/config.py)

Parametres importants du moteur :

- moteur SITI FC100L1-4
- puissance nominale : `2.2 kW`
- vitesse nominale : `1410 RPM`
- tension : `400 V`
- facteur de puissance : `0.80`
- courant nominal : `4.85 A`

Contexte d'utilisation retenu :

- ascenseur a `19` etages
- charge maximale par etage : `15 kg`
- charge totale maximale : `285 kg`

Ces valeurs ne sont pas decoratives. Elles servent a construire toute la logique de degradation.

## 4. Idee physique centrale du projet

La logique physique choisie est la suivante :

`charge plus elevee -> puissance plus elevee -> courant plus eleve -> echauffement des bobines plus eleve -> degradation acceleree`

Pourquoi cette chaine est importante ?

Parce que dans ce projet :

- la tension est consideree comme constante,
- la vitesse est consideree comme constante,
- le courant devient donc la variable electrique qui traduit le mieux l'effort de la machine.

Dit autrement :

- plus la machine travaille, plus elle consomme,
- plus elle consomme, plus elle chauffe,
- plus elle chauffe sur la duree, plus son vieillissement s'accelere.

Ce n'est pas toute la physique d'un moteur, mais c'est un modele de degradation coherent, compréhensible et defendable pour un PFE.

## 5. Comment la simulation est construite

Fichier principal : [`prediteq_ml/steps/step1_simulate.py`](../prediteq_ml/steps/step1_simulate.py)

Sortie principale : [`prediteq_ml/data/raw/trajectories.csv`](../prediteq_ml/data/raw/trajectories.csv)

### 5.1 Pourquoi il y a 200 trajectoires

Le pipeline genere actuellement `200` trajectoires synthetiques.

Pourquoi ce choix est raisonnable :

- il y a `4` profils de degradation,
- donc `50` trajectoires par profil,
- cela donne assez de diversite pour l'entrainement,
- cela stabilise aussi la validation croisee.

Le but n'est pas d'avoir "le plus gros dataset possible".
Le but est d'avoir un dataset assez riche pour couvrir les cas utiles sans devenir arbitraire.

### 5.2 Pourquoi les cas de charge vont de 0 a 285 kg

Le projet modelise `20` cas de charge :

- `0 kg`, `15 kg`, `30 kg`, ..., `285 kg`

Pourquoi c'est logique :

- il y a 19 etages,
- chaque etage peut ajouter jusqu'a 15 kg,
- on couvre donc tous les niveaux de chargement possibles.

Cela evite un modele trop pauvre qui ne connaitrait que :

- a vide,
- demi-charge,
- pleine charge.

Or en realite, la machine travaille dans tout l'intervalle.

### 5.3 Pourquoi un cycle dure 44 secondes

La simulation retient :

- `12 s` de montee
- `12 s` de descente
- `20 s` de pause
- donc `44 s` par cycle

Pourquoi cette valeur est importante :

- la machine n'a pas un effort constant,
- elle alterne une phase de travail fort, une phase plus legere et une phase d'arret,
- cela cree un signal realiste de puissance et de courant.

Si on supprimait cette structure cyclique, on obtiendrait un moteur fictif trop lisse, qui ne ressemble plus a un ascenseur reel.

### 5.4 Pourquoi on ajoute du bruit capteur

La simulation ajoute un bruit realiste aux mesures :

- vibration : environ `1.5 %`
- puissance : environ `0.5 %`
- temperature : environ `0.1 C`
- humidite : environ `0.5 %RH`

Pourquoi ?

Parce que des capteurs parfaits n'existent pas en pratique.
Un modele entraine sur des signaux trop propres devient souvent fragile en situation reelle.

En ajoutant un bruit raisonnable, on force le pipeline a apprendre une tendance robuste et non a memoriser des courbes "trop belles".

### 5.5 Pourquoi temperature et humidite sont prises en compte

La simulation tient compte d'une plage climatique de Ben Arous :

- temperature entre `14 C` et `28 C`
- humidite entre `55 %` et `80 %`

Le but n'est pas de faire une meteorologie parfaite.
Le but est d'eviter une vision trop artificielle ou le moteur fonctionnerait dans un environnement toujours identique.

Cela ajoute du realisme sur :

- l'echauffement,
- la dispersion des mesures,
- les interactions entre charge electrique et temperature.

### 5.6 Pourquoi il y a 4 profils de degradation

Le projet ne suppose pas qu'une machine se degrade toujours de la meme facon.

Profils simules :

- `A_linear` : degradation lineaire reguliere
- `B_quadratic` : degradation lente au debut puis plus rapide a la fin
- `C_stepwise` : degradation par paliers, comme des defauts successifs
- `D_noisy_linear` : degradation physique lineaire mais capteurs plus bruites

Pourquoi c'est important :

- certaines machines vieillissent de maniere reguliere,
- d'autres restent stables longtemps puis se degradent vite,
- d'autres montrent des sauts plus brusques,
- enfin, parfois ce n'est pas la physique qui est "chaotique" mais la mesure qui devient bruitee.

Le profil `D_noisy_linear` est tres interessant pedagogiquement :

- la verite physique reste simple,
- mais ce que voient les capteurs devient plus sale,
- cela teste la robustesse du pipeline.

### 5.7 Comment le Health Index synthetique est construit dans la simulation

Chaque trajectoire possede une variable cachee appelee `simulated_hi`.

Elle varie entre `1` et `0` :

- proche de `1` : machine saine,
- proche de `0` : machine tres degradee.

Cette variable n'est pas la prediction finale du systeme. C'est la "verite terrain synthetique" de la simulation.

Elle sert a generer les signaux observables :

- vibration,
- puissance,
- courant,
- temperature,
- humidite.

### 5.8 Pourquoi le coefficient a ete pousse a 0.95

Dans la version actuelle du code, la degradation est poussee suffisamment loin pour que les trajectoires entrent vraiment dans la zone critique.

Pourquoi c'etait necessaire :

- si les trajectoires s'arretent trop tot, le modele voit mal la fin de vie,
- or la prediction RUL depend justement de la capacite a reconnaitre l'approche du seuil critique,
- le dataset doit donc couvrir aussi la zone rouge, pas seulement l'approche de cette zone.

### 5.9 Pourquoi la vitesse de degradation depend de la charge au carre

Le code utilise une logique du type :

`deg_rate = 0.3 + 0.7 * (charge / charge_max)^2`

Pourquoi c'est defendable :

- le courant augmente avec la charge,
- les pertes thermiques augmentent approximativement comme `I^2`,
- donc une dependance quadratique est une bonne approximation simple du stress.

Le terme minimal `0.3` evite aussi une machine "immortelle" a vide.

Meme sans charge, il reste :

- du frottement,
- des vibrations residuelles,
- de l'usure mecanique de base.

### 5.10 Comment vibration, puissance et courant sont relies a la sante

La simulation fait evoluer les signaux comme suit :

- quand la sante baisse, la vibration RMS augmente,
- pour une meme charge, une machine degradee peut demander plus de puissance,
- cette puissance supplementaire se traduit par davantage de courant.

C'est une bonne hypothese de travail pour un jury car elle est simple a expliquer :

- une machine fatiguee devient moins efficace,
- elle force davantage,
- elle vibre plus,
- elle chauffe plus.

## 6. Etape 2 - transformation des signaux en caracteristiques utiles

Fichier : [`prediteq_ml/steps/step2_preprocess.py`](../prediteq_ml/steps/step2_preprocess.py)

Entree : [`prediteq_ml/data/raw/trajectories.csv`](../prediteq_ml/data/raw/trajectories.csv)

Sorties :

- [`prediteq_ml/data/processed/features.csv`](../prediteq_ml/data/processed/features.csv)
- [`prediteq_ml/models/scaler_params.json`](../prediteq_ml/models/scaler_params.json)

Le but de cette etape est de transformer les mesures brutes en variables plus informatives pour l'apprentissage.

### 6.1 Pourquoi on ne travaille pas uniquement sur les signaux bruts

Les signaux bruts sont utiles, mais souvent insuffisants seuls.

Par exemple :

- une vibration elevee est informative,
- mais une vibration qui augmente vite l'est souvent encore plus,
- une temperature absolue est informative,
- mais une temperature qui monte vite peut etre plus alarmante.

Le feature engineering sert donc a faire apparaitre des tendances et non uniquement des valeurs instantanees.

### 6.2 Les 12 caracteristiques construites

Le pipeline cree `12` features principales.

Exemples faciles a expliquer au jury :

- `rms_mms` : niveau de vibration
- `drms_dt` : vitesse de variation de la vibration
- `rms_variability` : stabilite ou instabilite de la vibration
- `p_mean_kw` : puissance moyenne recente
- `p_rms_kw` : puissance efficace recente
- `dp_dt` : vitesse de variation de la puissance
- `e_cycle_kwh` : energie depensee sur un cycle de montee
- `duration_ratio` : duree observee de montee par rapport a la duree nominale
- `t_mean_c` : temperature moyenne recente
- `dt_dt` : vitesse de variation de la temperature
- `hr_std` : variabilite de l'humidite
- `corr_t_p` : lien entre temperature et puissance sur une longue fenetre

### 6.3 Pourquoi les fenetres temporelles ont du sens

Le pipeline utilise plusieurs fenetres glissantes, notamment :

- `60 s`
- `300 s`
- `3600 s`

Pourquoi ces fenetres sont raisonnables :

- `60 s` permet de lisser un peu plus qu'un cycle d'ascenseur,
- `300 s` est plus adapte a la temperature, qui evolue lentement,
- `3600 s` donne une correlation temperature-puissance plus stable.

Le principe est simple :

- les vibrations changent vite,
- la thermique change plus lentement,
- donc on ne doit pas observer tous les signaux avec la meme echelle temporelle.

### 6.4 Pourquoi la normalisation se fait sur la premiere heure saine du train uniquement

Le scaler est calcule sur les donnees :

- de la premiere heure,
- avec `simulated_hi >= 0.8`,
- seulement sur les trajectoires d'entrainement.

Pourquoi c'est une bonne pratique :

- on construit une reference de machine saine,
- on evite de melanger des donnees degradees dans la base "normale",
- on evite aussi d'utiliser le jeu de test pour calibrer le pipeline.

Autrement dit :

- le modele apprend d'abord ce que veut dire "normal",
- puis il apprend a reconnaitre l'ecart a cette normalite.

## 7. Etape 3 - detection d'anomalies

Fichier : [`prediteq_ml/steps/step3_isolation_forest.py`](../prediteq_ml/steps/step3_isolation_forest.py)

Entree : [`prediteq_ml/data/processed/features.csv`](../prediteq_ml/data/processed/features.csv)

Sorties :

- [`prediteq_ml/data/processed/anomaly_scores.csv`](../prediteq_ml/data/processed/anomaly_scores.csv)
- [`prediteq_ml/models/isolation_forest.pkl`](../prediteq_ml/models/isolation_forest.pkl)
- [`prediteq_ml/models/hybrid_params.json`](../prediteq_ml/models/hybrid_params.json)

### 7.1 Pourquoi utiliser Isolation Forest

Isolation Forest est un algorithme de detection d'anomalies.

Son role ici est de repondre a la question :

- "ce comportement ressemble-t-il encore a un comportement sain ?"

Pourquoi cet algorithme est adapte :

- il fonctionne bien quand on sait mieux definir le normal que toutes les pannes possibles,
- il est robuste,
- il reste explicable dans sa logique generale.

### 7.2 Pourquoi il est entraine sur les donnees saines seulement

Le modele est entraine sur :

- la premiere heure,
- des trajectoires d'entrainement,
- avec une sante encore elevee.

Le raisonnement est simple :

- pour detecter une anomalie, il faut d'abord apprendre ce qu'est un fonctionnement normal.

Si on entrainait le detecteur sur des donnees saines et degradees melangees, il deviendrait plus tolerant aux derivees qu'il doit justement detecter.

### 7.3 Pourquoi les hyperparametres choisis sont defendables

Valeurs actuelles :

- `n_estimators = 100`
- `contamination = 0.05`
- `random_state = 42`

Interpretation simple :

- `100` arbres : assez pour stabiliser le detecteur sans complexifier inutilement,
- `0.05` de contamination : on accepte qu'une petite partie des donnees de reference ne soit pas parfaitement saine,
- `42` : on garde un pipeline reproductible.

## 8. Pourquoi le score hybride est plus pertinent que l'Isolation Forest seul

Le pipeline ne s'arrete pas au score IF.
Il construit un score hybride :

`score hybride = 0.2 * score IF normalise + 0.8 * RMS normalise`

Parametre actuel : `HYBRID_ALPHA = 0.2`

### 8.1 Pourquoi donner 80 % du poids a RMS

Dans PrediTeq, la degradation simulee est tres fortement visible dans la vibration.

Donc :

- RMS est le signal physique le plus directement lie a la sante,
- IF reste utile comme detecteur de derive multivariee,
- mais RMS porte la plus grande partie du signal utile.

Version simple pour le jury :

- IF observe l'ensemble du comportement,
- RMS observe le symptome mecanique principal,
- dans notre cas, le symptome mecanique principal est plus informatif.

### 8.2 Pourquoi le seuil hybride est appris sur le train seulement

Le seuil retenu est proche de `0.29`.

Il est choisi sur les donnees d'entrainement uniquement.

Cela respecte une logique correcte :

- on calibre sur le train,
- on evalue sur le test,
- on ne touche pas au test pour regler le modele.

## 9. Etape 4 - construction du Health Index observable

Fichier : [`prediteq_ml/steps/step4_health_index.py`](../prediteq_ml/steps/step4_health_index.py)

Entree : [`prediteq_ml/data/processed/anomaly_scores.csv`](../prediteq_ml/data/processed/anomaly_scores.csv)

Sorties :

- [`prediteq_ml/data/processed/hi.csv`](../prediteq_ml/data/processed/hi.csv)
- [`prediteq_ml/models/hi_params.json`](../prediteq_ml/models/hi_params.json)

Le Health Index final est l'indice de sante que le systeme pourra utiliser en runtime.

### 9.1 Pourquoi il est appele observable

Dans la simulation, `simulated_hi` est une verite cachee.
Mais dans la vraie vie, cette verite cachee n'existe pas.

Le pipeline doit donc reconstruire un indice de sante a partir de ce qui est vraiment observable :

- vibration,
- puissance,
- temperature,
- humidite,
- score d'anomalie.

`hi_smooth` est justement cet indice reconstruit.

### 9.2 Pourquoi on normalise avec p5 et p95

Le pipeline utilise :

- `p5 = 0.0521...`
- `p95 = 0.6471...`

Pourquoi ne pas utiliser directement min et max ?

Parce que les minimums et maximums absolus sont plus sensibles aux cas extremes.
Les percentiles donnent une calibration plus robuste.

En pratique :

- p5 represente une zone tres saine,
- p95 represente une zone tres degradee,
- et l'indice de sante est reconstruit entre ces deux bornes.

### 9.3 Pourquoi les seuils 0.8, 0.6 et 0.3 sont importants

Le pipeline utilise les zones suivantes :

- `HI >= 0.8` : Excellent
- `0.6 <= HI < 0.8` : Good
- `0.3 <= HI < 0.6` : Degraded
- `HI < 0.3` : Critical

Ces seuils ont un role double :

- ils rendent l'etat compréhensible pour un humain,
- ils servent aussi au calcul du RUL.

Le seuil le plus important est `0.3`, car il definit l'entree en zone critique.

### 9.4 Pourquoi le HI est lisse sur 120 secondes

Le pipeline lisse l'indice sur `120 s`.

Pourquoi ce choix est bon :

- il reduit le bruit de mesure,
- il garde une reaction sur une echelle de quelques minutes,
- il ne cree pas un retard aussi grand qu'un lissage trop long.

Sur un cycle de `44 s`, une fenetre de `120 s` couvre environ `2.7` cycles.
C'est un bon compromis :

- assez long pour lisser,
- pas trop long pour encore suivre la tendance.

### 9.5 Pourquoi on passe ensuite a une valeur par minute

Une fois le HI lisse, le pipeline conserve une valeur chaque `60 s`.

Pourquoi c'est logique :

- pour le RUL, on veut surtout une tendance,
- garder une valeur par seconde serait redondant,
- la minute est une bonne unite de suivi pour la degradation.

### 9.6 Validation interne du Health Index

Le pipeline obtient une correlation elevee entre :

- `hi_smooth`
- et `simulated_hi`

Valeur actuelle : environ `0.943`.

Cela signifie que l'indice observable reconstruit suit tres bien la sante synthetique cachee.

Pour un jury, c'est un point fort important :

- on ne se contente pas d'inventer un score,
- on verifie qu'il reste coherent avec la sante physique simulee.

## 10. Etape 5 - prediction du RUL

Fichier : [`prediteq_ml/steps/step5_rul_model.py`](../prediteq_ml/steps/step5_rul_model.py)

Entrees :

- [`prediteq_ml/data/processed/hi.csv`](../prediteq_ml/data/processed/hi.csv)
- [`prediteq_ml/data/processed/features.csv`](../prediteq_ml/data/processed/features.csv)

Sorties :

- [`prediteq_ml/data/processed/rul_predictions.csv`](../prediteq_ml/data/processed/rul_predictions.csv)
- [`prediteq_ml/models/random_forest_rul.pkl`](../prediteq_ml/models/random_forest_rul.pkl)
- [`prediteq_ml/outputs/rul_cv_scores.json`](../prediteq_ml/outputs/rul_cv_scores.json)

### 10.1 Le point methodologique le plus important : pas de fuite d'information

Le RUL final n'est pas appris a partir de `simulated_hi`.

Il est defini a partir de `hi_smooth`, c'est-a-dire a partir d'un signal observable reconstruit par le pipeline.

Concretement, la fin de vie est definie comme :

- le premier instant ou `hi_smooth` passe sous `0.3`
- pendant `3` points consecutifs

Pourquoi ce choix est excellent methodologiquement :

- en production, on n'aura jamais `simulated_hi`,
- donc il serait malhonnete d'entrainer le RUL sur une verite cachee inaccessible dans le reel,
- le projet utilise donc la meme famille de signal pour l'entrainement et pour l'usage futur.

Pour un jury, c'est une vraie force scientifique du travail.

### 10.2 Pourquoi exiger 3 points consecutifs sous le seuil critique

Une seule chute ponctuelle peut etre due a du bruit.

En exigeant `3` points consecutifs, on confirme que la degradation critique est bien installee.

C'est une sorte d'anti-faux-alarme.

### 10.3 Pourquoi regarder les 60 dernieres minutes

Le modele RUL utilise une fenetre historique de `60 minutes`.

Pourquoi ce choix est defendable :

- une minute seule est trop courte pour estimer une tendance,
- plusieurs heures risqueraient d'ecraser les changements recents,
- une heure donne un bon compromis pour capter la pente recente de degradation.

### 10.4 Pourquoi utiliser un Random Forest

Modele final : Random Forest Regressor

Pourquoi ce choix est pertinent :

- il gere bien les relations non lineaires,
- il accepte des features heterogenes,
- il reste robuste,
- il permet de produire une estimation d'incertitude via la dispersion des arbres.

Dans ce projet, c'est plus realiste qu'un modele purement lineaire, car les profils de degradation ne sont pas tous lineaires.

### 10.5 Pourquoi les hyperparametres du RF sont raisonnables

Valeurs actuelles :

- `n_estimators = 300`
- `max_depth = 16`
- `min_samples_leaf = 10`
- `max_features = 'sqrt'`

Interpretation simple :

- `300` arbres : assez pour stabiliser l'ensemble,
- `max_depth = 16` : assez profond pour apprendre des relations utiles, sans laisser l'arbre memoriser tout le bruit,
- `min_samples_leaf = 10` : regularisation,
- `max_features = sqrt` : rend les arbres moins similaires entre eux.

Le fichier de validation sauvegarde aussi une courbe OOB qui montre qu'au-dela de `300`, le gain devient presque nul. Donc le choix n'est pas arbitraire.

### 10.6 Pourquoi le split et la validation croisee sont corrects

Le split est :

- `80 %` train
- `20 %` test
- par trajectoire entiere
- avec stratification par profil

Et la validation croisee utilise `GroupKFold`.

Pourquoi c'est important :

- si on melangeait des points d'une meme trajectoire entre train et test, le score serait artificiellement gonfle,
- ici, une trajectoire reste entiere dans un seul cote du split,
- cela donne une evaluation beaucoup plus honnete.

### 10.7 Pourquoi les baselines sont indispensables

Le projet compare le Random Forest a plusieurs baselines :

- un modele naif moyen constant,
- une regression lineaire,
- une extrapolation lineaire du HI.

Pourquoi c'est tres important :

- cela montre que le modele choisi apporte une vraie valeur,
- cela evite de dire "on a mis du ML parce que c'est moderne",
- cela prouve que le pipeline bat des solutions plus simples.

### 10.8 Ce que montre l'ablation capteurs seuls vs capteurs + HI

Le projet compare :

- un RF avec 17 features
- un RF avec seulement les 12 features capteurs

Resultat important :

- les capteurs seuls gardent presque toute la performance,
- les 5 features HI ajoutent une petite amelioration,
- cela montre que le modele ne se contente pas de recopier un pseudo-RUL cache dans le HI.

Autrement dit :

- l'information physique est bien presente dans les capteurs,
- le HI aide, mais n'ecrase pas toute la logique predictive.

## 11. Etape 6 - evaluation interne et plots

Fichier : [`prediteq_ml/steps/step6_evaluate.py`](../prediteq_ml/steps/step6_evaluate.py)

Sorties principales :

- [`prediteq_ml/outputs/metrics.json`](../prediteq_ml/outputs/metrics.json)
- [`prediteq_ml/outputs/plots/plot1_hi_curves.png`](../prediteq_ml/outputs/plots/plot1_hi_curves.png)
- [`prediteq_ml/outputs/plots/plot2_rul_scatter.png`](../prediteq_ml/outputs/plots/plot2_rul_scatter.png)
- [`prediteq_ml/outputs/plots/plot3_anomaly_timeline.png`](../prediteq_ml/outputs/plots/plot3_anomaly_timeline.png)
- [`prediteq_ml/outputs/plots/plot4_shap_summary.png`](../prediteq_ml/outputs/plots/plot4_shap_summary.png)
- [`prediteq_ml/outputs/plots/plot5_sensitivity_heatmap.png`](../prediteq_ml/outputs/plots/plot5_sensitivity_heatmap.png)

### 11.1 Resultats detection d'anomalies

Resultats actuels :

- IF seul : precision plus faible, rappel tres eleve
- RMS seul : bien meilleur
- hybride pondere : meilleur compromis global

Valeurs courantes dans `metrics.json` :

- IF seul : F1 environ `0.581`
- RMS baseline : F1 environ `0.877`
- hybride pondere : F1 environ `0.938`

Interpretation simple :

- IF seul detecte beaucoup, mais trop large,
- RMS seul est deja fort,
- l'hybride est le meilleur parce qu'il combine signal mecanique principal et derive multivariee.

### 11.2 Resultats RUL sur holdout

Resultats holdout actuels :

- `R2 test = 0.947`
- `RMSE = 5.05 jours`
- `MAE = 2.36 jours`

Ce sont de tres bons resultats pour un pipeline sans fuite d'information.

### 11.3 Resultats en validation croisee

Validation croisee `GroupKFold` actuelle :

- `R2 moyen = 0.967 +- 0.011`
- `RMSE moyen = 3.95 +- 0.65 jours`

Pourquoi ce point est important :

- le modele ne reussit pas seulement sur un seul split chanceux,
- ses performances restent stables sur plusieurs folds.

### 11.4 A quoi servent les plots

Role des figures :

- `plot1_hi_curves.png` : montrer que les courbes de sante ont une forme plausible
- `plot2_rul_scatter.png` : comparer RUL reel et predit
- `plot3_anomaly_timeline.png` : voir la coherence entre score d'anomalie, RMS et HI
- `plot4_shap_summary.png` : expliquer quelles features influencent le plus le RUL
- `plot5_sensitivity_heatmap.png` : tester la sensibilite du detecteur au parametre de contamination

Ces figures servent autant a la validation qu'a la pedagogie devant un jury.

## 12. Etape 6B - validation externe sur NASA CMAPSS FD001

Fichier : [`prediteq_ml/steps/step6b_cmapss.py`](../prediteq_ml/steps/step6b_cmapss.py)

Sorties :

- [`prediteq_ml/outputs/cmapss_metrics.json`](../prediteq_ml/outputs/cmapss_metrics.json)
- [`prediteq_ml/outputs/plots/plot6_cmapss.png`](../prediteq_ml/outputs/plots/plot6_cmapss.png)

### 12.1 Pourquoi cette etape est tres importante

Un bon score sur ses propres donnees synthetiques ne suffit pas.

Il faut montrer que la logique du pipeline peut aussi fonctionner sur un benchmark public reconnu.

C'est exactement le role de CMAPSS FD001.

### 12.2 Ce que cela prouve

Cette etape ne dit pas :

- "le probleme ascenseur et le probleme avion sont identiques"

Elle dit plutot :

- "la logique methodologique du pipeline est suffisamment generale pour rester performante sur un autre probleme de pronostic"

### 12.3 Nuance importante a presenter honnetement

Dans la version executable actuelle, les chiffres publies viennent d'un split interne `80/20` sur les moteurs du jeu train CMAPSS.

Donc il faut le presenter honnetement comme :

- une validation externe sur benchmark public,
- mais avec protocole interne de validation dans la version actuelle du script.

### 12.4 Resultats actuels CMAPSS

Dans [`prediteq_ml/outputs/cmapss_metrics.json`](../prediteq_ml/outputs/cmapss_metrics.json) :

- `R2 = 0.886`
- `RMSE = 14.11 cycles`
- `MAE = 9.64 cycles`

Interpretation :

- la logique du pipeline n'est pas prisonniere du seul monde synthetique de l'ascenseur,
- elle garde une bonne capacite de generalisation sur un benchmark de prognostic connu.

## 13. Etape 6C - calibration des intervalles de confiance

Fichier : [`prediteq_ml/steps/step6c_calibration.py`](../prediteq_ml/steps/step6c_calibration.py)

Sorties :

- [`prediteq_ml/outputs/calibration_metrics.json`](../prediteq_ml/outputs/calibration_metrics.json)
- [`prediteq_ml/outputs/plots/plot7_calibration.png`](../prediteq_ml/outputs/plots/plot7_calibration.png)

### 13.1 Pourquoi cette etape est utile

Predire une valeur moyenne ne suffit pas.
Il faut aussi savoir si l'intervalle d'incertitude annonce est credible.

Par exemple, si le modele annonce un intervalle de confiance a `80 %`, on veut que la vraie valeur tombe effectivement dans cet intervalle environ 80 fois sur 100.

### 13.2 Resultats actuels

Dans [`prediteq_ml/outputs/calibration_metrics.json`](../prediteq_ml/outputs/calibration_metrics.json) :

- couverture native de l'IC80 : environ `87.15 %`
- couverture empirique au niveau nominal 80 % : environ `88.07 %`
- `ECE = 0.0876`
- biais moyen : environ `+1.05 jour`

Interpretation simple :

- les intervalles sont un peu conservateurs,
- donc plutot un peu trop larges que trop optimistes.

Dans un contexte de maintenance, c'est en general preferable a une confiance excessive.

## 14. Etape 7 - passage au runtime

Fichier : [`prediteq_ml/steps/step7_export.py`](../prediteq_ml/steps/step7_export.py)

Sortie importante : [`prediteq_ml/outputs/mqtt_schema.json`](../prediteq_ml/outputs/mqtt_schema.json)

Moteur runtime principal : [`prediteq_ml/models/prediteq_engine.py`](../prediteq_ml/models/prediteq_engine.py)

### 14.1 Ce que fait le moteur runtime

En ligne, le moteur :

- normalise les donnees entrantes,
- calcule le score d'anomalie,
- construit le score hybride,
- calcule `hi_smooth`,
- accumule l'historique utile,
- predit le RUL,
- fournit aussi un intervalle de confiance.

Autrement dit, le systeme runtime n'est pas une demo de slides.
Il reutilise la logique du pipeline entrainé offline.

### 14.2 Pourquoi les buffers runtime copient la logique offline

Le runtime garde :

- un buffer HI de `120 s`
- un buffer de `60 min` pour le RUL

Pourquoi c'est important :

- si le runtime utilisait une autre logique temporelle que le pipeline d'entrainement,
- le modele recevrait des donnees d'une forme differente de celle qu'il a apprise,
- et les predictions deviendraient moins fiables.

## 15. Difference entre la simulation offline et le simulateur live du backend

Fichiers concernes :

- [`prediteq_api/routers/simulator.py`](../prediteq_api/routers/simulator.py)
- [`prediteq_api/ml/engine_manager.py`](../prediteq_api/ml/engine_manager.py)
- [`prediteq_ml/models/prediteq_engine.py`](../prediteq_ml/models/prediteq_engine.py)

Ce point doit etre explique clairement au jury.

### 15.1 Ce qu'ils ont en commun

Le simulateur live reutilise les memes briques physiques que la simulation offline :

- calcul du HI synthetique selon un profil,
- conversion HI vers vibration,
- calcul puissance/courant,
- temperature et humidite.

### 15.2 Ce qui change dans le simulateur live

Le simulateur backend ajoute une logique de demonstration :

- machines A1, B2, C3 placees dans des stades differents,
- bornes de zones pour garder une demo lisible,
- scenarios deterministes,
- regeneration de capteurs apres clamp du HI,
- seed de calibration demo.

Donc il faut le presenter comme :

- un simulateur de demonstration coherent,
- qui alimente le vrai moteur d'inference,
- mais qui n'est pas une simple relecture brute de `trajectories.csv`.

## 16. Resultats essentiels a retenir

### 16.1 Validation interne

- correlation entre `hi_smooth` et `simulated_hi` : environ `0.943`
- F1 du detecteur hybride : environ `0.938`
- `R2 holdout` du RUL : environ `0.947`
- `MAE holdout` du RUL : environ `2.36 jours`

### 16.2 Validation croisee

- `R2 moyen` : environ `0.967`
- `RMSE moyen` : environ `3.95 jours`

### 16.3 Validation benchmark externe

- `R2 CMAPSS` : environ `0.886`
- `RMSE CMAPSS` : environ `14.11 cycles`

### 16.4 Calibration des intervalles

- IC80 observe autour de `87 %` a `88 %`
- donc intervalle legerement conservateur

## 17. Limites a presenter honnetement

Un bon document de jury doit montrer les forces, mais aussi les limites.

### 17.1 Les donnees principales restent synthetiques

La simulation est guidee par la physique, mais elle reste une simulation.
Il faut donc dire clairement :

- le pipeline est methodologiquement solide,
- mais il devra encore etre consolide par davantage d'historique reel long terme.

### 17.2 La conversion minutes simulation -> jours reels est une convention d'affichage

Le facteur `RUL_MIN_TO_DAY = 9` sert a rendre les resultats lisibles en jours.

Il faut le presenter comme :

- une convention d'interpretation,
- pas comme une loi physique exacte et universelle.

### 17.3 Les seuils runtime peuvent differer des seuils offline

Les seuils par defaut sont dans le pipeline ML, mais le backend peut utiliser des seuils venant de la base Supabase.

Donc il ne faut pas presenter les seuils online comme eternels ou fixes dans tout le systeme.

### 17.4 L'API ne fait pas l'entrainement

Le backend [`prediteq_api/`](../prediteq_api/) charge les artefacts produits par [`prediteq_ml/`](../prediteq_ml/).

Il sert les modeles, il ne les entraine pas.

## 18. Conclusion simple pour le jury

PrediTeq est un pipeline complet de maintenance predictive construit autour d'un moteur d'ascenseur industriel. Il commence par une simulation guidee par la physique de la machine, transforme les signaux en caracteristiques utiles, detecte les derivees anormales, reconstruit un indice de sante interpretable, predit la duree de vie residuelle sans fuite d'information, valide ses performances par holdout, validation croisee et benchmark externe NASA, puis deploie la meme logique dans un moteur runtime exploitable par le backend et le frontend.

Le point fort majeur du projet est sa coherence methodologique :

- la simulation n'est pas arbitraire,
- le Health Index observable est valide contre la verite synthetique,
- le RUL est defini a partir d'un signal accessible en production,
- et les performances sont verifiees sur plusieurs niveaux de validation.

Si vous devez resumer le projet en une phrase devant un jury non technique :

PrediTeq apprend a reconnaitre comment un moteur d'ascenseur passe progressivement d'un etat sain a un etat critique, puis estime combien de temps il lui reste avant qu'une maintenance devienne urgente.
