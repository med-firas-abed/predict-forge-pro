import { repairText } from "@/lib/repairText";

type Coordinates = { lat: number; lon: number };

type CoordinateCandidate = {
  lat: unknown;
  lon: unknown;
  region?: string | null;
  location?: string | null;
  machineId?: string | null;
  machineName?: string | null;
};

type LocationCenter = Coordinates & {
  aliases: string[];
};

export const AROTEQ_BEN_AROUS_COORDINATES: Coordinates = {
  lat: 36.7537,
  lon: 10.2189,
};

export const BIZERTE_SHOWCASE_COORDINATES: Coordinates = {
  lat: 37.2744,
  lon: 9.8739,
};

export const TUNISIA_CENTER_COORDINATES: Coordinates = {
  lat: 34.7615,
  lon: 9.6202,
};

export const TUNISIA_MAP_BOUNDS = {
  north: 37.6,
  south: 30.1,
  east: 11.7,
  west: 7.4,
};

const TUNISIAN_LOCATION_CENTERS: LocationCenter[] = [
  { lat: 36.8065, lon: 10.1815, aliases: ["tunis", "lac 1", "lac 2", "centre ville", "charguia"] },
  { lat: 36.8665, lon: 10.1647, aliases: ["ariana", "ennasr", "soukra", "raoued"] },
  {
    lat: AROTEQ_BEN_AROUS_COORDINATES.lat,
    lon: AROTEQ_BEN_AROUS_COORDINATES.lon,
    aliases: [
      "ben arous",
      "megrine",
      "rades",
      "mornag",
      "el mourouj",
      "hammam lif",
      "hammam chatt",
      "ezzahra",
      "boumhel",
      "borj cedria",
    ],
  },
  { lat: 36.809, lon: 10.0956, aliases: ["manouba", "denden", "douar hicher", "oued ellil"] },
  {
    lat: BIZERTE_SHOWCASE_COORDINATES.lat,
    lon: BIZERTE_SHOWCASE_COORDINATES.lon,
    aliases: ["bizerte", "mateur", "menzel bourguiba"],
  },
  { lat: 36.7333, lon: 9.1833, aliases: ["beja", "testour", "medjez el bab"] },
  { lat: 36.5011, lon: 8.7802, aliases: ["jendouba", "tabarka", "ain draham"] },
  { lat: 36.1742, lon: 8.7049, aliases: ["kef", "le kef", "tajerouine"] },
  { lat: 36.0849, lon: 9.3708, aliases: ["siliana", "makthar", "rouhia"] },
  { lat: 36.4029, lon: 10.1429, aliases: ["zaghouan", "el fahs", "zriba"] },
  { lat: 36.4561, lon: 10.7376, aliases: ["nabeul", "hammamet", "kelibia", "korba", "soliman"] },
  { lat: 35.8256, lon: 10.6369, aliases: ["sousse", "akouda", "msaken", "kalaa kebira"] },
  { lat: 35.7643, lon: 10.8113, aliases: ["monastir", "moknine", "ksar hellal", "jemmal"] },
  { lat: 35.5047, lon: 11.0622, aliases: ["mahdia", "ksour essef", "chebba"] },
  { lat: 34.7398, lon: 10.76, aliases: ["sfax", "sakiet ezzit", "sakiet eddaier", "thyna"] },
  { lat: 35.6781, lon: 10.0963, aliases: ["kairouan", "sbikha", "hajeb el ayoun"] },
  { lat: 35.1676, lon: 8.8365, aliases: ["kasserine", "sbeitla", "feriana"] },
  { lat: 35.0382, lon: 9.4849, aliases: ["sidi bouzid", "meknassy", "regueb"] },
  { lat: 34.425, lon: 8.7842, aliases: ["gafsa", "metlaoui", "moulares"] },
  { lat: 33.9197, lon: 8.1335, aliases: ["tozeur", "nefta", "degache"] },
  { lat: 33.705, lon: 8.969, aliases: ["kebili", "douz", "souk lahad"] },
  { lat: 33.8815, lon: 10.0982, aliases: ["gabes", "ghannouche", "mareth"] },
  { lat: 33.3549, lon: 10.5055, aliases: ["medenine", "zarzis", "ben gardane", "djerba"] },
  { lat: 32.9297, lon: 10.4518, aliases: ["tataouine", "remeada", "dehiba"] },
];

const MACHINE_COORDINATE_OVERRIDES: LocationCenter[] = [
  {
    lat: AROTEQ_BEN_AROUS_COORDINATES.lat,
    lon: AROTEQ_BEN_AROUS_COORDINATES.lon,
    aliases: ["aro 01", "aro-01", "machine reelle", "machine aroteq", "aroteq", "usine aroteq"],
  },
  {
    lat: BIZERTE_SHOWCASE_COORDINATES.lat,
    lon: BIZERTE_SHOWCASE_COORDINATES.lon,
    aliases: ["asc a1", "asc-a1", "machine 1", "site nord bizerte"],
  },
];

function parseCoordinate(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSearchText(...parts: Array<string | null | undefined>) {
  return parts
    .map((part) => repairText(part ?? ""))
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findBestLocationMatch(searchText: string, centers: LocationCenter[]) {
  let bestMatch: { center: LocationCenter; aliasLength: number } | null = null;

  for (const center of centers) {
    for (const alias of center.aliases) {
      const normalizedAlias = normalizeSearchText(alias);
      if (!normalizedAlias || !searchText.includes(normalizedAlias)) {
        continue;
      }

      if (!bestMatch || normalizedAlias.length > bestMatch.aliasLength) {
        bestMatch = { center, aliasLength: normalizedAlias.length };
      }
    }
  }

  return bestMatch?.center ?? null;
}

function findMachineCoordinateOverride(searchText: string) {
  return findBestLocationMatch(searchText, MACHINE_COORDINATE_OVERRIDES);
}

function findLocationCenter(searchText: string) {
  return findBestLocationMatch(searchText, TUNISIAN_LOCATION_CENTERS);
}

export function isValidTunisiaCoordinate(lat: unknown, lon: unknown): boolean {
  const parsedLat = parseCoordinate(lat);
  const parsedLon = parseCoordinate(lon);

  if (parsedLat == null || parsedLon == null) {
    return false;
  }

  return (
    parsedLat >= TUNISIA_MAP_BOUNDS.south &&
    parsedLat <= TUNISIA_MAP_BOUNDS.north &&
    parsedLon >= TUNISIA_MAP_BOUNDS.west &&
    parsedLon <= TUNISIA_MAP_BOUNDS.east
  );
}

export function resolveMachineCoordinates({
  lat,
  lon,
  region,
  location,
  machineId,
  machineName,
}: CoordinateCandidate): Coordinates {
  const searchText = normalizeSearchText(machineId ?? "", machineName ?? "", region, location);
  const coordinateOverride = findMachineCoordinateOverride(searchText);

  if (coordinateOverride) {
    return {
      lat: coordinateOverride.lat,
      lon: coordinateOverride.lon,
    };
  }

  if (isValidTunisiaCoordinate(lat, lon)) {
    return {
      lat: Number(lat),
      lon: Number(lon),
    };
  }

  const locationCenter = findLocationCenter(searchText);

  if (!locationCenter) {
    return TUNISIA_CENTER_COORDINATES;
  }

  return {
    lat: locationCenter.lat,
    lon: locationCenter.lon,
  };
}
