import React, { useMemo, useState } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, Geometry } from 'geojson';
import worldData from 'world-atlas/countries-110m.json';
import { iso31661 } from 'iso-3166';
import { PALETTE } from '../theme';

/**
 * Offline vector world map (no tiles, no external calls): the bundled
 * world-atlas TopoJSON rendered with d3-geo. Countries are shaded by amount
 * (choropleth) with proportional bubbles on top; hover for the figures.
 * Amounts arrive as an ISO2 → value map — the ERP-style geo view of the
 * group's footprint by counterparty residence or booking-center location.
 */

const world = worldData as unknown as Topology<{ countries: GeometryCollection<{ name?: string }> }>;
const FEATURES = (feature(world, world.objects.countries) as unknown as {
  features: Array<Feature<Geometry, { name?: string }>>;
}).features;

// ISO 3166: numeric id (world-atlas feature id) ↔ alpha-2 (our data) + name.
const NUM_TO_A2 = new Map(iso31661.map(e => [e.numeric, e.alpha2]));
const A2_NAME = new Map(iso31661.map(e => [e.alpha2, e.name]));

/** Financial-center territories too small for the 1:110m polygons — rendered
 * as point markers at their coordinates (lon, lat). */
const POINT_FALLBACK: Record<string, [number, number]> = {
  HK: [114.17, 22.30], SG: [103.85, 1.29], MC: [7.42, 43.74], LI: [9.55, 47.15],
  MT: [14.40, 35.90], AD: [1.52, 42.51], GI: [-5.35, 36.14], JE: [-2.10, 49.21],
  GG: [-2.58, 49.46], IM: [-4.55, 54.24], BM: [-64.75, 32.30], KY: [-81.25, 19.31],
  VG: [-64.62, 18.42], BH: [50.55, 26.05], MO: [113.55, 22.19], CW: [-68.99, 12.17],
  SM: [12.46, 43.94], SC: [55.49, -4.68], MU: [57.55, -20.35], BB: [-59.55, 13.10],
};

const W = 960, H = 480;
const projection = geoNaturalEarth1().fitExtent([[4, 4], [W - 4, H - 4]], { type: 'Sphere' });
const path = geoPath(projection);

export const countryName = (a2: string): string => A2_NAME.get(a2) ?? a2;

