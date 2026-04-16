# PrediTeq — Présentation du Pipeline ML
## Pour la soutenance PFE — Mohamed Firas Abed

> Chaque section = 1 slide. Les notes entre parenthèses sont des indications orales.

---

## SLIDE 1 — Le problème

**Titre : Pourquoi la maintenance prédictive ?**

Aujourd'hui, les ascenseurs tombent en panne **sans prévenir**.

| Type de maintenance | Principe | Problème |
|---|---|---|
| **Corrective** | On répare quand ça casse | Arrêt imprévu, coûts élevés, risque sécurité |
| **Préventive** | On change les pièces tous les X mois | On remplace souvent des pièces encore bonnes → gaspillage |
| **Prédictive** ✅ | On surveille la machine et on prédit quand elle va casser | Intervention juste à temps, zéro gaspillage |

**Analogie :** C'est comme aller chez le médecin. Corrective = urgences. Préventive = check-up tous les mois même si on va bien. Prédictive = une montre connectée qui dit "attention, ton cœur fatigue" → tu consultes au bon moment.

---

## SLIDE 2 — Les données : pourquoi simuler ?

**Titre : D'où viennent nos données ?**

**Problème :** Notre machine (SITI FC100L1-4) n'a **pas encore de capteurs physiques** installés. C'est la phase 1 du projet (validation).

**Solution :** On simule les données à partir de la **fiche technique réelle** du moteur :
- Vitesse : 1410 tr/min (constante)
- Puissance : 2.2 kW
- Cycle : 12s montée + 12s descente + 20s pause = 44 secondes

On génère **100 vies complètes** (trajectoires) du moteur, chacune simulant **3 mois** de fonctionnement. On y injecte 4 types de dégradation réalistes :

| Profil | Comportement | Exemple réel |
|--------|-------------|--------------|
| **A** — Linéaire | Usure progressive et régulière | Roulements qui s'usent petit à petit |
| **B** — Exponentiel | Ça va bien longtemps, puis ça se dégrade vite | Fatigue mécanique (ça craque d'un coup) |
| **C** — Par paliers | Des chocs soudains qui font descendre la santé | Surcharges répétées, chocs mécaniques |
| **D** — Bruité | Usure linéaire mais avec beaucoup de bruit | Environnement instable (variations de charge) |

**Validation :** Pour prouver que notre pipeline fonctionne aussi sur des données réelles, on l'a testé sur **NASA CMAPSS** (100 moteurs de turboréacteurs) → résultats meilleurs que la référence NASA (slide 10).

---

## SLIDE 3 — Vue d'ensemble du pipeline

**Titre : Le pipeline en 7 étapes**

```
Données brutes → Prétraitement → Détection d'anomalies → Indice de Santé → Prédiction RUL
```

En version simple :

1. 📊 **Simuler** les données capteurs (vibration, puissance, température, humidité)
2. 🔧 **Nettoyer** et extraire 12 indicateurs pertinents
3. 🔍 **Détecter** les comportements anormaux (Isolation Forest)
4. 📈 **Calculer** un score de santé de 0 à 100 % (Indice de Santé)
5. ⏳ **Prédire** combien de jours il reste avant la panne (RUL)
6. ✅ **Évaluer** la qualité des prédictions (métriques + graphiques)
7. 📦 **Exporter** les modèles pour l'application web

---

## SLIDE 4 — Étape 2 : Les 12 features (indicateurs)

**Titre : Qu'est-ce qu'on mesure exactement ?**

À partir de 4 capteurs bruts, on extrait **12 indicateurs** :

| Capteur | Indicateurs extraits | Ce qu'ils mesurent |
|---------|---------------------|-------------------|
| **Vibration** | RMS, dérivée, variabilité | L'usure mécanique (un moteur usé vibre plus) |
| **Puissance** | Moyenne, RMS, dérivée | L'effort du moteur (s'il force, il consomme plus) |
| **Énergie** | kWh/cycle, ratio durée | L'efficacité (plus d'énergie pour le même travail = dégradation) |
| **Température** | Moyenne, dérivée | L'échauffement (un moteur dégradé chauffe plus) |
| **Croisé** | Std humidité, corrélation temp×puissance | Les interactions entre capteurs |

