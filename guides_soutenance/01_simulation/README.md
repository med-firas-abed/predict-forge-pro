# Atlas Soutenance: Simulation

Ce dossier est une carte de lecture. Il ne contient pas des copies du code et il ne deplace rien dans l'application.

## A quoi sert cette partie

Ici, tu retrouves tout ce qui permet d'expliquer:

- comment la machine a ete simulee
- pourquoi les variables ont ete choisies
- comment on obtient un jeu d'entrainement realiste
- comment les `3` machines de demo sont construites pour la soutenance

## Ordre simple a ouvrir

1. [config.py](../../prediteq_ml/config.py)
2. [step1_simulate.py](../../prediteq_ml/steps/step1_simulate.py)
3. [generate_labview_demo_csv.py](../../prediteq_api/scripts/generate_labview_demo_csv.py)
4. [demo_scenarios.py](../../prediteq_api/demo_scenarios.py)
5. [simulator.py](../../prediteq_api/routers/simulator.py)

## Ce que chaque fichier prouve

- [config.py](../../prediteq_ml/config.py)  
  C'est la base physique et experimentale: moteur reel, vitesse `1410 RPM`, tension `400 V`, facteur de puissance `0.80`, charge max `285 kg`, cycle `44 s`, `20` cas de charge, `4` profils de degradation, `200` trajectoires.

- [step1_simulate.py](../../prediteq_ml/steps/step1_simulate.py)  
  C'est la logique de generation du jeu d'entrainement. On y voit comment les trajectoires sont creees seconde par seconde et comment les signaux evoluent avec la charge, la phase du cycle et la degradation.

- [generate_labview_demo_csv.py](../../prediteq_api/scripts/generate_labview_demo_csv.py)  
  C'est la preuve que le flux de demo "LabVIEW / PC relais cote client" suit les memes hypotheses de simulation: cycle `12 + 12 + 20`, charge qui influence puissance et courant, HI faible qui fait monter vibration et effort moteur.

- [demo_scenarios.py](../../prediteq_api/demo_scenarios.py)  
  Ce fichier ne cree pas le jeu d'entrainement offline. Il cree les `3` machines de demonstration `ASC-A1`, `ASC-B2`, `ASC-C3` avec des regimes d'usage differents pour raconter la soutenance de facon claire.

- [simulator.py](../../prediteq_api/routers/simulator.py)  
  C'est le chemin de relecture acceleree pour la demo. Important a dire: le simulateur de soutenance est un mode de demonstration runtime, pas un re-entrainement du modele.

## Version non technique a dire

Nous n'avons pas rempli le dataset avec des nombres aleatoires. Nous avons encode une machine plausible:

- un cycle reel de montee, descente, pause
- une charge qui fait monter la puissance
- une puissance qui fait monter le courant
- un effort electrique et thermique qui use davantage le systeme
- une usure qui se voit progressivement dans les vibrations et dans l'etat de sante

## Pourquoi ces variables ont ete choisies

La chaine retenue dans le code est simple et defendable:

- `charge`
- `puissance`
- `courant`
- `temperature`
- `humidite`
- `vibration`

Pourquoi ce choix:

- la charge explique l'effort utile demande a la machine
- la puissance et le courant traduisent l'effort electrique du moteur
- la temperature et l'humidite representent le stress ambiant et thermique
- la vibration est le signal le plus directement relie a la degradation mecanique visible

## Les 3 machines simulees de demo

Les `3` machines visibles dans la soutenance ne sont pas `3` nouvelles methodes ML. Ce sont `3` contextes d'usage construits pour que le jury comprenne rapidement les differences:

- [demo_scenarios.py](../../prediteq_api/demo_scenarios.py)  
  `ASC-A1`: usage plus calme, charges legeres, meilleure sante

- [demo_scenarios.py](../../prediteq_api/demo_scenarios.py)  
  `ASC-B2`: usage moyen, demi-charges, surveillance

- [demo_scenarios.py](../../prediteq_api/demo_scenarios.py)  
  `ASC-C3`: usage intensif, charges lourdes, environnement plus severe, etat critique

## Faits surs a repeter

- le cycle simule courant est de `44 s`
- la charge max simulee est `285 kg`
- le dataset offline courant utilise `200` trajectoires
- ces `200` trajectoires couvrent `4` profils de degradation et `20` cas de charge
- les `3` machines de demo runtime servent a expliquer des etats differents au jury

## Si le jury demande une preuve de code

Montre dans cet ordre:

1. [config.py](../../prediteq_ml/config.py) pour les constantes
2. [step1_simulate.py](../../prediteq_ml/steps/step1_simulate.py) pour la logique de simulation
3. [generate_labview_demo_csv.py](../../prediteq_api/scripts/generate_labview_demo_csv.py) pour la coherence avec le flux LabVIEW demo
4. [demo_scenarios.py](../../prediteq_api/demo_scenarios.py) pour les `3` machines

## Aller ensuite vers

- [../02_ml_pipeline/README.md](../02_ml_pipeline/README.md)
- [../03_runtime_iot/README.md](../03_runtime_iot/README.md)
- [../GUIDE_PIPELINE_SIMULATION_ML_ET_DEMO_LOCAL.md](../GUIDE_PIPELINE_SIMULATION_ML_ET_DEMO_LOCAL.md)
