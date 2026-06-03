import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Map, Satellite, Sparkles } from "lucide-react";
import { STATUS_CONFIG, type Machine } from "@/data/machines";
import { useApp } from "@/contexts/AppContext";
import { useMachines } from "@/hooks/useMachines";
import type { PredictiveInsight } from "@/hooks/useFleetPredictiveInsights";
import {
  getGoogleMapsMapId,
  hasGoogleMapsApiKey,
  loadGoogleMapsApi,
  type GoogleMapsApi,
  type GoogleMapsInfoWindowInstance,
  type GoogleMapsMapInstance,
  type GoogleMapsMapOptions,
  type GoogleMapsMarkerInstance,
} from "@/lib/googleMapsLoader";
import { getMachinePublicLabel } from "@/lib/machinePresentation";
import {
  TUNISIA_CENTER_COORDINATES,
  TUNISIA_MAP_BOUNDS,
  isValidTunisiaCoordinate,
} from "@/lib/machineGeo";
import { repairText } from "@/lib/repairText";

type MapMode = "status" | "predictive";
type TileMode = "roadmap" | "satellite";
type MapProviderPreference = "auto" | "leaflet";
type LocalizeText = (fr: string, en: string, ar: string) => string;

interface IndustrialMapProps {
  mode?: MapMode;
  machines?: Machine[];
  machineScopeId?: string;
  predictiveInsights?: Record<string, PredictiveInsight>;
  heightClass?: string;
  focusedMachineId?: string;
  onMachineSelect?: (machineId: string) => void;
  providerPreference?: MapProviderPreference;
}

interface IndustrialMapCanvasProps {
  mode: MapMode;
  machines: Machine[];
  predictiveInsights: Record<string, PredictiveInsight>;
  heightClass: string;
  focusedMachineId?: string;
  onMachineSelect?: (machineId: string) => void;
  tileMode: TileMode;
  lang: string;
  l: LocalizeText;
}

const DEFAULT_TUNISIA_ZOOM = 6.5;
const FLEET_OVERVIEW_MAX_ZOOM = 8.25;
const MACHINE_FOCUS_MAX_ZOOM = 16.25;
const MACHINE_FOCUS_RADIUS_METERS = 3200;
const MACHINE_FOCUS_DURATION_S = 0.45;
const FLEET_BOUNDS_PADDING = 56;
const LEAFLET_FOCUS_PADDING = 88;
const GOOGLE_FOCUS_PADDING = { top: 88, right: 88, bottom: 88, left: 88 } as const;
const LEAFLET_WHEEL_PX_PER_ZOOM_LEVEL = 40;
const LEAFLET_WHEEL_DEBOUNCE_MS = 16;
const LEAFLET_TILE_UPDATE_INTERVAL_MS = 100;
const LEAFLET_TILE_KEEP_BUFFER = 6;

function escapeHTML(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function makePinMarkup(hex: string, highlighted: boolean) {
  const halo = highlighted
    ? `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:52px;height:52px;border-radius:999px;background:${hex}22;border:2px solid ${hex}55;pointer-events:none;"></div>`
    : "";

  return `<div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;">
    ${halo}
    <div style="width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;background:${hex};box-shadow:0 6px 18px rgba(15,23,42,0.28);border:2px solid rgba(255,255,255,0.92);">
      <div style="width:12px;height:12px;background:#fff;border-radius:999px;transform:rotate(45deg);"></div>
    </div>
    <div style="width:12px;height:4px;background:rgba(15,23,42,0.16);border-radius:999px;margin-top:2px;"></div>
  </div>`;
}

function makeLeafletPinIcon(hex: string, highlighted: boolean) {
  return L.divIcon({
    html: makePinMarkup(hex, highlighted),
    className: "",
    iconSize: [34, 40],
    iconAnchor: [17, 40],
    popupAnchor: [0, -40],
  });
}

function makeGooglePinIcon(googleMaps: GoogleMapsApi, hex: string, highlighted: boolean) {
  const width = highlighted ? 54 : 42;
  const height = highlighted ? 62 : 50;
  const halo = highlighted
    ? `<circle cx="${width / 2}" cy="${width / 2 - 1}" r="${width / 2 - 5}" fill="${hex}" fill-opacity="0.12" stroke="${hex}" stroke-opacity="0.28" stroke-width="2" />`
    : "";

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <filter id="prediteq-pin-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#0f172a" flood-opacity="0.22" />
        </filter>
      </defs>
      ${halo}
      <g filter="url(#prediteq-pin-shadow)" transform="translate(${(width - 34) / 2}, ${highlighted ? 8 : 10})">
        <path d="M17 0C7.611 0 0 7.611 0 17c0 12.75 17 26 17 26s17-13.25 17-26C34 7.611 26.389 0 17 0Z" fill="${hex}" stroke="rgba(255,255,255,0.92)" stroke-width="2" />
        <circle cx="17" cy="17" r="6.5" fill="#ffffff" />
      </g>
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new googleMaps.Size(width, height),
    anchor: new googleMaps.Point(width / 2, height - 4),
  };
}

