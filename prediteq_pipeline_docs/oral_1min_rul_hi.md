# Oral Jury — HI / FPT / RUL / L10 (1 minute)

## Version orale

"Dans PrediTeq, il faut distinguer quatre notions.

Premièrement, le **HI**, ou Health Index, décrit l'état de santé **actuel** de la machine sur une échelle de 0 à 1. Plus il est élevé, plus la machine est saine.

Deuxièmement, il y a le **FPT**, First Predicting Time. C'est le moment à partir duquel un pronostic chiffré devient scientifiquement légitime. Dans notre projet, ce point est fixé à **HI < 0,80**. Tant que la machine reste au-dessus de 0,80, elle est encore dans une zone très saine, donc on n'affiche pas un RUL numérique pour éviter une fausse précision.

Troisièmement, le **RUL**, Remaining Useful Life, est le temps restant estimé avant intervention. Ce RUL n'apparaît que si deux conditions sont réunies : la machine a franchi le FPT, donc **HI < 0,80**, et le système a accumulé **60 minutes d'historique HI**, car le modèle a besoin de cette mémoire temporelle pour être crédible.

Quatrièmement, avant ce moment, on affiche le **L10**, qui est une durée de vie statistique de référence du roulement, et non un pronostic personnalisé.

Enfin, le modèle prédit d'abord un RUL en **minutes-simulation**. Ensuite, la couche d'affichage le convertit en **jours calendaires** selon le rythme réel d'utilisation de la machine. Donc les jours affichés sont une traduction opérateur, alors que les cycles restants sont l'unité PHM la plus directe." 

## Phrase de clôture

"En résumé : le HI dit où on en est maintenant, le FPT dit à partir de quand on a le droit de prédire, le RUL dit ce qu'il reste, et le L10 sert de référence tant que le pronostic chiffré n'est pas encore justifié."

## Si le jury relance

- **Pourquoi ne pas toujours afficher le RUL ?**
  Parce qu'avant apparition d'un précurseur réel, un chiffre serait trompeur.

- **Pourquoi 60 minutes ?**
  Parce que le modèle RUL travaille sur 60 points HI, à raison d'un point HI par minute.

- **Pourquoi convertir en jours ?**
  Pour la GMAO et la planification maintenance. Le système conserve aussi les cycles restants pour la lecture PHM.
