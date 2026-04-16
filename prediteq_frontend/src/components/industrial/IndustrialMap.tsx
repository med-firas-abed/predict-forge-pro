import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { STATUS_CONFIG, Machine } from "@/data/machines";
import { useApp } from "@/contexts/AppContext";
import { useMachines } from "@/hooks/useMachines";

function makePinIcon(hex: string, isCritical: boolean) {
  const pulse = isCritical
    ? `<div class="pulse-ring" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:48px;height:48px;border-radius:50%;background:${hex}33;border:1.5px solid ${hex}55;pointer-events:none;"></div>`
    : "";

  return L.divIcon({
    html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;">
      ${pulse}
      <div style="width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;background:${hex};box-shadow:0 3px 12px rgba(0,0,0,0.35);border:2px solid rgba(255,255,255,0.7);">
        <div style="width:11px;height:11px;background:#fff;border-radius:50%;transform:rotate(45deg);"></div>
      </div>
      <div style="width:10px;height:4px;background:rgba(0,0,0,0.2);border-radius:50%;margin-top:2px;"></div>
    </div>`,
    className: "",
    iconSize: [32, 38],
    iconAnchor: [16, 38],
    popupAnchor: [0, -38],
  });
}

function escapeHTML(str: string | number | null | undefined): string {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function makePopupHTML(m: Machine) {
  const cfg = STATUS_CONFIG[m.status];
  const hiPct = Math.round(m.hi * 100);
  const headerBg: Record<string, string> = {
    ok: "linear-gradient(135deg,#0f766e,#14b8a6)",
    degraded: "linear-gradient(135deg,#b45309,#f59e0b)",
    critical: "linear-gradient(135deg,#be123c,#f43f5e)",
    maintenance: "linear-gradient(135deg,#0369a1,#4cc2ff)",
  };

  return `<div style="font-family:'Inter',system-ui,sans-serif;overflow:hidden;border-radius:14px;">
    <div style="background:${headerBg[m.status]};padding:14px 16px 12px;">
      <div style="font-size:.95rem;font-weight:700;color:#fff;">${escapeHTML(m.id)}</div>
      <div style="font-size:.72rem;color:rgba(255,255,255,.8);margin-top:2px;">${escapeHTML(m.name)} · ${escapeHTML(m.city)}</div>
    </div>
    <div style="padding:14px 16px;background:#fff;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-size:.6rem;color:#64748b;letter-spacing:2px;text-transform:uppercase;font-family:'JetBrains Mono',monospace;font-weight:600;">Health Index</span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:.85rem;font-weight:700;color:${cfg.hex};">${hiPct}%</span>
      </div>
      <div style="height:5px;background:#e2e8f0;border-radius:99px;margin-bottom:12px;overflow:hidden;">
        <div style="height:100%;width:${hiPct}%;border-radius:99px;background:${cfg.hex};"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;padding:9px 11px;">
          <div style="font-size:.55rem;color:#94a3b8;letter-spacing:1.5px;text-transform:uppercase;font-family:'JetBrains Mono',monospace;font-weight:600;">RUL</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:1.1rem;font-weight:700;color:${cfg.hex};margin-top:3px;">${m.rul ?? "—"} <span style="font-size:.65rem;color:#94a3b8;font-weight:400;">± ${m.rulci ?? "—"} j</span></div>
        </div>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;padding:9px 11px;">
          <div style="font-size:.55rem;color:#94a3b8;letter-spacing:1.5px;text-transform:uppercase;font-family:'JetBrains Mono',monospace;font-weight:600;">Statut</div>
          <div style="font-size:.78rem;font-weight:700;color:${cfg.hex};margin-top:3px;">${cfg.label}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;">
        <div style="font-size:.62rem;color:#94a3b8;">MAJ: ${m.last}</div>
        <a href="https://www.google.com/maps?q=${m.lat},${m.lon}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:4px;font-size:.65rem;font-weight:600;color:#fff;background:#4285F4;border:none;border-radius:6px;padding:5px 10px;cursor:pointer;text-decoration:none;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          Google Maps
        </a>
      </div>
    </div>
  </div>`;
}

export function IndustrialMap() {
  const { t } = useApp();
  const { machines } = useMachines();
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapElementRef.current) return;

    // Clean up previous instance
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapElementRef.current, {
      zoomControl: true,
      attributionControl: false,
    });

    mapInstanceRef.current = map;

    L.tileLayer("https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
      maxZoom: 20,
      subdomains: ["mt0", "mt1", "mt2", "mt3"],
    }).addTo(map);

    const markers: L.LatLng[] = [];

    machines.forEach((machine) => {
      const mcfg = STATUS_CONFIG[machine.status];
      const marker = L.marker([machine.lat, machine.lon], {
        icon: makePinIcon(mcfg.hex, machine.status === "critical"),
      })
        .addTo(map)
        .bindPopup(makePopupHTML(machine), {
          maxWidth: 300,
          className: "pl-popup",
          closeButton: true,
        });
      markers.push(L.latLng(machine.lat, machine.lon));
    });

    // Fit bounds to show ALL markers
    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    } else {
      map.setView([36.0, 9.8], 7);
    }

    requestAnimationFrame(() => map.invalidateSize());

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [machines]);

  const uniqueCities = [...new Set(machines.map(m => m.city))];

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-lg shadow-black/20">
      <div ref={mapElementRef} className="h-[440px] w-full" />
      <div className="flex items-center gap-4 px-4 py-3 border-t border-border bg-card/50 flex-wrap">
        {Object.entries(STATUS_CONFIG).map(([key, val]) => (
          <span key={key} className="flex items-center gap-1.5 font-mono text-xs text-secondary-foreground">
            <div className="w-2 h-2 rounded-full" style={{ background: val.hex }} />
            {val.label}
          </span>
        ))}
        <span className="ml-auto text-[0.65rem] italic text-muted-foreground">
          {machines.length} {t("nav.machines").toLowerCase()} · {uniqueCities.length} {t("geo.sites")} · {t("geo.clickMarker")}
        </span>
      </div>
    </div>
  );
}