**Analogie :** C'est comme un bilan sanguin. Le médecin ne regarde pas juste la température — il regarde le cholestérol, la glycémie, les globules... ensemble. Nos 12 indicateurs, c'est le "bilan sanguin" de la machine.

**Normalisation :** Chaque indicateur est normalisé par rapport à la machine quand elle est **saine** (première heure de fonctionnement). Comme ça, un "2" veut dire "2 fois plus anormal que la normale".

---

## SLIDE 5 — Étape 3 : Détection d'anomalies

**Titre : Comment on détecte qu'une machine va mal ?**

### Isolation Forest — le détecteur d'anomalies

**Principe simple :** Isolation Forest essaie d'**isoler** chaque point de données. Un point normal est entouré de plein d'autres points similaires → difficile à isoler. Un point anormal est différent de tous les autres → facile à isoler.

**Analogie :** Dans une foule de gens habillés normalement, un clown est facile à repérer. Isolation Forest repère les "clowns" dans nos données.

### Pourquoi pas d'autres méthodes ?

| Méthode | Pourquoi on ne l'a pas choisie |
|---------|-------------------------------|
| **Deep Learning** (autoencodeur) | Besoin de milliers de données. On en a 100. Trop risqué. |
| **One-Class SVM** | Trop lent (temps de calcul O(n³)) pour du temps réel |
| **DBSCAN / LOF** | Pas conçu pour du scoring en continu |
| **Classifieur supervisé** | Besoin d'exemples de pannes. Les pannes sont rares ! |

**Avantage clé :** Isolation Forest apprend **uniquement sur les données saines**. Pas besoin d'exemples de pannes. En maintenance prédictive, c'est crucial car les pannes sont rares.

---

## SLIDE 6 — L'ensemble hybride

**Titre : Pourquoi combiner deux méthodes ?**

### Le problème d'Isolation Forest seul

IF seul a une précision de seulement **41 %**. Pourquoi ? Quand l'ascenseur monte, la puissance augmente brusquement. IF croit que c'est une anomalie, mais c'est **normal** → fausses alertes.

### La solution : combiner IF + vibration RMS

```
Score hybride = 60 % × Isolation Forest + 40 % × Vibration RMS
```

- **IF** détecte les anomalies **complexes** (combinaisons inhabituelles de tous les capteurs)
- **RMS** détecte les anomalies **physiques** (vibration excessive = usure mécanique)

### Résultats de la comparaison

| Méthode | Précision | Rappel | Score F1 |
|---------|-----------|--------|----------|
| IF seul | 41 % | 100 % | 58 % |
| RMS seul | 78 % | 100 % | 87 % |
| **Hybride (60/40)** | **79 %** | **92 %** | **85 %** |

**Que veulent dire ces chiffres ?**

- **Précision** = Quand le système envoie une alerte, est-ce un vrai problème ? IF seul : sur 100 alertes, seulement 41 sont de vrais problèmes → 59 fausses alertes. Hybride : 79 sur 100 sont de vrais problèmes. Bien mieux.
- **Rappel** = De toutes les pannes réelles, combien le système en a trouvé ? IF seul : 100 %, il trouve tout — mais il alerte aussi quand il n'y a rien (le garçon qui crie au loup). Hybride : 92 %, il rate 2 pannes mineures sur 20, mais les alertes sont fiables.
- **F1** = Un score global qui combine les deux. Plus c'est haut, mieux c'est.

**En résumé :** IF seul trouve tout mais noie le technicien sous les fausses alertes → il ne fait plus confiance. Le hybride trouve presque tout ET les alertes sont fiables → le technicien agit.

