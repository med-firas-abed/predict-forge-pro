# PrediTeq — Guide Complet de Présentation

## Qu'est-ce que PrediTeq ?

PrediTeq est une **plateforme SaaS de maintenance prédictive** pour ascenseurs industriels. Elle surveille les données capteurs en temps réel, utilise le Machine Learning pour prédire les pannes, et déclenche automatiquement des alertes, estimations de coûts et ordres de maintenance — **avant** que la panne ne survienne.

---

## 1. Le Pipeline ML (entraînement hors-ligne — 7 étapes)

Ce pipeline s'exécute **une seule fois** pour entraîner les modèles. Les artefacts produits sont ensuite chargés au démarrage du serveur.

| Étape | Fichier | Description |
|-------|---------|-------------|
| **Étape 1 — Simulation** | `step1_simulate.py` | Génère **100 trajectoires de vie** synthétiques d'un moteur SITI FC100L1-4 (1410 tr/min, 2.2 kW, cycle 44s). 4 profils de dégradation : **A** (linéaire), **B** (exponentiel/fatigue), **C** (par paliers/chocs), **D** (linéaire bruité). Capteurs simulés : vibration RMS, puissance, température, humidité. Sortie : `trajectories.csv`. |
| **Étape 2 — Prétraitement** | `step2_preprocess.py` | Extraction de **12 features** : 3 vibration (RMS, dérivée, variabilité), 3 puissance (moyenne, RMS, dérivée), 2 énergie (kWh/cycle, ratio durée), 2 thermiques (temp moyenne, dérivée), 2 croisées (std humidité, corrélation temp×puissance). Normalisation Z-score par rapport à la baseline saine (première heure, HI ≥ 0.8). Sortie : `features.csv` + `scaler_params.json`. |
| **Étape 3 — Détection d'anomalies** | `step3_isolation_forest.py` | **Isolation Forest** (100 arbres, 5 % contamination) entraîné uniquement sur les données saines. Combiné avec le z-score RMS en un **ensemble hybride** : `score = 0.6 × IF + 0.4 × RMS_z`. Avantage de détection précoce de 15–30 min par rapport au RMS seul. Sortie : `anomaly_scores.csv`, `isolation_forest.pkl`, `hybrid_params.json`. |
| **Étape 4 — Indice de Santé** | `step4_health_index.py` | Convertit le score hybride → un **HI ∈ [0, 1]** lisible par l'humain via normalisation par percentiles : `HI = 1 - (score - p5)/(p95 - p5)`. Zones : **Excellent** (≥ 0.8), **Bon** (≥ 0.6), **Dégradé** (≥ 0.3), **Critique** (< 0.3). Lissage sur fenêtre de 2 min (120 échantillons). Sortie : `hi.csv`, `hi_params.json`. |
| **Étape 5 — Modèle RUL** | `step5_rul_model.py` | **RandomForestRegressor** (300 arbres, max_depth=12) pour la Durée de Vie Résiduelle. Entrée : vecteur de 17 features (12 capteurs + `hi_now`, `hi_mean`, `hi_std`, `hi_min`, `hi_slope` sur 60 min). Sortie en minutes, convertie en jours calendaires (÷ 9 pour 90 jours/trajectoire). Intervalles de confiance via 10e/90e percentile des prédictions des arbres. Labels RUL calculés à partir du `simulated_hi` ground truth. Sortie : `rul_predictions.csv`, `random_forest_rul.pkl`. |
| **Étape 6 — Évaluation** | `step6_evaluate.py` + `step6b_cmapss.py` | Calcul des métriques, graphiques, explicabilité SHAP. L'étape 6B valide le pipeline sur le benchmark **NASA CMAPSS FD001** pour prouver la généralisation. |
| **Étape 7 — Export** | `step7_export.py` | Empaquette tous les artefacts (`.pkl`, `.json`, classe moteur) pour utilisation en production par FastAPI. |

### Métriques clés

| Modèle | Précision | Rappel | F1 |
|--------|-----------|--------|----|
| Isolation Forest seul | 0.409 | 1.000 | 0.581 |
| Baseline RMS | 0.777 | 1.000 | 0.874 |
| **Ensemble hybride** | **0.787** | **0.924** | **0.850** |

| Régression RUL | Valeur |
|----------------|--------|
| RMSE | 2.82 jours |
| MAE | 1.43 jours |
| **R²** | **0.983** |

### Validation NASA CMAPSS FD001

| Métrique | PrediTeq | Cible NASA |
|----------|----------|------------|
| RMSE (cycles) | **14.1** | 18.4 |
| MAE (cycles) | **9.6** | 13.2 |
| R² | **0.886** | 0.87 |

Le pipeline **dépasse toutes les cibles NASA**, confirmant la généralisation au-delà du domaine ascenseur.

---

## 2. Le Backend (FastAPI — exécution temps réel)

### Au démarrage du serveur