function getPredictiveMapMeta(predictiveInsight?: PredictiveInsight | null) {
  if (!predictiveInsight) {
    return { key: "stable", hex: "#10b981" };
  }

  if (predictiveInsight.urgencyBand === "critical") {
    return { key: "urgent", hex: "#f43f5e" };
  }

  if (predictiveInsight.urgencyBand === "priority" || predictiveInsight.urgencyBand === "watch") {
    return { key: "surveillance", hex: "#f59e0b" };
  }

  return { key: "stable", hex: "#10b981" };
}

function getStatusLabel(machine: Machine, localize: LocalizeText) {
  if (machine.status === "ok") {
    return localize("Opérationnel", "Operational", "تشغيلي");
  }
  if (machine.status === "degraded") {
    return localize("Surveillance", "Monitoring", "مراقبة");
  }
  if (machine.status === "critical") {
    return localize("Critique", "Critical", "حرج");
  }
  return localize("Maintenance", "Maintenance", "صيانة");
}

function makePopupHTML(
  machine: Machine,
  mode: MapMode,
  predictiveInsight: PredictiveInsight | undefined,
  localize: LocalizeText,
) {
  const statusConfig = STATUS_CONFIG[machine.status];
  const predictiveMeta = getPredictiveMapMeta(predictiveInsight);
  const accentHex = mode === "predictive" && predictiveInsight ? predictiveMeta.hex : statusConfig.hex;
  const hiPct = typeof machine.hi === "number" ? Math.round(machine.hi * 100) : null;

  const decisionBlock =
    mode === "predictive" && predictiveInsight
      ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 11px;margin-bottom:10px;">
          <div style="font-size:.55rem;color:#64748b;letter-spacing:1.4px;text-transform:uppercase;font-family:'JetBrains Mono',monospace;font-weight:600;">${escapeHTML(localize("Priorité prédictive", "Predictive priority", "الأولوية التنبؤية"))}</div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:4px;">
            <div style="font-size:.82rem;font-weight:700;color:${accentHex};">${escapeHTML(predictiveInsight.urgencyLabel)}</div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:.95rem;font-weight:700;color:${accentHex};">${predictiveInsight.urgencyScore}</div>
          </div>
          <div style="font-size:.72rem;color:#334155;line-height:1.45;margin-top:6px;">${escapeHTML(predictiveInsight.summary)}</div>
          ${
            predictiveInsight.maintenanceWindow
              ? `<div style="font-size:.66rem;color:#64748b;margin-top:6px;">${escapeHTML(predictiveInsight.maintenanceWindow)}</div>`
              : ""
          }
        </div>`
      : "";

  const rulValue =
    machine.rulMode === "reference_only"
      ? `Ref. ${machine.referenceLifetimeYears ?? "-"} ${localize("a", "y", "س")}`
      : machine.rul != null
        ? `${machine.rul} ${localize("j", "d", "ي")}`
        : machine.rulReferenceDays != null
          ? `~${machine.rulReferenceDays} ${localize("j", "d", "ي")}`
          : localize("Initialisation RUL", "RUL warm-up", "تهيئة العمر المتبقي");

  const rulSub =
    machine.rulMode === "reference_only"
      ? localize("Référence stable de durée de vie", "Stable lifetime reference", "مرجع عمر تشغيلي ثابت")
      : machine.rulIntervalLow != null && machine.rulIntervalHigh != null
        ? `${machine.rulIntervalLabel ?? "Plage probable (80 %)"} ${machine.rulIntervalLow}-${machine.rulIntervalHigh} ${localize("j", "d", "ي")}`
        : machine.rulci != null
          ? `+/- ${machine.rulci} ${localize("j", "d", "ي")}`
          : localize("Sans intervalle", "No interval", "بدون مجال");

  return `<div style="font-family:Inter,system-ui,sans-serif;overflow:hidden;border-radius:16px;min-width:290px;">
    <div style="background:linear-gradient(135deg, ${accentHex}, ${accentHex}cc);padding:14px 16px 12px;">
      <div style="font-size:.96rem;font-weight:700;color:#fff;">${escapeHTML(getMachinePublicLabel(machine))}</div>
      <div style="font-size:.74rem;color:rgba(255,255,255,.85);margin-top:2px;">${escapeHTML(machine.city || machine.loc)}</div>
    </div>
    <div style="padding:14px 16px;background:#fff;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-size:.58rem;color:#64748b;letter-spacing:1.8px;text-transform:uppercase;font-family:'JetBrains Mono',monospace;font-weight:600;">Indice de santé (HI)</span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:.86rem;font-weight:700;color:${accentHex};">${hiPct != null ? `${hiPct}%` : "—"}</span>
      </div>
      <div style="height:6px;background:#e2e8f0;border-radius:999px;margin-bottom:12px;overflow:hidden;">
        <div style="height:100%;width:${hiPct ?? 0}%;border-radius:999px;background:${accentHex};"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 11px;">
          <div style="font-size:.55rem;color:#64748b;letter-spacing:1.4px;text-transform:uppercase;font-family:'JetBrains Mono',monospace;font-weight:600;">RUL</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:1.05rem;font-weight:700;color:${accentHex};margin-top:3px;">${escapeHTML(rulValue)}</div>
          <div style="font-size:.65rem;color:#64748b;margin-top:3px;">${escapeHTML(rulSub)}</div>
        </div>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 11px;">
          <div style="font-size:.55rem;color:#64748b;letter-spacing:1.4px;text-transform:uppercase;font-family:'JetBrains Mono',monospace;font-weight:600;">${escapeHTML(localize("Statut", "Status", "الحالة"))}</div>
          <div style="font-size:.8rem;font-weight:700;color:${statusConfig.hex};margin-top:3px;">${escapeHTML(getStatusLabel(machine, localize))}</div>
          <div style="font-size:.65rem;color:#64748b;margin-top:3px;">${escapeHTML(machine.last)}</div>
        </div>
      </div>
      ${decisionBlock}
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;">
        <div style="font-size:.64rem;color:#64748b;">${escapeHTML(localize("Coordonnées", "Coordinates", "الإحداثيات"))}: ${machine.lat.toFixed(3)}, ${machine.lon.toFixed(3)}</div>
        <a href="https://www.google.com/maps?q=${machine.lat},${machine.lon}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:4px;font-size:.66rem;font-weight:600;color:#fff;background:#4285F4;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;text-decoration:none;">
          ${escapeHTML(localize("Ouvrir Google Maps", "Open Google Maps", "افتح خرائط جوجل"))}
        </a>
      </div>
    </div>
  </div>`;
}

function getLeafletMachineFocusBounds(lat: number, lon: number) {
  return L.latLng(lat, lon).toBounds(MACHINE_FOCUS_RADIUS_METERS * 2);
}

function resolveGoogleMapTypeId(googleMaps: GoogleMapsApi, tileMode: TileMode) {
  return tileMode === "satellite" ? googleMaps.MapTypeId.HYBRID : googleMaps.MapTypeId.ROADMAP;
}

function clampGoogleMapZoom(map: GoogleMapsMapInstance, zoom: number) {
  const currentZoom = Number(map.getZoom?.() ?? 0);
  if (currentZoom > zoom) {
    map.setZoom(zoom);
  }
}

function focusLeafletMapOnMachine(map: L.Map, lat: number, lon: number) {
  map.stop();
  map.flyToBounds(getLeafletMachineFocusBounds(lat, lon), {
    animate: true,
    duration: MACHINE_FOCUS_DURATION_S,
    easeLinearity: 0.25,
    padding: [LEAFLET_FOCUS_PADDING, LEAFLET_FOCUS_PADDING],
    maxZoom: MACHINE_FOCUS_MAX_ZOOM,
  });
}

function focusGoogleMapOnMachine(
  map: GoogleMapsMapInstance,
  googleMaps: GoogleMapsApi,
  lat: number,
  lon: number,
) {
  const bounds = new googleMaps.Circle({
    center: { lat, lng: lon },
    radius: MACHINE_FOCUS_RADIUS_METERS,
  }).getBounds?.();

  if (!bounds) {
    map.setCenter({ lat, lng: lon });
    clampGoogleMapZoom(map, MACHINE_FOCUS_MAX_ZOOM);
    return;
  }

  googleMaps.event.addListenerOnce(map, "idle", () => {
    clampGoogleMapZoom(map, MACHINE_FOCUS_MAX_ZOOM);
  });

  map.fitBounds(bounds, GOOGLE_FOCUS_PADDING);
}

function openGoogleMachinePopup(
  map: GoogleMapsMapInstance,
  infoWindow: GoogleMapsInfoWindowInstance,
  marker: GoogleMapsMarkerInstance,
  machine: Machine,
  mode: MapMode,
  predictiveInsight: PredictiveInsight | undefined,
  l: LocalizeText,
) {
  if (!infoWindow) {
    return;
  }

  infoWindow.setContent(makePopupHTML(machine, mode, predictiveInsight, l));
  infoWindow.open({
    map,
    anchor: marker,
    shouldFocus: false,
  });
}

function LeafletIndustrialMapCanvas({
  mode,
  machines,
  predictiveInsights,
  heightClass,
  focusedMachineId,
  onMachineSelect,
  tileMode,
  lang,
  l,
}: IndustrialMapCanvasProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const markerByIdRef = useRef<Record<string, L.Marker>>({});
  const hasFittedBoundsRef = useRef(false);
  const lastMarkerSignatureRef = useRef("");
  const focusedMachine = useMemo(
    () => (focusedMachineId ? machines.find((entry) => entry.id === focusedMachineId) ?? null : null),
    [focusedMachineId, machines],
  );
  const focusedMachineLat = focusedMachine?.lat ?? null;
  const focusedMachineLon = focusedMachine?.lon ?? null;

  useEffect(() => {
    if (!mapElementRef.current || mapInstanceRef.current) {
      return;
    }

    const tunisiaBounds = L.latLngBounds(
      [TUNISIA_MAP_BOUNDS.south, TUNISIA_MAP_BOUNDS.west],
      [TUNISIA_MAP_BOUNDS.north, TUNISIA_MAP_BOUNDS.east],
    );

    const map = L.map(mapElementRef.current, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: true,
      zoomSnap: 0,
      zoomDelta: 1,
      wheelDebounceTime: LEAFLET_WHEEL_DEBOUNCE_MS,
      wheelPxPerZoomLevel: LEAFLET_WHEEL_PX_PER_ZOOM_LEVEL,
      zoomAnimation: true,
      zoomAnimationThreshold: 16,
      fadeAnimation: true,
      markerZoomAnimation: true,
      minZoom: 6,
      maxBounds: tunisiaBounds.pad(0.05),
      maxBoundsViscosity: 1,
    });

    map.setView([TUNISIA_CENTER_COORDINATES.lat, TUNISIA_CENTER_COORDINATES.lon], DEFAULT_TUNISIA_ZOOM);
    mapInstanceRef.current = map;
    markerLayerRef.current = L.layerGroup().addTo(map);
    L.control.zoom({ position: "topleft" }).addTo(map);
    requestAnimationFrame(() => map.invalidateSize());

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
      markerLayerRef.current = null;
      markerByIdRef.current = {};
      hasFittedBoundsRef.current = false;
      lastMarkerSignatureRef.current = "";
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) {
      return;
    }

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    tileLayerRef.current = L.tileLayer(
      tileMode === "roadmap"
        ? `https://{s}.google.com/vt/lyrs=m&hl=${lang === "en" ? "en" : "fr"}&gl=TN&scale=2&x={x}&y={y}&z={z}`
        : `https://{s}.google.com/vt/lyrs=y&hl=${lang === "en" ? "en" : "fr"}&gl=TN&scale=2&x={x}&y={y}&z={z}`,
      {
        maxZoom: 20,
        subdomains: ["mt0", "mt1", "mt2", "mt3"],
        detectRetina: true,
        updateWhenZooming: true,
        updateInterval: LEAFLET_TILE_UPDATE_INTERVAL_MS,
        keepBuffer: LEAFLET_TILE_KEEP_BUFFER,
      },
    ).addTo(map);
  }, [lang, tileMode]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const markerLayer = markerLayerRef.current;
    if (!map || !markerLayer) {
      return;
    }

    markerLayer.clearLayers();
    markerByIdRef.current = {};
    const markerPositions: L.LatLng[] = [];
    const markerSignatureParts: string[] = [];

    machines.forEach((machine) => {
      if (!isValidTunisiaCoordinate(machine.lat, machine.lon)) {
        return;
      }

      const predictiveInsight = predictiveInsights[machine.id];
      const predictiveMeta = getPredictiveMapMeta(predictiveInsight);
      const pinHex =
        mode === "predictive" && predictiveInsight ? predictiveMeta.hex : STATUS_CONFIG[machine.status].hex;
      const isHighlighted =
        machine.id === focusedMachineId ||
        (mode === "predictive" &&
          Boolean(predictiveInsight?.stopRecommended || predictiveInsight?.urgencyBand === "critical"));

      const marker = L.marker([machine.lat, machine.lon], {
        icon: makeLeafletPinIcon(pinHex, isHighlighted),
      }).bindPopup(makePopupHTML(machine, mode, predictiveInsight, l), {
        maxWidth: 340,
        className: "pl-popup",
        closeButton: true,
      });

      marker.on("click", () => onMachineSelect?.(machine.id));
      marker.addTo(markerLayer);
      markerByIdRef.current[machine.id] = marker;
      markerPositions.push(L.latLng(machine.lat, machine.lon));
      markerSignatureParts.push(`${machine.id}:${machine.lat.toFixed(4)}:${machine.lon.toFixed(4)}`);
    });

    const markerSignature = markerSignatureParts.sort().join("|");
    const shouldFit = !hasFittedBoundsRef.current || lastMarkerSignatureRef.current !== markerSignature;

    if (shouldFit) {
      if (markerPositions.length > 1) {
        map.fitBounds(L.latLngBounds(markerPositions), {
          padding: [FLEET_BOUNDS_PADDING, FLEET_BOUNDS_PADDING],
          maxZoom: FLEET_OVERVIEW_MAX_ZOOM,
        });
      } else if (markerPositions.length === 1) {
        map.fitBounds(getLeafletMachineFocusBounds(markerPositions[0].lat, markerPositions[0].lng), {
          padding: [LEAFLET_FOCUS_PADDING, LEAFLET_FOCUS_PADDING],
          maxZoom: MACHINE_FOCUS_MAX_ZOOM,
        });
      } else {
        map.setView([TUNISIA_CENTER_COORDINATES.lat, TUNISIA_CENTER_COORDINATES.lon], DEFAULT_TUNISIA_ZOOM);
      }

      hasFittedBoundsRef.current = true;
      lastMarkerSignatureRef.current = markerSignature;
    }

    if (focusedMachineId) {
      markerByIdRef.current[focusedMachineId]?.openPopup();
    }
  }, [focusedMachineId, l, machines, mode, onMachineSelect, predictiveInsights]);

  useEffect(() => {
    if (!focusedMachineId || focusedMachineLat == null || focusedMachineLon == null) {
      return;
    }

    const map = mapInstanceRef.current;
    const marker = markerByIdRef.current[focusedMachineId];

    if (!map || !marker) {
      return;
    }

    focusLeafletMapOnMachine(map, focusedMachineLat, focusedMachineLon);
    marker.openPopup();
  }, [focusedMachineId, focusedMachineLat, focusedMachineLon]);

  return <div ref={mapElementRef} className={`w-full ${heightClass}`} />;
}

