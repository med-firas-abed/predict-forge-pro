# Slide Jury - HI / affichage RUL / L10

## Titre de slide

**Comment PrediTeq décide d'afficher HI, référence composant ou RUL**

## Message principal

Le système n'affiche pas toujours un RUL chiffré.

Il suit une logique runtime en 3 états :

1. `reference_only`
2. `initializing`
3. `prediction`

## Schéma simple

```text
HI calculé en continu
        |
        v
Machine encore en zone très saine ?
  | Oui
  v
Mode reference_only
Afficher la référence composant (L10)

  | Non
  v
60 points HI disponibles ?
  | Non
  v
Mode initializing
Afficher attente / calibration

  | Oui
  v
Mode prediction
Afficher RUL + intervalle + cycles restants
```

## Seuils à ne pas confondre

| Seuil | Valeur | Rôle |
|---|---:|---|
| Gate de pronostic | `0.80` | Autorise ou non l'affichage d'un RUL chiffré |
| Zone Good -> Degraded | `0.60` | Frontière de zone HI |
| Fin de vie critique | `0.30` | Seuil utilisé pour construire la cible RUL |
| Persistance | `3 points` | Confirmation anti-bruit sous `0.30` |

## Ce que signifie chaque notion

| Notion | Lecture simple |
|---|---|
| **HI** | état de santé actuel |
| **reference_only** | la machine est encore trop saine pour publier un RUL |
| **initializing** | la machine est surveillée mais l'historique est insuffisant |
| **prediction** | le RUL peut être affiché avec intervalle |
| **L10** | référence statistique composant |

## Conversion minutes -> jours

Le modèle RUL prédit d'abord un temps restant en **minutes-simulation**.

La couche runtime le convertit ensuite en jours :

```text
fallback: RUL_days = RUL_minutes / 9
runtime préféré: facteur corrigé par cycles/jour observés
```

## Message à dire à l'oral

"Le HI décrit l'état actuel. Le produit ne publie pas toujours un RUL
numérique. Il passe d'abord par une référence composant, puis par une phase
d'initialisation, et n'affiche le RUL que quand l'état courant et l'historique
le rendent crédible."