1. Chargement des artefacts ML (`.pkl`, `.json`)
2. Création d'une **instance PrediteqEngine par machine** en mémoire
3. Connexion MQTT (optionnelle)
4. Chargement des seuils configurables
5. Démarrage du scheduler APScheduler

### Le moteur ML en temps réel (`prediteq_engine.py`)

Chaque machine possède sa propre instance. Deux méthodes principales :

| Méthode | Fréquence | Fonctionnement |
|---------|-----------|----------------|
| `update(raw_features)` | Chaque seconde (via MQTT) | Valide les données → rejette les outliers > 5σ → normalise Z-score → score Isolation Forest → score hybride (0.6×IF + 0.4×RMS_z) → lissage → HI + zone |
| `predict_rul()` | Toutes les 60s (buffer interne) | Nécessite 60 min d'historique. Construit un vecteur 17 features → chaque arbre RF prédit → moyenne = RUL, P10/P90 = intervalle de confiance |

### Le scheduler (toutes les 10 secondes)

À chaque tick :

1. Lit le dernier `hi_smooth` de chaque moteur
2. Appelle `predict_rul()` → RUL en jours + IC
3. **Met à jour** la table `machines` (hi_courant, statut, rul_courant)
4. **Insère** dans `historique_hi` (série temporelle)
5. **Vérifie les seuils** (configurables via `/seuils`) :
   - HI < seuil critique OU RUL < seuil critique → alerte **urgence**
   - HI < seuil surveillance OU RUL < seuil surveillance → alerte **surveillance**
   - Déclenchement uniquement sur **changement de zone** (pas à chaque tick)