function GoogleIndustrialMapCanvas({
  mode,
  machines,
  predictiveInsights,
  heightClass,
  focusedMachineId,
  onMachineSelect,
  tileMode,
  lang,
  l,
  onGoogleUnavailable,
}: IndustrialMapCanvasProps & { onGoogleUnavailable: (reason?: string) => void }) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const googleMapsRef = useRef<GoogleMapsApi | null>(null);
  const mapInstanceRef = useRef<GoogleMapsMapInstance | null>(null);
  const infoWindowRef = useRef<GoogleMapsInfoWindowInstance | null>(null);
  const markerByIdRef = useRef<Record<string, GoogleMapsMarkerInstance>>({});
  const hasFittedBoundsRef = useRef(false);
  const lastMarkerSignatureRef = useRef("");
  const initialLangRef = useRef(lang);
  const initialTileModeRef = useRef(tileMode);
  const focusedMachine = useMemo(
    () => (focusedMachineId ? machines.find((entry) => entry.id === focusedMachineId) ?? null : null),
    [focusedMachineId, machines],
  );
  const focusedMachineLat = focusedMachine?.lat ?? null;
  const focusedMachineLon = focusedMachine?.lon ?? null;

  useEffect(() => {
    let cancelled = false;

    if (!mapElementRef.current || mapInstanceRef.current) {
      return;
    }

    loadGoogleMapsApi(initialLangRef.current)
      .then((googleMaps) => {
        if (cancelled || !mapElementRef.current) {
          return;
        }

        googleMapsRef.current = googleMaps;

        const mapOptions: GoogleMapsMapOptions = {
          center: {
            lat: TUNISIA_CENTER_COORDINATES.lat,
            lng: TUNISIA_CENTER_COORDINATES.lon,
          },
          zoom: DEFAULT_TUNISIA_ZOOM,
          minZoom: 6,
          maxZoom: 20,
          gestureHandling: "greedy",
          scrollwheel: true,
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: true,
          keyboardShortcuts: true,
          backgroundColor: "#e5e3df",
          mapTypeId: resolveGoogleMapTypeId(googleMaps, initialTileModeRef.current),
          zoomControlOptions: {
            position: googleMaps.ControlPosition.LEFT_TOP,
          },
          restriction: {
            latLngBounds: {
              north: TUNISIA_MAP_BOUNDS.north,
              south: TUNISIA_MAP_BOUNDS.south,
              east: TUNISIA_MAP_BOUNDS.east,
              west: TUNISIA_MAP_BOUNDS.west,
            },
            strictBounds: false,
          },
          isFractionalZoomEnabled: true,
        };

        const mapId = getGoogleMapsMapId();
        if (mapId) {
          mapOptions.mapId = mapId;
        }

        const map = new googleMaps.Map(mapElementRef.current, mapOptions);
        mapInstanceRef.current = map;
        infoWindowRef.current = new googleMaps.InfoWindow({ maxWidth: 340 });
      })
      .catch((error) => {
        console.error("Google Maps failed to load; falling back to Leaflet.", error);
        if (!cancelled) {
          onGoogleUnavailable(error instanceof Error ? error.message : "Google Maps failed to load");
        }
      });

    return () => {
      cancelled = true;
      if (infoWindowRef.current) {
        infoWindowRef.current.close();
      }
      Object.values(markerByIdRef.current).forEach((marker) => marker.setMap(null));
      markerByIdRef.current = {};
      mapInstanceRef.current = null;
      googleMapsRef.current = null;
      infoWindowRef.current = null;
      hasFittedBoundsRef.current = false;
      lastMarkerSignatureRef.current = "";
    };
  }, [onGoogleUnavailable]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const googleMaps = googleMapsRef.current;
    if (!map || !googleMaps) {
      return;
    }

    map.setMapTypeId(resolveGoogleMapTypeId(googleMaps, tileMode));
  }, [tileMode]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const googleMaps = googleMapsRef.current;
    const infoWindow = infoWindowRef.current;
    if (!map || !googleMaps || !infoWindow) {
      return;
    }

    Object.values(markerByIdRef.current).forEach((marker) => marker.setMap(null));
    markerByIdRef.current = {};
    const bounds = new googleMaps.LatLngBounds();
    const markerSignatureParts: string[] = [];
    const focusedPopupMachine =
      focusedMachineId ? machines.find((entry) => entry.id === focusedMachineId) ?? null : null;
    let markerCount = 0;

    machines.forEach((machine) => {
      if (!isValidTunisiaCoordinate(machine.lat, machine.lon)) {
        return;
      }

      const predictiveInsight = predictiveInsights[machine.id];
      const predictiveMeta = getPredictiveMapMeta(predictiveInsight);
      const pinHex =
        mode === "predictive" && predictiveInsight ? predictiveMeta.hex : STATUS_CONFIG[machine.status].hex;
      const isHighlighted =
        machine.id === focusedMachineId ||
        (mode === "predictive" &&
          Boolean(predictiveInsight?.stopRecommended || predictiveInsight?.urgencyBand === "critical"));

      const marker = new googleMaps.Marker({
        map,
        position: { lat: machine.lat, lng: machine.lon },
        title: getMachinePublicLabel(machine),
        icon: makeGooglePinIcon(googleMaps, pinHex, isHighlighted),
        optimized: true,
        zIndex: isHighlighted ? 1000 : undefined,
      });

      marker.addListener("click", () => {
        openGoogleMachinePopup(map, infoWindow, marker, machine, mode, predictiveInsight, l);
        onMachineSelect?.(machine.id);
      });

      markerByIdRef.current[machine.id] = marker;
      bounds.extend({ lat: machine.lat, lng: machine.lon });
      markerSignatureParts.push(`${machine.id}:${machine.lat.toFixed(4)}:${machine.lon.toFixed(4)}`);
      markerCount += 1;
    });

    const markerSignature = markerSignatureParts.sort().join("|");
    const shouldFit = !hasFittedBoundsRef.current || lastMarkerSignatureRef.current !== markerSignature;

    if (shouldFit) {
      if (markerCount > 1) {
        googleMaps.event.addListenerOnce(map, "idle", () => {
          clampGoogleMapZoom(map, FLEET_OVERVIEW_MAX_ZOOM);
        });
        map.fitBounds(bounds, FLEET_BOUNDS_PADDING);
      } else if (markerCount === 1) {
        const machine = machines.find((entry) => isValidTunisiaCoordinate(entry.lat, entry.lon));
        if (machine) {
          focusGoogleMapOnMachine(map, googleMaps, machine.lat, machine.lon);
        }
      } else {
        map.setCenter({
          lat: TUNISIA_CENTER_COORDINATES.lat,
          lng: TUNISIA_CENTER_COORDINATES.lon,
        });
        map.setZoom(DEFAULT_TUNISIA_ZOOM);
      }

      hasFittedBoundsRef.current = true;
      lastMarkerSignatureRef.current = markerSignature;
    }

    if (focusedMachineId && focusedPopupMachine) {
      const marker = markerByIdRef.current[focusedMachineId];
      if (marker) {
        openGoogleMachinePopup(
          map,
          infoWindow,
          marker,
          focusedPopupMachine,
          mode,
          predictiveInsights[focusedMachineId],
          l,
        );
      }
    }
  }, [focusedMachineId, l, machines, mode, onMachineSelect, predictiveInsights]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const googleMaps = googleMapsRef.current;
    const infoWindow = infoWindowRef.current;

    if (!focusedMachineId) {
      infoWindow?.close();
      return;
    }

    if (!map || !googleMaps || focusedMachineLat == null || focusedMachineLon == null) {
      return;
    }

    focusGoogleMapOnMachine(map, googleMaps, focusedMachineLat, focusedMachineLon);
  }, [focusedMachineId, focusedMachineLat, focusedMachineLon]);

  return <div ref={mapElementRef} className={`w-full ${heightClass}`} />;
}

