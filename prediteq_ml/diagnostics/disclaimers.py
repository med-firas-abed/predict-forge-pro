"""
diagnostics.disclaimers — Textes de transparence pour l'UI
═══════════════════════════════════════════════════════════════════════════════

Objectif (item 3 de la feuille de route améliorations) : afficher dans l'UI
la nature démonstrative du RUL et la procédure de recalibration prévue,
conformément à l'obligation de transparence imposée aux IA industrielles.

Base réglementaire :
    Règlement (UE) 2024/1689 du 13 juin 2024 (AI Act), Article 13 —
    « Transparency and provision of information to deployers ». Les systèmes
    d'IA à haut risque (maintenance prédictive industrielle incluse, Annexe III
    §4) doivent fournir à l'utilisateur une notice claire sur :
        - la finalité exacte du système ;
        - ses limites de performance et cas d'usage inappropriés ;
        - les données d'entraînement et leur représentativité.

Ce module ne contient QUE des constantes de texte. Il n'exécute aucun code.
Le frontend Next.js peut les importer via un endpoint API qui retourne ces
strings, ou les copier en dur dans les composants (ce qui évite de toucher
le backend pour l'instant — conforme à la consigne).

Utilisation recommandée côté frontend :
    import { RUL_NATURE, CALIBRATION_NOTICE } from '@/lib/disclaimers';
    <small className="text-gray-500">{RUL_NATURE}</small>
"""

# ──────────────────────────────────────────────────────────────────────────────
# Disclaimer principal — à afficher sous la carte « RUL ESTIMÉ »
# ──────────────────────────────────────────────────────────────────────────────
RUL_NATURE: str = (
    "Estimation démonstrative dérivée d'un Random Forest entraîné sur 200 "
    "trajectoires synthétiques (convention CMAPSS — Saxena & Goebel 2008). "
    "La conversion sim-min → jours utilise le rythme d'usage réel de la "
    "machine (moyenne 7 j glissants), avec fallback sur la convention "
    "800 min-sim ↔ 90 jours en l'absence de données. Aucun multiplicateur "
    "zone-conditionnel n'est appliqué : l'affichage reflète exactement la "
    "sortie modèle. Une recalibration empirique est prévue après 90 jours "
    "d'exploitation réelle sur la flotte Aroteq."
)

# ──────────────────────────────────────────────────────────────────────────────
# Info-bulle déclenchée par un « ? » à côté du chiffre RUL
# ──────────────────────────────────────────────────────────────────────────────
RUL_TOOLTIP: str = (
    "Comment lire cette valeur\n"
    "───────────────────────────\n"
    "Le Random Forest prédit la durée restante en minutes-simulation, puis "
    "elle est traduite en jours selon le rythme d'usage observé sur 7 j "
    "(facteur ÷9 par défaut si historique insuffisant — convention dataset).\n\n"
    "L'intervalle « 60–85 j » correspond aux percentiles 10 et 90 des "
    "prédictions individuelles des 300 arbres — zone où les 80 % d'arbres "
    "centraux convergent (Meinshausen 2006, Quantile Regression Forests).\n\n"
    "Aucun multiplicateur zone-conditionnel : si HI ≥ 0.80, le pronostic "
    "chiffré est masqué (FPT, IEEE 1856-2017 §6.2) et la durée de vie "
    "statistique du roulement (L10, ISO 281) est affichée à la place.\n\n"
    "Au-delà de l'intervalle, l'incertitude augmente. Pour une décision "
    "de maintenance critique, consulter la section Diagnostic qui identifie "
    "les causes probables sur la base des normes ISO 10816-3 et IEC 60034-1."
)

# ──────────────────────────────────────────────────────────────────────────────
# Badge de confiance — libellés et couleurs (aligné sur confidence_badge)
# ──────────────────────────────────────────────────────────────────────────────
BADGE_LABELS: dict[str, dict[str, str]] = {
    "high": {
        "label": "Fiable",
        "color_hex": "#16A34A",         # vert-600 Tailwind
        "icon": "✓",
        "tooltip": "L'incertitude relative est < 15 %. Les 300 arbres "
                   "convergent fortement vers cette estimation.",
    },
    "medium": {
        "label": "Modéré",
        "color_hex": "#CA8A04",         # jaune-600 Tailwind
        "icon": "~",
        "tooltip": "Incertitude relative entre 15 % et 30 %. Estimation "
                   "utilisable pour la planification mais à confirmer par "
                   "une inspection visuelle avant maintenance corrective.",
    },
    "low": {
        "label": "Faible",
        "color_hex": "#DC2626",         # rouge-600 Tailwind
        "icon": "!",
        "tooltip": "Incertitude > 30 %. Les arbres divergent fortement, "
                   "souvent par manque de données historiques comparables. "
                   "Validation humaine obligatoire avant toute décision.",
    },
}

