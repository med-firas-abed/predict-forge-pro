# Oral Jury - HI / RUL conditionnel / L10 (1 minute)

## Version orale

"Dans PrediTeq, il faut distinguer trois choses.

D'abord, le **HI** décrit l'état de santé actuel de la machine sur une échelle
de 0 à 1. Plus il est élevé, plus la machine est saine.

Ensuite, le **RUL** n'est pas affiché en permanence. Le produit applique une
logique de publication conditionnelle. Tant que la machine est encore dans une
zone très saine, l'interface reste en mode **reference_only** et affiche une
référence statistique du composant, pas un faux compte à rebours.

Quand la dégradation devient visible, le système passe en **initializing** tant
qu'il ne dispose pas encore d'assez d'historique HI. Dans notre projet, le
modèle RUL travaille sur **60 minutes d'historique**, à raison d'un point HI
par minute.

Enfin, une fois ces conditions réunies, l'application passe en mode
**prediction** et affiche un RUL chiffré avec intervalle de confiance. Le
modèle prédit d'abord des minutes-simulation, puis la couche runtime convertit
ce résultat en jours calendaires à partir du rythme d'usage observé."

## Phrase de clôture

"En résumé : le HI dit où en est la machine maintenant ; le produit ne publie
un RUL numérique que quand ce pronostic devient crédible ; et avant cela, il
reste sur une référence composant ou un état d'initialisation."

## Si le jury relance

- Pourquoi ne pas toujours afficher le RUL ?
  Parce qu'un chiffre trop tôt donnerait une fausse précision.

- Pourquoi 60 minutes ?
  Parce que le modèle RUL utilise 60 points HI, avec un point HI par minute.

- Pourquoi parler aussi de L10 ?
  Parce qu'avant la prédiction personnalisée, l'interface garde une référence
  statistique de durée de vie composant.

- Et ce vocabulaire du moment où le pronostic devient légitime ?
  Dans l'application, on parle surtout des états
  `reference_only`, `initializing` et `prediction`.
