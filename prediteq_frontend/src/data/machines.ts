export interface Machine {
  id: string;
  uuid?: string;
  name: string;
  loc: string;
  city: string;
  lat: number;
  lon: number;
  hi: number;
  rul: number | null;
  rulci: number | null;
  status: 'ok' | 'degraded' | 'critical' | 'maintenance';
  vib: number;
  curr: number;
  temp: number;
  anom: number;
  cycles: number;
  model: string;
  floors: number;
  last: string;
}

export const MACHINES: Machine[] = [
  { id: "ASC-A1", name: "Ascenseur Magasin A1", loc: "Bâtiment A — Zone Nord", city: "Ben Arous", lat: 36.754, lon: 10.231, hi: 0.87, rul: 142, rulci: 24, status: "ok", vib: 1.3, curr: 4.21, temp: 23.4, anom: 1, cycles: 82, model: "SITI FC100L1-4", floors: 19, last: "2026-03-15" },
  { id: "ASC-B2", name: "Ascenseur Magasin B2", loc: "Bâtiment B — Zone Est", city: "Sfax", lat: 34.739, lon: 10.760, hi: 0.62, rul: 54, rulci: 16, status: "degraded", vib: 3.1, curr: 4.68, temp: 27.1, anom: 7, cycles: 74, model: "SITI FC100L1-4", floors: 19, last: "2026-03-10" },
  { id: "ASC-C3", name: "Ascenseur Magasin C3", loc: "Bâtiment C — Zone Sud", city: "Sousse", lat: 35.828, lon: 10.636, hi: 0.31, rul: 12, rulci: 7, status: "critical", vib: 6.8, curr: 4.97, temp: 31.2, anom: 23, cycles: 61, model: "SITI FC100L1-4", floors: 19, last: "2026-03-20" },
];

export const STATUS_CONFIG = {
  ok: { label: "Opérationnel", pillClass: "status-pill--ok", hex: "#10b981" },
  degraded: { label: "Surveillance", pillClass: "status-pill--degraded", hex: "#f59e0b" },
  critical: { label: "Critique", pillClass: "status-pill--critical", hex: "#f43f5e" },
  maintenance: { label: "Maintenance", pillClass: "status-pill--maintenance", hex: "#4b8b9b" },
} as const;

export function genHI(base: number, n = 90): number[] {
  let hi = Math.min(base + 0.18, 1);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    hi = Math.max(0, Math.min(1, hi - 0.003 + Math.random() * 0.008 - 0.004));
    out.push(+hi.toFixed(3));
  }
  out[out.length - 1] = base;
  return out;
}