# ──────────────────────────────────────────────────────────────────────────────
# Bandeau « Calibration en cours » — affiché tant que le site n'a pas 90 j
# d'historique réel (flag côté backend : `client.has_90_days_history = False`)
# ──────────────────────────────────────────────────────────────────────────────
CALIBRATION_NOTICE: str = (
    "Système en phase de calibration. Les estimations RUL s'affinent au fur "
    "et à mesure de l'acquisition de données réelles. Précision attendue à "
    "la fin de la phase (jour 90) : MAE ≈ 8–12 jours (cible IEEE 1856-2017)."
)

# ──────────────────────────────────────────────────────────────────────────────
# Texte pour la section « À propos du modèle » — page Administration
# ──────────────────────────────────────────────────────────────────────────────
MODEL_CARD: str = (
    "Modèle : Random Forest (Breiman 2001), 300 arbres, max_depth=12.\n"
    "Entraînement : 200 trajectoires synthétiques × 800 min-sim, split 80/20 "
    "par GroupKFold stratifié par profil (Kuhn & Johnson 2013 §4.2).\n"
    "Validation : métriques reportées dans outputs/rul_cv_scores.json.\n"
    "Limites connues :\n"
    "  • Convention temporelle 800 min-sim ↔ 90 j calendaires : hypothèse "
    "    d'affichage inspirée du benchmark NASA CMAPSS FD001, à recalibrer "
    "    empiriquement sur la flotte cliente.\n"
    "  • Profils de dégradation A/B/C/D : vitesses d'usure, PAS modes "
    "    physiques (roulement, balourd, bobinage). Le diagnostic de mode "
    "    relève des règles expertes (module diagnose.py).\n"
    "  • Dataset synthétique : le modèle n'a jamais vu de panne réelle de "
    "    moteur SITI FC100L1-4. Validation croisée NASA CMAPSS FD001 "
    "    (step6b_cmapss.py) confirme néanmoins la généralisation inter-"
    "    datasets."
)

# ──────────────────────────────────────────────────────────────────────────────
# Texte défense / rapport — à reprendre mot pour mot en section « Limites »
# ──────────────────────────────────────────────────────────────────────────────
DEFENSE_STATEMENT: str = (
    "Le RUL affiché en jours est démonstratif. Il est calibré sur des "
    "trajectoires synthétiques compressées, à l'image des benchmarks publics "
    "de référence (NASA CMAPSS FD001, FEMTO-ST PRONOSTIA). Un déploiement "
    "industriel chez Aroteq nécessite une phase de recalibration empirique "
    "sur 3 à 12 mois de données réelles avant utilisation opérationnelle "
    "critique. Cette limite est documentée et assumée : elle est inhérente "
    "à tout système d'IA pronostique n'ayant jamais observé de panne réelle "
    "du matériel qu'il supervise."
)


if __name__ == "__main__":
    # Aperçu des textes — exécuter avec `python -m prediteq_ml.diagnostics.disclaimers`
    print("═" * 78)
    print("APERÇU DES DISCLAIMERS — prediteq_ml.diagnostics.disclaimers")
    print("═" * 78)
    sections = [
        ("RUL_NATURE (sous la carte RUL ESTIMÉ)", RUL_NATURE),
        ("RUL_TOOLTIP (tooltip ?)", RUL_TOOLTIP),
        ("CALIBRATION_NOTICE (bandeau phase calibration)", CALIBRATION_NOTICE),
        ("MODEL_CARD (page Administration)", MODEL_CARD),
        ("DEFENSE_STATEMENT (rapport + soutenance)", DEFENSE_STATEMENT),
    ]
    for title, text in sections:
        print(f"\n▸ {title}\n" + "─" * 78)
        print(text)

    print("\n\n▸ BADGE_LABELS — 3 niveaux de confiance\n" + "─" * 78)
    for level, payload in BADGE_LABELS.items():
        print(f"  [{level.upper():6}] {payload['icon']} {payload['label']:8}"
              f"  couleur={payload['color_hex']}")
        print(f"           tooltip: {payload['tooltip']}")
