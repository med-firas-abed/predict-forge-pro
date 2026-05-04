const SUSPECT_ENCODING_PATTERN = /[ÃÂâØÙÏÐŸ™Åð�]/;

const utf8Decoder = new TextDecoder("utf-8");

const FRENCH_PHRASE_REPLACEMENTS: Array<[RegExp, string]> = [
  [
    /ne montrent pas de d[ée]rive d[ée]fendable/gi,
    "ne montrent pas de dérive nette",
  ],
  [
    /aucun signe precurseur fort de degradation rapide n'est observe/gi,
    "aucun signe précurseur fort de dégradation rapide n'est observé",
  ],
  [/source simulator_demo/gi, "source replay démo"],
  [/source live_runtime/gi, "source flux en direct"],
  [/source persisted_reference/gi, "source référence persistée"],
  [/source no_data/gi, "source aucun flux récent"],
  [/tache\(s\) deja ouverte\(s\)/gi, "tâche(s) déjà ouverte(s)"],
  [/aucun rapport sauvegarde pour le moment/gi, "aucun rapport sauvegardé pour le moment"],
  [/rapport genere/gi, "rapport généré"],
  [/pdf telecharge/gi, "PDF téléchargé"],
  [/erreur lors de la generation du rapport/gi, "erreur lors de la génération du rapport"],
  [/erreur lors du telechargement/gi, "erreur lors du téléchargement"],
  [/agent ia separe/gi, "agent IA séparé"],
];

const FRENCH_WORD_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bA surveiller\b/g, "À surveiller"],
  [/\bA planifier\b/g, "À planifier"],
  [/\bDeconnexion\b/g, "Déconnexion"],
  [/\bdeconnexion\b/g, "déconnexion"],
  [/\bOperationnel\b/g, "Opérationnel"],
  [/\boperationnel\b/g, "opérationnel"],
  [/\bPrecurseur\b/g, "Précurseur"],
  [/\bprecurseur\b/g, "précurseur"],
  [/\bDegradation\b/g, "Dégradation"],
  [/\bdegradation\b/g, "dégradation"],
  [/\bRecents\b/g, "Récents"],
  [/\brecents\b/g, "récents"],
  [/\bDerive\b/g, "Dérive"],
  [/\bderive\b/g, "dérive"],
  [/\bCote\b/g, "Côté"],
  [/\bcote\b/g, "côté"],
  [/\bVariabilite\b/g, "Variabilité"],
  [/\bvariabilite\b/g, "variabilité"],
  [/\bReference\b/g, "Référence"],
  [/\breference\b/g, "référence"],
  [/\bDerniere\b/g, "Dernière"],
  [/\bderniere\b/g, "dernière"],
  [/\bVerifier\b/g, "Vérifier"],
  [/\bverifier\b/g, "vérifier"],
  [/\bControler\b/g, "Contrôler"],
  [/\bcontroler\b/g, "contrôler"],
  [/\bRegularite\b/g, "Régularité"],
  [/\bregularite\b/g, "régularité"],
  [/\bRegime\b/g, "Régime"],
  [/\bregime\b/g, "régime"],
  [/\bIncoherente\b/g, "Incohérente"],
  [/\bincoherente\b/g, "incohérente"],
  [/\bIncoherentes\b/g, "Incohérentes"],
  [/\bincoherentes\b/g, "incohérentes"],
  [/\bTache\b/g, "Tâche"],
  [/\btache\b/g, "tâche"],
  [/\bTaches\b/g, "Tâches"],
  [/\btaches\b/g, "tâches"],
  [/\bCout\b/g, "Coût"],
  [/\bcout\b/g, "coût"],
  [/\bDeja\b/g, "Déjà"],
  [/\bdeja\b/g, "déjà"],
  [/\bFenetre\b/g, "Fenêtre"],
  [/\bfenetre\b/g, "fenêtre"],
  [/\bGeolocalisation\b/g, "Géolocalisation"],
  [/\bgeolocalisation\b/g, "géolocalisation"],
  [/\bExperience\b/g, "Expérience"],
  [/\bexperience\b/g, "expérience"],
  [/\bSysteme\b/g, "Système"],
  [/\bsysteme\b/g, "système"],
  [/\bPeriode\b/g, "Période"],
  [/\bperiode\b/g, "période"],
  [/\bSelectionnez\b/g, "Sélectionnez"],
  [/\bselectionnez\b/g, "sélectionnez"],
  [/\bSelectionnee\b/g, "Sélectionnée"],
  [/\bselectionnee\b/g, "sélectionnée"],
  [/\bGenerer\b/g, "Générer"],
  [/\bgenerer\b/g, "générer"],
  [/\bGeneration\b/g, "Génération"],
  [/\bgeneration\b/g, "génération"],
  [/\bGenere\b/g, "Généré"],
  [/\bgenere\b/g, "généré"],
  [/\bSepare\b/g, "Séparé"],
  [/\bsepare\b/g, "séparé"],
  [/\bTelechargement\b/g, "Téléchargement"],
  [/\btelechargement\b/g, "téléchargement"],
  [/\bTelecharge\b/g, "Téléchargé"],
  [/\btelecharge\b/g, "téléchargé"],
  [/\bCreer\b/g, "Créer"],
  [/\bcreer\b/g, "créer"],
  [/\bCree\b/g, "Créé"],
  [/\bcree\b/g, "créé"],
  [/\bDecroissante\b/g, "Décroissante"],
  [/\bdecroissante\b/g, "décroissante"],
  [/\bHaussiere\b/g, "Haussière"],
  [/\bhaussiere\b/g, "haussière"],
  [/\bEvolution\b/g, "Évolution"],
  [/\bevolution\b/g, "évolution"],
  [/\bModele\b/g, "Modèle"],
  [/\bmodele\b/g, "modèle"],
  [/\bResume\b/g, "Résumé"],
  [/\bresume\b/g, "résumé"],
];

function decodeLatin1AsUtf8(value: string) {
  const bytes = Uint8Array.from(Array.from(value, (char) => char.charCodeAt(0) & 0xff));
  return utf8Decoder.decode(bytes);
}

function getTextQualityScore(value: string) {
  const suspectCount = (value.match(/[ÃÂâØÙÏÐŸ™Åð�]/g) ?? []).length;
  const accentCount = (value.match(/[À-ÿ\u0600-\u06ff]/g) ?? []).length;
  return accentCount - suspectCount * 4;
}

function normalizeFrenchUiText(value: string) {
  let normalized = value;

  for (const [pattern, replacement] of FRENCH_PHRASE_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  for (const [pattern, replacement] of FRENCH_WORD_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized;
}

export function repairText(value: string | null | undefined) {
  if (typeof value !== "string" || value.length === 0) {
    return value ?? "";
  }

  let repaired = value;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!SUSPECT_ENCODING_PATTERN.test(repaired)) {
      break;
    }

    const decoded = decodeLatin1AsUtf8(repaired);
    if (getTextQualityScore(decoded) < getTextQualityScore(repaired)) {
      break;
    }
    repaired = decoded;
  }

  return normalizeFrenchUiText(
    repaired.replace(/\u00a0/g, " ").replace(/\uFFFD/g, ""),
  );
}

export function repairTextDeep<T>(value: T): T {
  if (typeof value === "string") {
    return repairText(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => repairTextDeep(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        repairTextDeep(item),
      ]),
    ) as T;
  }

  return value;
}
