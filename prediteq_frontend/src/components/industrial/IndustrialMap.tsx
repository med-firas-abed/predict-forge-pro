import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Map, Satellite, Sparkles } from "lucide-react";
import { STATUS_CONFIG, type Machine } from "@/data/machines";
import { useApp } from "@/contexts/AppContext";
import { useMachines } from "@/hooks/useMachines";
import type { PredictiveInsight } from "@/hooks/useFleetPredictiveInsights";

type MapMode = "status" | "predictive";
type TileMode = "roadmap" | "satellite";

interface IndustrialMapProps {
  mode?: MapMode;
  predictiveInsights?: Record<string, PredictiveInsight>;
  heightClass?: string;
  focusedMachineId?: string;
  onMachineSelect?: (machineId: string) => void;
}

function escapeHTML(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function makePinIcon(hex: string, highlighted: boolean) {
  const halo = highlighted
    ? `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:52px;height:52px;border-radius:999px;background:${hex}22;border:2px solid ${hex}55;pointer-events:none;"></div>`
    : "";

  return L.divIcon({
    html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;">
      ${halo}
      <div style="width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;background:${hex};box-shadow:0 6px 18px rgba(15,23,42,0.28);border:2px solid rgba(255,255,255,0.92);">
        <div style="width:12px;height:12px;background:#fff;border-radius:999px;transform:rotate(45deg);"></div>
      </div>
      <div style="width:12px;height:4px;background:rgba(15,23,42,0.16);border-radius:999px;margin-top:2px;"></div>
    </div>`,
    className: "",
    iconSize: [34, 40],
    iconAnchor: [17, 40],
    popupAnchor: [0, -40],
  });
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

function getStatusLabel(machine: Machine, localize: (fr: string, en: string, ar: string) => string) {
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
  localize: (fr: string, en: string, ar: string) => string,
) {
  const statusConfig = STATUS_CONFIG[machine.status];
  const predictiveMeta = getPredictiveMapMeta(predictiveInsight);
  const accentHex = mode === "predictive" && predictiveInsight ? predictiveMeta.hex : statusConfig.hex;
  const hiPct = typeof machine.hi === "number" ? Math.round(machine.hi * 100) : null;

  const decisionBlock =
    mode === "predictive" && predictiveInsight
      ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 11px;margin-bottom:10px;">
          <div style="font-size:.55rem;color:#64748b;letter-spacing:1.4px;text-transform:uppercase;font-family:'JetBrains Mono',monospace;font-weight:600;">${escapeHTML(localize("Priorite predictive", "Predictive priority", "الاولوية التنبؤية"))}</div>
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
    machine.rulMode === "no_prediction"
      ? `L10 ${machine.l10Years ?? "-"} ${localize("a", "y", "س")}`
      : machine.rul != null
        ? `${machine.rul} ${localize("j", "d", "ي")}`
        : machine.rulReferenceDays != null
          ? `~${machine.rulReferenceDays} ${localize("j", "d", "ي")}`
          : localize("Initialisation RUL", "RUL warm-up", "تهيئة العمر المتبقي");

  const rulSub =
    machine.rulMode === "no_prediction"
      ? localize("Référence de vie du composant", "Component life reference", "مرجع عمر المكون")
      : machine.rulIntervalLow != null && machine.rulIntervalHigh != null
        ? `${machine.rulIntervalLabel ?? "IC 80 %"} ${machine.rulIntervalLow}-${machine.rulIntervalHigh} ${localize("j", "d", "ي")}`
        : machine.rulci != null
          ? `+/- ${machine.rulci} ${localize("j", "d", "ي")}`
          : localize("Sans intervalle", "No interval", "بلا مجال");

  return `<div style="font-family:Inter,system-ui,sans-serif;overflow:hidden;border-radius:16px;min-width:290px;">
    <div style="background:linear-gradient(135deg, ${accentHex}, ${accentHex}cc);padding:14px 16px 12px;">
      <div style="font-size:.96rem;font-weight:700;color:#fff;">${escapeHTML(machine.id)}</div>
      <div style="font-size:.74rem;color:rgba(255,255,255,.85);margin-top:2px;">${escapeHTML(machine.name)} - ${escapeHTML(machine.city)}</div>
    </div>
    <div style="padding:14px 16px;background:#fff;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-size:.58rem;color:#64748b;letter-spacing:1.8px;text-transform:uppercase;font-family:'JetBrains Mono',monospace;font-weight:600;">Health Index</span>
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
        <div style="font-size:.64rem;color:#64748b;">${escapeHTML(localize("Coordonnées", "Coordinates", "الاحداثيات"))}: ${machine.lat.toFixed(3)}, ${machine.lon.toFixed(3)}</div>
        <a href="https://www.google.com/maps?q=${machine.lat},${machine.lon}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:4px;font-size:.66rem;font-weight:600;color:#fff;background:#4285F4;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;text-decoration:none;">
          ${escapeHTML(localize("Ouvrir Google Maps", "Open Google Maps", "افتح خرائط جوجل"))}
        </a>
      </div>
    </div>
  </div>`;
}

export function IndustrialMap({
  mode = "status",
  predictiveInsights = {},
  heightClass = "h-[620px]",
  focusedMachineId,
  onMachineSelect,
}: IndustrialMapProps) {
  const { lang } = useApp();
  const { machines } = useMachines();
  const [tileMode, setTileMode] = useState<TileMode>("roadmap");
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const markerByIdRef = useRef<Record<string, L.Marker>>({});
  const hasFittedBoundsRef = useRef(false);
  const lastMarkerCountRef = useRef(0);
  const l = useCallback(
    (fr: string, en: string, ar: string) => (lang === "fr" ? fr : lang === "en" ? en : ar),
    [lang],
  );

  useEffect(() => {
    if (!mapElementRef.current || mapInstanceRef.current) {
      return;
    }

    const map = L.map(mapElementRef.current, {
      zoomControl: false,
      attributionControl: false,
    });

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
      lastMarkerCountRef.current = 0;
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
        ? "https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
        : "https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
      {
        maxZoom: 20,
        subdomains: ["mt0", "mt1", "mt2", "mt3"],
      },
    ).addTo(map);
  }, [tileMode]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const markerLayer = markerLayerRef.current;
    if (!map || !markerLayer) {
      return;
    }

    markerLayer.clearLayers();
    markerByIdRef.current = {};
    const markerPositions: L.LatLng[] = [];

    machines.forEach((machine) => {
      const predictiveInsight = predictiveInsights[machine.id];
      const predictiveMeta = getPredictiveMapMeta(predictiveInsight);
      const pinHex =
        mode === "predictive" && predictiveInsight ? predictiveMeta.hex : STATUS_CONFIG[machine.status].hex;
      const isHighlighted =
        machine.id === focusedMachineId ||
        (mode === "predictive" &&
          Boolean(predictiveInsight?.stopRecommended || predictiveInsight?.urgencyBand === "critical"));

      const marker = L.marker([machine.lat, machine.lon], {
        icon: makePinIcon(pinHex, isHighlighted),
      }).bindPopup(makePopupHTML(machine, mode, predictiveInsight, l), {
        maxWidth: 340,
        className: "pl-popup",
        closeButton: true,
      });

      marker.on("click", () => onMachineSelect?.(machine.id));
      marker.addTo(markerLayer);
      markerByIdRef.current[machine.id] = marker;
      markerPositions.push(L.latLng(machine.lat, machine.lon));
    });

    const shouldFit = !hasFittedBoundsRef.current || lastMarkerCountRef.current !== markerPositions.length;
    if (shouldFit) {
      if (markerPositions.length > 0) {
        map.fitBounds(L.latLngBounds(markerPositions), { padding: [56, 56], maxZoom: 11 });
      } else {
        map.setView([36.0, 9.8], 7);
      }
      hasFittedBoundsRef.current = true;
      lastMarkerCountRef.current = markerPositions.length;
    }
  }, [focusedMachineId, l, machines, mode, onMachineSelect, predictiveInsights]);

  useEffect(() => {
    if (!focusedMachineId) {
      return;
    }

    const map = mapInstanceRef.current;
    const marker = markerByIdRef.current[focusedMachineId];
    const machine = machines.find((entry) => entry.id === focusedMachineId);

    if (!map || !marker || !machine) {
      return;
    }

    map.flyTo([machine.lat, machine.lon], Math.max(map.getZoom(), 9), {
      animate: true,
      duration: 0.6,
    });
    marker.openPopup();
  }, [focusedMachineId, machines]);

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

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-border bg-card shadow-lg shadow-black/20">
      <div ref={mapElementRef} className={`w-full ${heightClass}`} />

      <div className="pointer-events-none absolute right-4 top-4 z-[900]">
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="max-w-[220px] rounded-2xl border border-white/70 bg-white/92 px-4 py-3 shadow-lg backdrop-blur">
            <div className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-slate-500">
              {l("Carte interactive", "Interactive map", "الخريطة التفاعلية")}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {l("Cliquez sur un marqueur pour les details", "Click a marker for details", "انقر على مؤشر لعرض التفاصيل")}
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
              {l("Couleur = priorite", "Color = priority", "اللون = الاولوية")}
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
