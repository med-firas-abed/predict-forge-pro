# `prediteq_ml.diagnostics`

Module runtime de diagnostics et de transparence utilisé par l'application
déployée.

## Rôle actuel

Ce dossier n'est plus un prototype séparé.

Il alimente déjà le backend FastAPI, en particulier :

- `prediteq_api/routers/diagnostics_rul.py`
- les payloads affichés dans la page `Diagnostics`
- les explications RUL, recommandations et disclaimers visibles côté produit

Le point d'entrée runtime principal est :

- `GET /diagnostics/{machine_code}/all`

Cet endpoint agrège :

- l'intervalle RUL
- le mode d'affichage du pronostic (`reference_only`, `initializing`, `prediction`)
- le stress index
- les diagnostics experts
- les explications SHAP
- les textes de transparence

## Les briques du module

| Brique | Fichier | Usage produit actuel |
|---|---|---|
| Intervalle et confiance RUL | `rul_confidence.py` | Base des intervalles et badges de confiance |
| Calibration et règles d'affichage RUL | `rul_calibration.py` | Gate de pronostic, conversion minutes -> jours, mode `reference_only / initializing / prediction` |
| Diagnostics experts | `diagnose.py` | Causes probables, actions recommandées |
| Explicabilité | `explain.py` | Contributions SHAP pour le RUL |
| Disclaimers | `disclaimers.py` | Textes de transparence et model card |

## Logique produit à retenir

Le produit ne montre pas toujours un RUL numérique.

La logique déployée est :

1. le backend calcule toujours le HI et la zone ;
2. tant que la machine est encore dans la zone très saine, l'UI reste en `reference_only` ;
3. si la dégradation devient visible mais que l'historique est encore insuffisant, l'UI passe en `initializing` ;
4. le RUL chiffré n'est publié qu'en mode `prediction`.

Note utile :

- certains payloads conservent encore des alias legacy (`no_prediction`, `warming_up`) pour compatibilité frontend ;
- la documentation publique doit désormais privilégier les modes canoniques.

## Dépendances

Les dépendances nécessaires sont déjà dans `prediteq_api/requirements.txt` :

- `numpy`
- `scikit-learn`
- `joblib`
- `shap`

## Vérification locale

Depuis la racine du repo :

```bash
python prediteq_ml/diagnostics/demo.py
```

ou module par module :

```bash
python prediteq_ml/diagnostics/rul_confidence.py
python prediteq_ml/diagnostics/diagnose.py
python prediteq_ml/diagnostics/explain.py
python prediteq_ml/diagnostics/disclaimers.py
```

## Source de vérité

Pour toute formulation jury ou produit, croiser en priorité avec :

- `prediteq_api/routers/diagnostics_rul.py`
- `prediteq_ml/diagnostics/rul_calibration.py`
- `INDEX_RESULTATS.md`

Ce README est un guide d'orientation. Le comportement exact en production reste
défini par le code runtime ci-dessus.
