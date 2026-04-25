import { useId } from "react";

interface SVGGaugeProps {
  value: number;
  max: number;
  color: string;
  label: string;
  unit: string;
}

export function SVGGauge({ value, max, color, unit }: SVGGaugeProps) {
  const pct = Math.max(0, Math.min(value / max, 1));
  const R = 46, cx = 60, cy = 60, stroke = 8;
  const id = useId();

  function ptArc(angleDeg: number, r = R) {
    const a = angleDeg * Math.PI / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }

  function arcPath(a1: number, a2: number, r = R) {
    const p1 = ptArc(a1, r), p2 = ptArc(a2, r);
    const diff = (a2 - a1 + 360) % 360;
    return `M${p1.x.toFixed(2)},${p1.y.toFixed(2)} A${r},${r} 0 ${diff > 180 ? 1 : 0},1 ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }

  const needleAngle = 180 + pct * 180;
  const nLen = R - 6;
  const tip = ptArc(needleAngle, nLen);
  const back = ptArc(needleAngle + 180, 6);
  const valText = unit === '%' ? `${Math.round(value * 100)}%` : `${Number(value).toFixed(1)} ${unit}`;

  // Zone segments: green (0-50%), amber (50-75%), red (75-100%)
  const zones = [
    { from: 0, to: 0.50, col: "#22c55e" },
    { from: 0.50, to: 0.75, col: "#f59e0b" },
    { from: 0.75, to: 1.0, col: "#ef4444" },
  ];

  // Sub-ticks every 10% + major ticks at 0,25,50,75,100
  const majorTicks = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const angle = 180 + f * 180;
    const inner = ptArc(angle, R - stroke / 2 - 1);
    const outer = ptArc(angle, R + stroke / 2 + 2);
    const labelPt = ptArc(angle, R + 17);
    return { inner, outer, labelPt, labelVal: Math.round(f * max), angle };
  });

  const minorTicks = Array.from({ length: 21 }, (_, i) => i * 0.05)
    .filter(f => f % 0.25 !== 0)
    .map(f => {
      const angle = 180 + f * 180;
      const inner = ptArc(angle, R - stroke / 2);
      const outer = ptArc(angle, R + stroke / 2 + 1);
      return { inner, outer };
    });

  return (
    <div>
      <svg viewBox="0 0 120 90" className="w-full block overflow-visible">
        <defs>
          {/* Glow for the active arc */}
          <filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
            <feColorMatrix in="blur" type="matrix" values={`0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.35 0`} />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Subtle inner shadow for the track */}
          <filter id={`${id}-inner`} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="1" result="b" />
            <feOffset dx="0" dy="1" in="b" result="o" />
            <feComposite in="SourceGraphic" in2="o" operator="over" />
          </filter>
          {/* Needle drop shadow */}
          <filter id={`${id}-ndl`}>
            <feDropShadow dx="0.5" dy="1" stdDeviation="1" floodOpacity="0.25" />
          </filter>
        </defs>

        {/* Outer ring decoration */}
        <path d={arcPath(180, 360, R + stroke / 2 + 0.5)} fill="none" stroke="hsl(220,14%,80%)" strokeWidth={0.5} strokeLinecap="butt" opacity={0.5} />

        {/* Background track */}
        <path d={arcPath(180, 360)} fill="none" stroke="hsl(220,14%,88%)" strokeWidth={stroke} strokeLinecap="butt" opacity={0.5} filter={`url(#${id}-inner)`} />

        {/* Colored zone segments (subtle background) */}
        {zones.map((z, i) => (
          <path key={i} d={arcPath(180 + z.from * 180, 180 + z.to * 180)} fill="none" stroke={z.col} strokeWidth={stroke} strokeLinecap="butt" opacity={0.12} />
        ))}

        {/* Active arc with glow */}
        {/* Minor tick marks */}
        {minorTicks.map((tk, i) => (
          <line key={`m${i}`} x1={tk.inner.x} y1={tk.inner.y} x2={tk.outer.x} y2={tk.outer.y} stroke="hsl(220,14%,72%)" strokeWidth={0.5} />
        ))}

        {/* Major tick marks */}
        {majorTicks.map((tk, i) => (
          <line key={i} x1={tk.inner.x} y1={tk.inner.y} x2={tk.outer.x} y2={tk.outer.y} stroke="hsl(220,14%,55%)" strokeWidth={1} />
        ))}

        {/* Tick labels */}
        {majorTicks.map((tk, i) => (
          <text key={`l${i}`} x={tk.labelPt.x} y={tk.labelPt.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize={6.5} fill="hsl(215,12%,50%)" fontFamily="system-ui" fontWeight={500}>
            {tk.labelVal}
          </text>
        ))}

        {/* Needle shadow */}
        <line x1={cx + 0.5} y1={cy + 1} x2={tip.x + 0.5} y2={tip.y + 1} stroke="rgba(0,0,0,0.12)" strokeWidth={3} strokeLinecap="round" />
        {/* Needle counterweight */}
        <line x1={cx} y1={cy} x2={back.x} y2={back.y} stroke="hsl(220,14%,65%)" strokeWidth={3} strokeLinecap="round" />
        {/* Needle body */}
        <line x1={cx} y1={cy} x2={tip.x} y2={tip.y} stroke="hsl(220,14%,20%)" strokeWidth={2} strokeLinecap="round" filter={`url(#${id}-ndl)`} />

        {/* Center hub — layered for 3D effect */}
        <circle cx={cx} cy={cy} r={7} fill="hsl(220,14%,95%)" stroke="hsl(220,14%,78%)" strokeWidth={1} />
        <circle cx={cx} cy={cy} r={5} fill="hsl(220,14%,90%)" stroke="hsl(220,14%,72%)" strokeWidth={0.8} />
        <circle cx={cx} cy={cy} r={2.8} fill={color} opacity={0.9} />
        {/* Highlight dot on hub */}
        <circle cx={cx - 1} cy={cy - 1.5} r={1} fill="white" opacity={0.5} />

        {/* Value text */}
        <text x={cx} y={cy + 20} textAnchor="middle" fontSize={12} fontWeight={800} fill={color} fontFamily="JetBrains Mono, monospace" letterSpacing={0.5}>
          {valText}
        </text>
      </svg>
    </div>
  );
}