**Pourquoi 60/40 ?** On a testé 50/50, 60/40 et 70/30. Le 60/40 donne le moins de fausses alertes sans rater de pannes importantes. C'est comme régler le volume d'une alarme : trop sensible → elle sonne tout le temps (personne n'écoute). Pas assez → elle rate des vrais problèmes.

---

## SLIDE 7 — Étape 4 : L'Indice de Santé (HI)

**Titre : Transformer un score ML en quelque chose de compréhensible**

### Le problème
Le score d'anomalie brut (ex: "0.73") ne veut rien dire pour un technicien.

### La solution : l'Indice de Santé (HI)

```
HI = 100 % → machine parfaitement saine
HI = 0 %   → panne imminente
```

| Zone | HI | Couleur | Action |
|------|-----|---------|--------|
| **Opérationnel** | ≥ 80 % | 🟢 Vert | Aucune action |
| **Surveillance** | 60-80 % | 🟡 Jaune | Planifier une inspection |
| **Dégradé** | 30-60 % | 🟠 Orange | Préparer l'intervention |
| **Critique** | < 30 % | 🔴 Rouge | Intervention urgente |

**Analogie :** C'est comme la jauge d'essence d'une voiture. Pas besoin de comprendre le ML — si c'est rouge, il faut agir.

---

## SLIDE 8 — Étape 5 : Prédiction de la Durée de Vie Résiduelle (RUL)

**Titre : Combien de jours avant la panne ?**

### Random Forest — 300 arbres de décision

**Principe simple :** 300 "experts" (arbres) regardent chacun les données sous un angle différent. Chacun donne son estimation. On prend la moyenne → c'est la prédiction.

**Entrée : 17 indicateurs**
- Les 12 indicateurs capteurs (la "photo" de la machine maintenant)
- 5 statistiques sur la dernière heure : HI actuel, HI moyen, stabilité, minimum, **vitesse de dégradation**

La vitesse de dégradation est la plus importante : "la machine descend-elle vite ou lentement ?"

### Pourquoi Random Forest ?

| Méthode | Pourquoi on ne l'a pas choisie |
|---------|-------------------------------|
| **LSTM / Deep Learning** | Besoin de milliers de séquences. On en a 100. Surapprentissage garanti. |
| **Régression linéaire** | La dégradation n'est PAS linéaire (profils B, C, D). Trop simpliste. |
| **XGBoost** | Performance similaire (R²=0.984 vs 0.983), MAIS pas d'intervalle de confiance natif |
| **Réseau de neurones** | Boîte noire. Pas explicable. Pas d'intervalle de confiance. |

### L'avantage unique : les intervalles de confiance

Chacun des 300 arbres prédit indépendamment. Si les 300 disent "45 jours" → on est **très sûr**. Si certains disent "20 jours" et d'autres "80 jours" → grande **incertitude**.

On donne au technicien : **"RUL = 45 jours (entre 38 et 52 jours)"**

C'est comme un météo : "Il fera 25°C demain, **entre 23° et 27°**". Plus utile que juste "25°C".

---

## SLIDE 9 — Résultats sur nos données

**Titre : Est-ce que ça marche ?**

### Détection d'anomalies

L'ensemble hybride détecte les anomalies **15-30 minutes** avant qu'elles ne deviennent critiques.

### Prédiction RUL

| Métrique | Valeur | Signification |
|----------|--------|---------------|
| **RMSE** | 2.82 jours | Erreur moyenne de ± 3 jours |
| **MAE** | 1.43 jours | En moyenne, on se trompe de 1.4 jours |
| **R²** | 0.983 | Le modèle explique **98.3 %** de la réalité |

**Analogie :** Si la panne est prévue dans 45 jours, en réalité elle arrivera entre 42 et 48 jours. C'est largement suffisant pour planifier une intervention.

### Performance par profil de dégradation

| Profil | R² | Commentaire |
|--------|-----|------------|
| A (linéaire) | 0.993 | Très facile à prédire |
| B (exponentiel) | 0.997 | Excellent malgré l'accélération |
| C (par paliers) | 0.992 | Les chocs sont bien captés |
| D (bruité) | 0.906 | Plus difficile (normal — c'est bruité), mais reste > 90 % |

---

## SLIDE 10 — Validation NASA CMAPSS

**Titre : Et sur des données réelles ?**

### "Vos données sont simulées — est-ce que ça marche en vrai ?"

Pour répondre à cette question, on a testé **le même pipeline sans modification** sur un benchmark public de la NASA : **CMAPSS** (100 moteurs de turboréacteurs).

| Métrique | PrediTeq | Référence NASA | Résultat |
|----------|----------|----------------|----------|
| RMSE | **14.1 cycles** | 18.4 cycles | ✅ **-23 %** meilleur |
| MAE | **9.6 cycles** | 13.2 cycles | ✅ **-27 %** meilleur |
| R² | **0.886** | 0.87 | ✅ Meilleur |

**PrediTeq dépasse les cibles NASA sur les 3 métriques.**

Cela prouve que notre approche **généralise** : elle fonctionne sur des données complètement différentes (turboréacteurs vs ascenseurs), sans aucune modification du code.

---

## SLIDE 11 — Explicabilité (SHAP)

**Titre : Pourquoi le modèle a pris cette décision ?**

On utilise **SHAP** (SHapley Additive exPlanations) pour expliquer chaque prédiction.

**Analogie :** Quand le médecin dit "vous avez un risque cardiaque", vous voulez savoir POURQUOI. "Parce que votre cholestérol est élevé ET votre tension aussi." SHAP fait ça pour notre modèle.

### Top 3 des indicateurs les plus influents :

1. **Vitesse de dégradation** (hi_slope) — "la machine descend-elle vite ?"
2. **HI actuel** (hi_now) — "où en est-elle maintenant ?"
3. **Vibration RMS** — "est-ce qu'elle vibre beaucoup ?"

Le modèle a appris que **la vitesse de dégradation est plus importante que le niveau actuel**. C'est logique : une machine à 60 % qui descend lentement est moins urgente qu'une machine à 60 % qui descend vite.

---

## SLIDE 12 — Du ML au temps réel

**Titre : Comment ça tourne en production ?**

```
Capteur (1/seconde) → MQTT → Isolation Forest → Score Hybride → Indice de Santé
                                                                        ↓
                                                               Toutes les 60s :
                                                          Random Forest → RUL
                                                                        ↓
                                                         HI < 30% ? → Alerte !
                                                                     → Email
                                                                     → Tâche GMAO
                                                                     → Coût estimé
```

Chaque machine a **sa propre instance** du moteur ML en mémoire. Le traitement prend **< 1 ms** par lecture capteur → compatible avec le temps réel.

---

## SLIDE 13 — Résumé

**Titre : Pourquoi ce pipeline est le bon choix**

| Critère | Notre choix | Pourquoi |
|---------|------------|----------|
| **Données** | Simulation physique réaliste | Pas de capteurs encore, mais basé sur fiche technique réelle |
| **Anomalies** | Isolation Forest + RMS hybride | Non-supervisé (pas besoin de pannes), temps réel, F1=85% |
| **Santé** | HI 0-100% avec 4 zones | Compréhensible par un technicien |
| **Prédiction** | Random Forest (300 arbres) | R²=98.3%, intervalles de confiance, explicable |
| **Validation** | NASA CMAPSS | Bat les références sur un benchmark reconnu |
| **Explicabilité** | SHAP | Chaque prédiction est justifiable |

**Le pipeline complet fonctionne — de la donnée brute à l'alerte — en moins d'une seconde.**

---

*Notes : Les graphiques (courbes HI, scatter RUL, SHAP, heatmap) sont dans `prediteq_ml/outputs/plots/`. Les inclure dans les slides PowerPoint.*