6. Sur alerte : insère dans `alertes`
7. **Auto-crée un coût** dans `couts` (urgence : 1800–3500 TND main d'œuvre + 400–1200 pièces ; surveillance : 400–900 + 50–250)
8. Sur urgence : **auto-crée une tâche GMAO** (si aucune tâche ouverte)
9. **Email à tous les admins approuvés** (récupérés dynamiquement depuis `profiles`) avec limitation de débit (urgence : max 1/machine/24h ; surveillance : max 1/machine/7 jours)

### Jobs planifiés supplémentaires

| Job | Fréquence | Description |
|-----|-----------|-------------|
| Rapport hebdomadaire | Lundi 08:00 UTC | Génère un rapport markdown → table `rapports` |
| Rapport mensuel | 1er du mois 08:00 | Idem, période mensuelle |

### Les 10 routeurs API

| Routeur | Préfixe | Rôle |
|---------|---------|------|
| `health` | `/health` | Vérification de disponibilité |
| `auth` | `/auth` | Authentification (Supabase) |
| `machines` | `/machines` | CRUD + statut temps réel des machines |
| `alerts` | `/alerts` | Liste et gestion des alertes |
| `report` | `/report` | Génération de rapports (template + Groq) + historique + PDF |
| `seuils` | `/seuils` | Seuils HI/RUL configurables (GET/PUT) |
| `explain` | `/explain` | Explicabilité SHAP (TreeExplainer caché) |
| `simulator` | `/simulator` | Génération de trajectoires à la volée + rejeu cumulatif |
| `chat` | `/chat` | Chatbot IA (Groq) avec 6 fonctions outils |
| `planner` | `/planner` | Planificateur IA (classement risque flotte + tâches proposées) |

---

## 3. Le Frontend — Ce que chaque page affiche

### Page de connexion
- Formulaire email + mot de passe. Authentification Supabase. Les nouveaux utilisateurs nécessitent l'approbation d'un admin (en attente → approuvé).

### Tableau de bord (page principale)
- **3 cartes machine** — chacune affiche une jauge SVG (Indice de Santé), RUL en jours avec intervalle de confiance, et une pastille de statut colorée (Opérationnel / Surveillance / Critique).
- **4 cartes KPI** en haut — HI actuel, RUL, nombre d'anomalies, cycles.
- **Graphique série temporelle HI** (Recharts) — courbe lissée montrant la dégradation du HI.
- **Fil d'alertes** — dernières alertes avec badges de sévérité.
- L'admin peut basculer entre les machines via un menu déroulant. Les utilisateurs normaux voient uniquement leur machine assignée.

### Géolocalisation (page d'accueil)
- **Carte Leaflet** avec marqueurs colorés pour les 3 machines (Ben Arous, Sfax, Sousse). Code couleur selon le statut (vert/orange/rouge). 4 cartes KPI flotte, bande de santé avec HI moyen et RUL moyen.
- **Page d'accueil par défaut** — donne un aperçu immédiat de l'état de la flotte. Accessible à tous les utilisateurs.

### Machines (admin uniquement)
- Inventaire complet. Ajout/modification de machines. Lectures capteurs en temps réel (vibration, température, courant).

### Rapport IA
- **Rapport de maintenance généré par IA**. Sélection de la machine, période (7/15/30 jours), langue (FR/EN/AR). Le backend streame un rapport markdown avec tendances HI, synthèse des alertes et recommandations.

### Calendrier
- Vue calendrier des tâches de maintenance planifiées, synchronisées depuis `gmao_taches`.

### Maintenance
- Tableau de bord GMAO. Liste les tâches ouvertes/fermées avec priorités et techniciens assignés.

### Alertes
- Historique complet des alertes. Filtrable par sévérité (urgence/surveillance), machine, plage de dates.

### Coûts (admin uniquement)
- Analytique des coûts. Affiche les coûts main d'œuvre + pièces par alerte, total par machine. Rempli automatiquement lors du déclenchement des alertes.

### Seuils (section Système, admin uniquement)
- **Seuils configurables** avec curseurs — définir les valeurs HI et RUL qui déclenchent les alertes surveillance vs urgence.
- **Graphique d'importance SHAP** — montre quelles features capteurs influencent le plus la prédiction ML pour chaque machine.

### Simulateur (section Système, admin uniquement)
- **Génération de trajectoires à la volée** pour les 3 machines à chaque lancement (profil, charge et bruit aléatoires).
- **Dégradation cumulative** : chaque session reprend là où la précédente s'est arrêtée (HI lu depuis Supabase). Avance de ~15 % du cycle de vie par session.
- État initial par défaut : ASC-A1 → opérationnel (HI=0.98), ASC-B2 → surveillance (HI=0.48), ASC-C3 → critique (HI=0.18).
- Bouton **Réinitialiser** pour revenir à l'état initial.
- Vitesse ajustable (×60, ×500, ×5000). Barres de progression par machine.

### Chat IA
- **Chatbot contextuel** alimenté par Groq (llama-3.3-70b-versatile). Dispose de 6 fonctions outils (état machine, alertes récentes, historique HI, prédiction RUL, coûts, tâches GMAO) pour répondre en s'appuyant sur les données temps réel.

### Planificateur IA (admin uniquement)
- **Classement risque de la flotte** calculé par le LLM. Propose des tâches de maintenance prioritaires avec justification, basé sur l'état HI/RUL de chaque machine.

### Administration (admin uniquement)
- Gestion des utilisateurs. Approuver/rejeter les comptes en attente, assigner des machines aux utilisateurs.

---

## 4. Flux de données (bout en bout)

```
Capteurs (1 Hz)  →  MQTT  ──┐
                             ├──→  PrediteqEngine.update()
Simulateur (à la volée)  ───┘       ├── Score Isolation Forest
                                    ├── Ensemble hybride (0.6×IF + 0.4×RMS)
                                    └── HI lissé + classification zone
                                              │
                            Scheduler (toutes les 10s)
                                ├── predict_rul() → jours + IC
                                ├── MAJ table machines
                                ├── INSERT historique_hi
                                ├── Changement de zone ? → INSERT alerte
                                │     ├── INSERT coût (auto)
                                │     ├── INSERT gmao_tache (urgence)
                                │     └── Email → tous admins (limité en débit)
                                └── Rapports hebdo/mensuels → table rapports
                                          │
                            API REST FastAPI  →  Frontend React
                                └── TanStack Query interroge les endpoints
                                     → Géolocalisation, Tableau de bord,
                                       Graphiques, Alertes, Coûts, GMAO,
                                       Chat IA, Planificateur IA
```

---

## 5. Les 3 machines de démonstration

| Machine | État initial | HI initial | Zone | Ville |
|---------|-------------|------------|------|-------|
| **ASC-A1** | Neuve | 0.98 | Opérationnel (vert) | Ben Arous |
| **ASC-B2** | Mi-vie | 0.48 | Surveillance (orange) | Sfax |
| **ASC-C3** | Fin de vie | 0.18 | Critique (rouge) | Sousse |

- Les **3 machines** passent par le pipeline ML en temps réel (Isolation Forest → HI → Random Forest → RUL).
- Le simulateur génère des trajectoires **fraîches et uniques** à chaque lancement (profil aléatoire, charge aléatoire, bruit aléatoire).
- La dégradation est **cumulative** : chaque session reprend depuis le dernier HI connu (stocké dans Supabase).
- HI et RUL affichés sont **100 % calculés par le pipeline ML** à partir des données capteurs brutes — pas des valeurs statiques.

---

## 6. Stack technique

| Couche | Technologies |
|--------|-------------|
| **ML** | Python, scikit-learn (Isolation Forest + Random Forest), SHAP, pandas, numpy |
| **Backend** | FastAPI, APScheduler, gmqtt (MQTT), Supabase (PostgreSQL + Auth), Groq (LLM), Resend (email) |
| **Frontend** | React 18, Vite, TypeScript, TailwindCSS, shadcn/ui, Recharts, Leaflet, TanStack Query |
| **Tests** | Vitest + Testing Library (31 tests unitaires), Playwright (tests E2E) |

---

*Projet PFE — Mohamed Firas Abed — 2026*
