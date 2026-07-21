"use client";

import type { FleetOverview, RevenuePoint } from "@/lib/freight/dispatch-dashboard-types";

export function FleetDonutChart({ fleet }: { fleet: FleetOverview }) {
  const segments = [
    { label: "Active", value: fleet.active, color: "#38a3ff" },
    { label: "Available", value: fleet.available, color: "#5bc8ff" },
    { label: "In Transit", value: fleet.in_transit, color: "#8fb4d4" },
  ];
  const total = Math.max(
    fleet.total_units,
    segments.reduce((s, x) => s + x.value, 0),
    1,
  );
  let offset = 0;
  const r = 52;
  const c = 2 * Math.PI * r;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative">
        <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden>
          <circle
            cx="70"
            cy="70"
            r={r}
            fill="none"
            stroke="rgba(56,163,255,0.12)"
            strokeWidth="18"
          />
          {segments.map((seg) => {
            const len = (seg.value / total) * c;
            const dash = `${len} ${c - len}`;
            const el = (
              <circle
                key={seg.label}
                cx="70"
                cy="70"
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth="18"
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                transform="rotate(-90 70 70)"
                strokeLinecap="round"
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-[var(--color-text)]">{total}</span>
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
            Units
          </span>
        </div>
      </div>
      <ul className="space-y-2 text-sm">
        {segments.map((seg) => (
          <li key={seg.label} className="flex items-center gap-2 text-[var(--color-muted)]">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-[var(--color-text)]">{seg.label}</span>
            <span className="ml-auto tabular-nums">{seg.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RevenueLineChart({ data }: { data: RevenuePoint[] }) {
  const max = Math.max(...data.map((d) => d.amount), 1);
  const w = 280;
  const h = 120;
  const pad = 12;
  const points = data.map((d, i) => {
    const x = pad + (i / Math.max(data.length - 1, 1)) * (w - pad * 2);
    const y = h - pad - (d.amount / max) * (h - pad * 2);
    return { ...d, x, y };
  });
  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${w} ${h + 24}`} className="overflow-visible">
        <defs>
          <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(56,163,255,0.35)" />
            <stop offset="100%" stopColor="rgba(56,163,255,0)" />
          </linearGradient>
        </defs>
        {points.length > 1 ? (
          <polygon
            points={`${points[0].x},${h} ${polyline} ${points[points.length - 1].x},${h}`}
            fill="url(#rev-fill)"
          />
        ) : null}
        <polyline
          points={polyline}
          fill="none"
          stroke="#38a3ff"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {points.map((p) => (
          <g key={p.day}>
            <circle cx={p.x} cy={p.y} r="4" fill="#38a3ff" />
            <text
              x={p.x}
              y={h + 16}
              textAnchor="middle"
              className="fill-[var(--color-muted)] text-[10px]"
            >
              {p.day}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