export const GeoFootprint: React.FC<{
  /** ISO2 country → amount (already scoped / netted by the caller). */
  data: Map<string, number>;
  /** Formats an amount for tooltips and the side list. */
  fmt: (n: number) => string;
  /** Suffix appended to formatted amounts (e.g. "mCHF"). */
  unit: string;
}> = ({ data, fmt, unit }) => {
  const [hover, setHover] = useState<string | null>(null);

  const { max, total, byFeature, top, points } = useMemo(() => {
    const positive = new Map(Array.from(data.entries()).filter(([, v]) => v !== 0));
    const mx = Math.max(1, ...Array.from(positive.values()).map(Math.abs));
    const tt = Array.from(positive.values()).reduce((s, v) => s + v, 0);
    const byF = new Map<string, { a2: string; value: number }>();
    for (const f of FEATURES) {
      const a2 = NUM_TO_A2.get(String(f.id).padStart(3, '0'));
      if (!a2) continue;
      const v = positive.get(a2);
      if (v !== undefined) byF.set(String(f.id), { a2, value: v });
    }
    const tp = Array.from(positive.entries()).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 10);
    // Countries present in the data but absent from the polygon set
    // (Hong Kong, Singapore, Monaco…) — drawn as point markers.
    const matched = new Set(Array.from(byF.values()).map(x => x.a2));
    const pts: Array<{ a2: string; value: number; x: number; y: number }> = [];
    for (const [a2, v] of positive) {
      if (matched.has(a2) || !POINT_FALLBACK[a2]) continue;
      const xy = projection(POINT_FALLBACK[a2]);
      if (xy) pts.push({ a2, value: v, x: xy[0], y: xy[1] });
    }
    return { max: mx, total: tt, byFeature: byF, top: tp, points: pts };
  }, [data]);

  return (
    <div className="md:grid md:grid-cols-[minmax(0,1fr)_230px] md:gap-4">
      <div className="min-w-0 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="World map of exposures">
          <path d={path({ type: 'Sphere' }) ?? undefined} fill={PALETTE.bg} stroke={PALETTE.line} strokeWidth={1} />
          {FEATURES.map(f => {
            const hit = byFeature.get(String(f.id));
            const active = hit && hover === hit.a2;
            const t = hit ? Math.sqrt(Math.abs(hit.value) / max) : 0;
            return (
              <path key={String(f.id)} d={path(f) ?? undefined}
                fill={hit ? PALETTE.slate : PALETTE.bg}
                fillOpacity={hit ? 0.25 + 0.7 * t : 1}
                stroke={active ? PALETTE.red : PALETTE.line}
                strokeWidth={active ? 1.4 : 0.6}
                onMouseEnter={() => hit && setHover(hit.a2)}
                onMouseLeave={() => setHover(null)}>
                <title>
                  {(f.properties?.name || (hit ? countryName(hit.a2) : ''))}
                  {hit ? ` — ${fmt(hit.value)} ${unit} (${total ? ((hit.value / total) * 100).toFixed(1) : '0'}%)` : ' — no exposure'}
                </title>
              </path>
            );
          })}
          {/* Micro-territories without a polygon (HK, SG, MC…): point markers. */}
          {points.map(pt => {
            const r = 4 + 20 * Math.sqrt(Math.abs(pt.value) / max);
            return (
              <g key={`p-${pt.a2}`} onMouseEnter={() => setHover(pt.a2)} onMouseLeave={() => setHover(null)}>
                <circle cx={pt.x} cy={pt.y} r={r}
                  fill={PALETTE.red} fillOpacity={hover === pt.a2 ? 0.75 : 0.5}
                  stroke="#fff" strokeWidth={1} />
                <title>{`${countryName(pt.a2)} — ${fmt(pt.value)} ${unit} (${total ? ((pt.value / total) * 100).toFixed(1) : '0'}%)`}</title>
              </g>
            );
          })}
          {/* Proportional bubbles on top of the shaded countries. */}
          {FEATURES.map(f => {
            const hit = byFeature.get(String(f.id));
            if (!hit) return null;
            const [cx, cy] = path.centroid(f);
            if (!isFinite(cx) || !isFinite(cy)) return null;
            const r = 4 + 20 * Math.sqrt(Math.abs(hit.value) / max);
            return (
              <circle key={`b-${String(f.id)}`} cx={cx} cy={cy} r={r}
                fill={PALETTE.red} fillOpacity={hover === hit.a2 ? 0.7 : 0.45}
                stroke="#fff" strokeWidth={1} className="pointer-events-none" />
            );
          })}
        </svg>
      </div>
      <div className="mt-3 md:mt-0">
        <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-brand-text-secondary mb-1.5">
          Top countries
        </p>
        {top.length === 0 ? (
          <p className="text-[12px] text-brand-text-secondary">No geographic data for this period.</p>
        ) : (
          <div className="space-y-1">
            {top.map(([a2, v]) => {
              const share = total ? (v / total) * 100 : 0;
              return (
                <div key={a2 || '—'}
                  onMouseEnter={() => setHover(a2)} onMouseLeave={() => setHover(null)}
                  className={`rounded-md px-2 py-1 border transition-colors cursor-default ${hover === a2 ? 'border-brand-primary bg-brand-primary/5' : 'border-transparent'}`}>
                  <div className="flex justify-between text-[12px]">
                    <span className="font-semibold truncate">{a2 ? `${a2} · ${countryName(a2)}` : 'Unassigned'}</span>
                    <span className="tabular-nums whitespace-nowrap">{fmt(v)}</span>
                  </div>
                  <div className="h-1 rounded-full bg-brand-bg-body overflow-hidden">
                    <div className="h-full bg-brand-secondary" style={{ width: `${Math.min(100, Math.abs(share))}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
