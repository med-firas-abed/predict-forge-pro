# Slide Jury — HI / FPT / RUL / L10

## Titre de slide

**Comment PrediTeq décide d'afficher HI, L10 ou RUL**

## Message principal

Le systeme n'affiche **pas toujours** un RUL chiffré.
Il suit une logique PHM en 3 etapes :

1. afficher le **HI** en continu ;
2. attendre le **FPT** pour autoriser le pronostic ;
3. afficher le **RUL** seulement si l'historique est suffisant.

## Schema simple

```text
HI calcule en continu
        |
        v
HI >= 0.80 ?
  | Oui
  v
Pas de RUL chiffre
Afficher L10 (reference statistique roulement)

  | Non
  v
60 points HI disponibles ?
  | Non
  v
Mode warming_up
Afficher calibration / attente + L10

  | Oui
  v
Mode prediction
Afficher RUL + intervalle de confiance + cycles restants
```

## Les seuils a ne pas confondre

| Seuil | Valeur | Signification |
|---|---:|---|
| FPT | `0.80` | debut du droit a afficher un RUL chiffre |
| Zone Good -> Degraded | `0.60` | frontiere de zone HI |
| Fin de vie critique | `0.30` | seuil utilise pour definir la cible RUL |
| Persistance | `3 points` | confirmation anti-bruit du passage sous 0.30 |

## Ce que signifie chaque notion

| Notion | Lecture simple |
|---|---|
| **HI** | etat de sante actuel |
| **FPT** | moment a partir duquel le pronostic devient legitime |
| **RUL** | temps restant estime avant intervention |
| **L10** | duree de vie statistique de reference du roulement |

## Conversion minutes -> jours

Le modele RUL predit d'abord un temps restant en **minutes-simulation**.

### Fallback historique

```text
RUL_days = RUL_minutes / 9
```

Pourquoi ?

- `800 min-sim` representent `90 jours` dans la calibration historique
- donc `800 / 90 ≈ 9`

### Correction par rythme observe

Quand on connait le rythme reel d'usage :

```text
factor = 9 x (cycles_per_day_observed / 654)
RUL_days = RUL_minutes / factor
```

Interpretation :

- plus la machine fait de cycles par jour, plus elle consomme sa vie vite ;
- donc a `RUL_minutes` egal, le nombre de jours affiches diminue.

## Exemple numerique

Si le modele predit :

```text
RUL_minutes = 540 min-sim
```

### Sans rythme observe

```text
540 / 9 = 60 jours
```

### Avec 1100 cycles/jour observes

```text
factor = 9 x (1100 / 654) = 15.14
RUL_days = 540 / 15.14 = 35.7 jours
```

Donc :

- **meme RUL brut**
- **moins de jours affiches**
- parce que la machine travaille plus intensivement.

## Message a dire a l'oral

"Le HI dit ou on en est maintenant. Le FPT dit a partir de quand on a le droit de predire. Le RUL dit ce qu'il reste si la degradation continue ainsi. Et tant que ce pronostic n'est pas encore justifie, on affiche L10, la reference statistique du composant."

## Notes speaker

- insister sur le fait que **HI** et **RUL** ne repondent pas a la meme question ;
- rappeler que **jours** = langage GMAO, **cycles** = langage PHM ;
- si le jury demande pourquoi ne pas toujours afficher un RUL : repondre **honnetete methodologique** et **pas de fausse precision**.