export function IndustrialMap({
  mode = "status",
  machines: providedMachines,
  machineScopeId,
  predictiveInsights = {},
  heightClass = "h-[620px]",
  focusedMachineId,
  onMachineSelect,
  providerPreference = "auto",
}: IndustrialMapProps) {
  const { lang } = useApp();
  const { machines: fetchedMachines } = useMachines(machineScopeId);
  const machines = providedMachines ?? fetchedMachines;
  const [tileMode, setTileMode] = useState<TileMode>("roadmap");
  const [googleUnavailable, setGoogleUnavailable] = useState(false);
  const googleMapsConfigured = hasGoogleMapsApiKey();
  const handleGoogleUnavailable = useCallback(() => {
    setGoogleUnavailable(true);
  }, []);
  const l = useCallback<LocalizeText>(
    (fr, en, ar) => repairText(lang === "fr" ? fr : lang === "en" ? en : ar),
    [lang],
  );

  useEffect(() => {
    setGoogleUnavailable(false);
  }, [lang]);

  const legendItems = useMemo(() => {
    if (mode === "predictive") {
      return [
        { label: l("Stable", "Stable", "مستقر"), hex: "#10b981" },
        { label: l("Surveillance", "Monitoring", "مراقبة"), hex: "#f59e0b" },
        { label: l("Urgent", "Urgent", "عاجل"), hex: "#f43f5e" },
      ];
    }

    return [
      { label: l("Opérationnel", "Operational", "تشغيلي"), hex: STATUS_CONFIG.ok.hex },
      { label: l("Surveillance", "Monitoring", "مراقبة"), hex: STATUS_CONFIG.degraded.hex },
      { label: l("Critique", "Critical", "حرج"), hex: STATUS_CONFIG.critical.hex },
      { label: l("Maintenance", "Maintenance", "صيانة"), hex: STATUS_CONFIG.maintenance.hex },
    ];
  }, [l, mode]);

  const shouldUseGoogleMaps =
    providerPreference === "auto" && googleMapsConfigured && !googleUnavailable;

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-border bg-card shadow-lg shadow-black/20">
      {shouldUseGoogleMaps ? (
        <GoogleIndustrialMapCanvas
          mode={mode}
          machines={machines}
          predictiveInsights={predictiveInsights}
          heightClass={heightClass}
          focusedMachineId={focusedMachineId}
          onMachineSelect={onMachineSelect}
          tileMode={tileMode}
          lang={lang}
          l={l}
          onGoogleUnavailable={handleGoogleUnavailable}
        />
      ) : (
        <LeafletIndustrialMapCanvas
          mode={mode}
          machines={machines}
          predictiveInsights={predictiveInsights}
          heightClass={heightClass}
          focusedMachineId={focusedMachineId}
          onMachineSelect={onMachineSelect}
          tileMode={tileMode}
          lang={lang}
          l={l}
        />
      )}

      <div className="pointer-events-none absolute right-4 top-4 z-[900]">
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="max-w-[220px] rounded-2xl border border-white/70 bg-white/92 px-4 py-3 shadow-lg backdrop-blur">
            <div className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-slate-500">
              {l("Carte interactive", "Interactive map", "الخريطة التفاعلية")}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {l("Cliquez sur un marqueur pour les détails", "Click a marker for details", "انقر على مؤشر لعرض التفاصيل")}
            </div>
          </div>

          <div className="flex items-center gap-1.5 rounded-2xl border border-white/70 bg-white/92 p-1.5 shadow-lg backdrop-blur">
            <button
              type="button"
              onClick={() => setTileMode("roadmap")}
              aria-pressed={tileMode === "roadmap"}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[0.72rem] font-semibold transition-all ${
                tileMode === "roadmap" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Map className="h-3.5 w-3.5" />
              {l("Plan", "Map", "خريطة")}
            </button>
            <button
              type="button"
              onClick={() => setTileMode("satellite")}
              aria-pressed={tileMode === "satellite"}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[0.72rem] font-semibold transition-all ${
                tileMode === "satellite" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Satellite className="h-3.5 w-3.5" />
              {l("Satellite", "Satellite", "قمر صناعي")}
            </button>
          </div>

          <div className="w-[190px] rounded-2xl border border-white/70 bg-white/92 px-3 py-3 shadow-lg backdrop-blur">
            <div className="inline-flex items-center gap-1 text-[0.7rem] font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              {l("Couleur = priorité", "Color = priority", "اللون = الأولوية")}
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {legendItems.map((item) => (
                <span key={item.label} className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.hex }} />
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
