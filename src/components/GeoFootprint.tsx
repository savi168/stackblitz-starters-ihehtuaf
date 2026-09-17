import React, { useEffect, useMemo, useRef, useState } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, Geometry } from 'geojson';
import worldData from 'world-atlas/countries-110m.json';
import { iso31661 } from 'iso-3166';
import { PALETTE } from '../theme';

/**
 * Offline interactive world map (no tiles, no external calls): the bundled
 * world-atlas TopoJSON rendered with d3-geo, with hand-rolled wheel-zoom /
 * drag-pan (no extra dependency). Countries are shaded by amount (choropleth)
 * with proportional bubbles kept at constant screen size while zooming.
 * Hover shows a rich tooltip (amount, share, Δ vs previous period); clicking
 * a country pins a detail panel fed by the caller's `detailOf` breakdown.
 */

const world = worldData as unknown as Topology<{ countries: GeometryCollection<{ name?: string }> }>;
const FEATURES = (feature(world, world.objects.countries) as unknown as {
  features: Array<Feature<Geometry, { name?: string }>>;
}).features;

// ISO 3166: numeric id (world-atlas feature id) ↔ alpha-2 (our data) + name.
const NUM_TO_A2 = new Map(iso31661.map(e => [e.numeric, e.alpha2]));
const A2_NAME = new Map(iso31661.map(e => [e.alpha2, e.name]));
const A2_FEATURE = new Map<string, Feature<Geometry, { name?: string }>>();
for (const f of FEATURES) {
  const a2 = NUM_TO_A2.get(String(f.id).padStart(3, '0'));
  if (a2 && !A2_FEATURE.has(a2)) A2_FEATURE.set(a2, f);
}

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
const MIN_K = 1, MAX_K = 40;
const projection = geoNaturalEarth1().fitExtent([[4, 4], [W - 4, H - 4]], { type: 'Sphere' });
const path = geoPath(projection);

/** Everyday short names — the ISO 3166 official names are too long for the
 * ranking list ("United Kingdom of Great Britain and Northern Ireland"). */
const SHORT_NAMES: Record<string, string> = {
  GB: 'United Kingdom', US: 'United States', RU: 'Russia', KR: 'South Korea',
  KP: 'North Korea', TW: 'Taiwan', VN: 'Vietnam', IR: 'Iran', SY: 'Syria',
  LA: 'Laos', MD: 'Moldova', TZ: 'Tanzania', BO: 'Bolivia', VE: 'Venezuela',
  NL: 'Netherlands', CD: 'DR Congo', CZ: 'Czechia', MK: 'North Macedonia',
  BN: 'Brunei', FM: 'Micronesia', TR: 'Türkiye',
};
export const countryName = (a2: string): string => SHORT_NAMES[a2] ?? A2_NAME.get(a2) ?? a2;

/** 🇨🇭-style flag emoji from an ISO2 code (regional indicator letters). */
const flagOf = (a2: string): string =>
  /^[A-Z]{2}$/.test(a2)
    ? String.fromCodePoint(...Array.from(a2).map(c => 0x1f1e6 + c.charCodeAt(0) - 65))
    : '🌐';

type Transform = { k: number; x: number; y: number };
const IDENTITY: Transform = { k: 1, x: 0, y: 0 };

const clampT = (t: Transform): Transform => {
  const k = Math.min(MAX_K, Math.max(MIN_K, t.k));
  return {
    k,
    x: Math.min(0, Math.max(W * (1 - k), t.x)),
    y: Math.min(0, Math.max(H * (1 - k), t.y)),
  };
};

/** Transform that frames the base-coordinate box [x0,y0]-[x1,y1]. */
const fitBox = (x0: number, y0: number, x1: number, y1: number, maxK = MAX_K): Transform => {
  const k = Math.min(maxK, Math.max(MIN_K, 0.9 / Math.max((x1 - x0) / W, (y1 - y0) / H)));
  return clampT({ k, x: W / 2 - k * (x0 + x1) / 2, y: H / 2 - k * (y0 + y1) / 2 });
};

/** Frame a lon/lat box by projecting a sample grid of its points. */
const fitLonLat = (lon0: number, lat0: number, lon1: number, lat1: number): Transform => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
    const p = projection([lon0 + (i / 4) * (lon1 - lon0), lat0 + (j / 4) * (lat1 - lat0)]);
    if (!p) continue;
    x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
  }
  return isFinite(x0) ? fitBox(x0, y0, x1, y1, 8) : IDENTITY;
};

const REGIONS: Array<{ id: string; label: string; t: () => Transform }> = [
  { id: 'world', label: 'World', t: () => IDENTITY },
  { id: 'europe', label: 'Europe', t: () => fitLonLat(-11, 34, 33, 62) },
  { id: 'apac', label: 'APAC', t: () => fitLonLat(60, -14, 155, 55) },
  { id: 'americas', label: 'Americas', t: () => fitLonLat(-130, -40, -30, 62) },
  { id: 'mea', label: 'MEA', t: () => fitLonLat(-20, -36, 62, 42) },
];

export type GeoDetailRow = { k: string; label?: string; now: number; prev?: number };

export const GeoFootprint: React.FC<{
  /** ISO2 country → amount (already scoped / netted by the caller). */
  data: Map<string, number>;
  /** Same metric for the previous period — enables Δ in tooltips and details. */
  prevData?: Map<string, number>;
  /** Per-country breakdown (rubriques) for the pinned detail panel. */
  detailOf?: (a2: string) => GeoDetailRow[];
  /** Formats an amount for tooltips and the side list. */
  fmt: (n: number) => string;
  /** Suffix appended to formatted amounts (e.g. "mCHF"). */
  unit: string;
  periodLabel?: string;
  prevPeriodLabel?: string;
}> = ({ data, prevData, detailOf, fmt, unit, periodLabel, prevPeriodLabel }) => {
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  // Default frame: Europe — where the exposure usually is. World stays one
  // click away (region pill, ⤢ reset, or the off-frame chip).
  const [t, setT] = useState<Transform>(() => fitLonLat(-11, 34, 33, 62));
  const [showAll, setShowAll] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; moved: number } | null>(null);

  const { max, total, byFeature, ranked, points } = useMemo(() => {
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
    const rk = Array.from(positive.entries()).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    // Countries present in the data but absent from the polygon set
    // (Hong Kong, Singapore, Monaco…) — drawn as point markers.
    const matched = new Set(Array.from(byF.values()).map(x => x.a2));
    const pts: Array<{ a2: string; value: number; x: number; y: number }> = [];
    for (const [a2, v] of positive) {
      if (matched.has(a2) || !POINT_FALLBACK[a2]) continue;
      const xy = projection(POINT_FALLBACK[a2]);
      if (xy) pts.push({ a2, value: v, x: xy[0], y: xy[1] });
    }
    return { max: mx, total: tt, byFeature: byF, ranked: rk, points: pts };
  }, [data]);

  const rankOf = useMemo(() => new Map(ranked.map(([a2], i) => [a2, i + 1])), [ranked]);

  // Base-coordinate anchor of every country with data (polygon centroid, or
  // the point-fallback position) — used for the off-frame indicator.
  const anchors = useMemo(() => {
    const m = new Map<string, [number, number]>();
    for (const [, hit] of byFeature) {
      const f = A2_FEATURE.get(hit.a2);
      if (!f) continue;
      const c = path.centroid(f);
      if (isFinite(c[0]) && isFinite(c[1])) m.set(hit.a2, [c[0], c[1]]);
    }
    for (const pt of points) m.set(pt.a2, [pt.x, pt.y]);
    return m;
  }, [byFeature, points]);

  // Countries with data whose anchor is outside the current frame.
  const offFrame = useMemo(() => {
    if (t.k <= 1.01) return [] as Array<[string, number]>;
    const out: Array<[string, number]> = [];
    for (const [a2, v] of ranked) {
      const c = anchors.get(a2);
      if (!c) continue;
      const sx = t.x + t.k * c[0], sy = t.y + t.k * c[1];
      if (sx < 0 || sx > W || sy < 0 || sy > H) out.push([a2, v]);
    }
    return out;
  }, [ranked, anchors, t]);

  const top3Share = total ? (ranked.slice(0, 3).reduce((s, [, v]) => s + v, 0) / total) * 100 : 0;
  const homeShare = total && data.get('CH') ? ((data.get('CH') ?? 0) / total) * 100 : null;
  const bigMove = useMemo(() => {
    if (!prevData) return null;
    let best: { a2: string; d: number } | null = null;
    for (const a2 of new Set([...data.keys(), ...prevData.keys()])) {
      const d = (data.get(a2) ?? 0) - (prevData.get(a2) ?? 0);
      if (!best || Math.abs(d) > Math.abs(best.d)) best = { a2, d };
    }
    return best && best.d !== 0 ? best : null;
  }, [data, prevData]);

  // client px → base SVG coordinates (before the zoom transform). The svg
  // renders with preserveAspectRatio "slice", so the scale is the max of the
  // two axis ratios and the overflow is centered.
  const sliceScale = (r: DOMRect) => Math.max(r.width / W, r.height / H);
  const svgPoint = (clientX: number, clientY: number): [number, number] => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return [0, 0];
    const s = sliceScale(r);
    return [(clientX - r.left - (r.width - W * s) / 2) / s, (clientY - r.top - (r.height - H * s) / 2) / s];
  };

  const zoomBy = (factor: number, cx = W / 2, cy = H / 2) =>
    setT(prev => {
      const k = Math.min(MAX_K, Math.max(MIN_K, prev.k * factor));
      const f = k / prev.k;
      return clampT({ k, x: cx - (cx - prev.x) * f, y: cy - (cy - prev.y) * f });
    });

  // Wheel zoom needs a non-passive native listener (React's is passive).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const [cx, cy] = svgPoint(e.clientX, e.clientY);
      zoomBy(Math.pow(2, -e.deltaY * 0.0022), cx, cy);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const zoomToA2 = (a2: string) => {
    const f = A2_FEATURE.get(a2);
    if (f) {
      const [[x0, y0], [x1, y1]] = path.bounds(f);
      setT(fitBox(x0, y0, x1, y1, 14));
      return;
    }
    const ll = POINT_FALLBACK[a2];
    const p = ll ? projection(ll) : null;
    if (p) setT(clampT({ k: 12, x: W / 2 - 12 * p[0], y: H / 2 - 12 * p[1] }));
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const wr = wrapRef.current?.getBoundingClientRect();
    if (wr) setCursor({ x: e.clientX - wr.left, y: e.clientY - wr.top });
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const r = svgRef.current?.getBoundingClientRect();
    const s = r && r.width > 0 ? 1 / sliceScale(r) : 1;
    const dx = (e.clientX - d.x) * s, dy = (e.clientY - d.y) * s;
    d.moved += Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y);
    d.x = e.clientX; d.y = e.clientY;
    setT(prev => clampT({ ...prev, x: prev.x + dx, y: prev.y + dy }));
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };
  const wasDrag = () => (drag.current?.moved ?? 0) > 5;

  const clickCountry = (a2: string) => {
    if (wasDrag()) return;
    setPinned(p => (p === a2 ? null : a2));
  };
  const onDblClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const el = (e.target as Element).closest('[data-a2]');
    const a2 = el?.getAttribute('data-a2');
    if (a2) { setPinned(a2); zoomToA2(a2); }
    else setT(IDENTITY);
  };

  const sel = pinned ?? hover;

  const deltaChip = (a2: string) => {
    if (!prevData) return null;
    const now = data.get(a2) ?? 0;
    const before = prevData.get(a2) ?? 0;
    const d = now - before;
    if (d === 0) return <span className="text-brand-text-secondary">= {prevPeriodLabel || 'prev'}</span>;
    return (
      <span className={d > 0 ? 'text-status-green' : 'text-status-red'}>
        {d > 0 ? '▲' : '▼'} {fmt(Math.abs(d))} vs {prevPeriodLabel || 'prev'}
      </span>
    );
  };

  const showLabels = t.k >= 2.6;
  const labelSpots: Array<{ a2: string; value: number; x: number; y: number }> = useMemo(() => {
    if (!showLabels) return [];
    const out: Array<{ a2: string; value: number; x: number; y: number }> = [];
    for (const [, hit] of byFeature) {
      const f = A2_FEATURE.get(hit.a2);
      if (!f) continue;
      const [cx, cy] = path.centroid(f);
      if (isFinite(cx) && isFinite(cy)) out.push({ a2: hit.a2, value: hit.value, x: cx, y: cy });
    }
    return out.concat(points);
  }, [byFeature, points, showLabels]);

  const hoverTip = hover !== null && cursor && !drag.current && (
    <div className="pointer-events-none absolute z-10 rounded-md border border-efg-line bg-white shadow-lg px-2.5 py-1.5 text-[11px] leading-snug"
      style={{
        left: Math.min(cursor.x + 12, (wrapRef.current?.clientWidth ?? 400) - 190),
        top: cursor.y + 12, width: 178,
      }}>
      <p className="font-semibold text-[12px]">{flagOf(hover)} {countryName(hover)}</p>
      <p className="tabular-nums font-bold">{fmt(data.get(hover) ?? 0)} {unit}
        <span className="font-normal text-brand-text-secondary"> · {total ? (((data.get(hover) ?? 0) / total) * 100).toFixed(1) : '0'}%</span>
      </p>
      <p className="tabular-nums">{deltaChip(hover) ?? <span className="text-brand-text-secondary">{periodLabel || ''}</span>}</p>
      <p className="text-brand-text-secondary">#{rankOf.get(hover) ?? '—'} of {ranked.length} · click to pin</p>
    </div>
  );

  return (
    <div>
      {/* Stat chips — the headline numbers, before map or list */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-[11px] font-semibold text-brand-secondary bg-brand-bg-body rounded-full px-2.5 py-1">{ranked.length} countries</span>
        {ranked.length >= 3 && (
          <span className="text-[11px] font-semibold text-brand-secondary bg-brand-bg-body rounded-full px-2.5 py-1">Top 3 = {top3Share.toFixed(0)}% of assets</span>
        )}
        {homeShare !== null && (
          <span className="text-[11px] font-semibold text-brand-secondary bg-brand-bg-body rounded-full px-2.5 py-1">🇨🇭 Home share {homeShare.toFixed(1)}%</span>
        )}
        {bigMove && (
          <span className={`text-[11px] font-semibold rounded-full px-2.5 py-1 ${bigMove.d > 0 ? 'text-status-green bg-status-green/10' : 'text-status-red bg-status-red/10'}`}>
            Biggest move {flagOf(bigMove.a2)} {bigMove.d > 0 ? '+' : '−'}{fmt(Math.abs(bigMove.d))}
          </span>
        )}
      </div>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-5 lg:items-start">
      {/* Compact map vignette — right column on wide screens */}
      <div className="lg:col-start-2 lg:row-start-1">
      <div ref={wrapRef} className="relative min-w-0 h-[300px] lg:h-[340px] rounded-lg border border-efg-line overflow-hidden bg-brand-bg-body/30">
        {/* Region pills top-left, off-frame chip under them, zoom bottom-right */}
        <div className="absolute left-2 top-2 z-10 flex flex-wrap gap-1">
          {REGIONS.map(r => (
            <button key={r.id} onClick={() => setT(r.t())}
              className="px-2 py-0.5 rounded-full border border-gray-300 bg-white/95 shadow-sm text-[10px] font-semibold text-brand-text-secondary hover:text-brand-primary hover:border-brand-primary transition-colors">
              {r.label}
            </button>
          ))}
        </div>
        {offFrame.length > 0 && (
          <button onClick={() => setT(IDENTITY)} title="Countries outside the current frame — click for the world view"
            className="absolute left-2 top-9 z-10 px-2 py-0.5 rounded-full border border-gray-300 bg-white/95 shadow-sm text-[10px] font-semibold text-brand-secondary hover:text-brand-primary hover:border-brand-primary transition-colors">
            → {offFrame.slice(0, 3).map(([a2]) => flagOf(a2)).join(' ')}{offFrame.length > 3 ? ` +${offFrame.length - 3}` : ''} outside this frame · {fmt(offFrame.reduce((s, [, v]) => s + v, 0))} {unit}
          </button>
        )}
        <div className="absolute right-2 bottom-6 z-10 flex gap-1">
          {[['+', () => zoomBy(1.5)], ['−', () => zoomBy(1 / 1.5)], ['⤢', () => { setT(IDENTITY); setPinned(null); }]].map(([lbl, fn]) => (
            <button key={String(lbl)} onClick={fn as () => void} title={lbl === '⤢' ? 'Reset view' : lbl === '+' ? 'Zoom in' : 'Zoom out'}
              className="w-6 h-6 rounded-md border border-gray-300 bg-white/95 shadow-sm text-[12px] font-bold text-brand-text-secondary hover:text-brand-primary hover:border-brand-primary transition-colors">
              {String(lbl)}
            </button>
          ))}
        </div>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label="World map of exposures"
          className={`w-full h-full select-none touch-none ${drag.current ? 'cursor-grabbing' : 'cursor-grab'}`}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={onPointerUp} onPointerLeave={e => { onPointerUp(e); setCursor(null); setHover(null); }}
          onDoubleClick={onDblClick}>
          <g transform={`translate(${t.x},${t.y}) scale(${t.k})`}>
            <path d={path({ type: 'Sphere' }) ?? undefined} fill={PALETTE.bg} stroke={PALETTE.line} strokeWidth={1 / t.k} />
            {/* FEATURES is static, so index keys are stable (a few disputed
                territories share id=undefined — the id alone is not unique). */}
            {FEATURES.map((f, i) => {
              const hit = byFeature.get(String(f.id));
              const active = hit && sel === hit.a2;
              const v = hit ? Math.sqrt(Math.abs(hit.value) / max) : 0;
              return (
                <path key={`c-${i}`} d={path(f) ?? undefined}
                  data-a2={hit ? hit.a2 : undefined}
                  fill={hit ? PALETTE.slate : PALETTE.bg}
                  fillOpacity={hit ? 0.25 + 0.7 * v : 1}
                  stroke={active ? PALETTE.red : PALETTE.line}
                  strokeWidth={(active ? 1.6 : 0.6) / t.k}
                  onMouseEnter={() => setHover(hit ? hit.a2 : null)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => hit && clickCountry(hit.a2)} />
              );
            })}
            {/* Micro-territories without a polygon (HK, SG, MC…): point markers. */}
            {points.map(pt => {
              const r = (4 + 20 * Math.sqrt(Math.abs(pt.value) / max)) / t.k;
              return (
                <circle key={`p-${pt.a2}`} data-a2={pt.a2} cx={pt.x} cy={pt.y} r={r}
                  fill={PALETTE.red} fillOpacity={sel === pt.a2 ? 0.8 : 0.5}
                  stroke="#fff" strokeWidth={1 / t.k}
                  onMouseEnter={() => setHover(pt.a2)} onMouseLeave={() => setHover(null)}
                  onClick={() => clickCountry(pt.a2)} />
              );
            })}
            {/* Proportional bubbles kept at constant screen size while zooming. */}
            {FEATURES.map((f, i) => {
              const hit = byFeature.get(String(f.id));
              if (!hit) return null;
              const [cx, cy] = path.centroid(f);
              if (!isFinite(cx) || !isFinite(cy)) return null;
              const r = (4 + 20 * Math.sqrt(Math.abs(hit.value) / max)) / t.k;
              return (
                <circle key={`b-${i}`} cx={cx} cy={cy} r={r}
                  fill={PALETTE.red} fillOpacity={sel === hit.a2 ? 0.7 : 0.45}
                  stroke="#fff" strokeWidth={1 / t.k} className="pointer-events-none" />
              );
            })}
            {/* Value labels appear once zoomed in enough to read them. */}
            {labelSpots.map(l => (
              <text key={`t-${l.a2}`} x={l.x} y={l.y - (6 + 20 * Math.sqrt(Math.abs(l.value) / max)) / t.k}
                textAnchor="middle" className="pointer-events-none"
                fontSize={11 / t.k} fontWeight={600} fill={PALETTE.ink}
                stroke="#fff" strokeWidth={3 / t.k} paintOrder="stroke">
                {l.a2} · {fmt(l.value)}
              </text>
            ))}
          </g>
        </svg>
        {hoverTip}
        <p className="absolute left-2 bottom-1 z-10 text-[10px] text-brand-text-secondary pointer-events-none">
          Scroll to zoom · drag to pan · double-click to frame · {t.k > 1.01 ? `${t.k.toFixed(1)}×` : '1×'}
        </p>
      </div>
      </div>

      {/* Country ranking — the analysis lives here; the selected country
          expands in place with its per-rubrique breakdown. */}
      <div className="lg:col-start-1 lg:row-start-1 mt-4 lg:mt-0 min-w-0">
        {ranked.length === 0 ? (
          <p className="text-[12px] text-brand-text-secondary">No geographic data for this period.</p>
        ) : (
          <div>
            <div className="grid grid-cols-[24px_minmax(110px,150px)_minmax(0,1fr)_78px_74px] gap-2 items-center px-2 pb-1.5 border-b border-efg-line text-[9.5px] uppercase tracking-[0.1em] font-semibold text-brand-text-secondary">
              <span>#</span><span>Country</span><span>Share of assets</span><span className="text-right">{unit}</span><span className="text-right">Δ vs {prevPeriodLabel || 'prev'}</span>
            </div>
            {(showAll ? ranked : ranked.slice(0, 7)).map(([a2, v], i) => {
              const share = total ? (v / total) * 100 : 0;
              const maxShare = total && ranked[0] ? Math.abs((ranked[0][1] / total) * 100) : 100;
              const isSel = pinned === a2;
              const d = prevData ? v - (prevData.get(a2) ?? 0) : null;
              const row = (
                <div className="grid grid-cols-[24px_minmax(110px,150px)_minmax(0,1fr)_78px_74px] gap-2 items-center text-[12px]">
                  <span className={`font-semibold ${isSel ? 'text-brand-primary' : 'text-brand-text-secondary'}`}>{i + 1}</span>
                  <span className="truncate" title={a2 ? countryName(a2) : 'Unassigned'}>
                    {a2 ? `${flagOf(a2)} ` : '🌐 '}
                    <span className={isSel || i === 0 ? 'font-bold' : ''}>{a2 ? countryName(a2) : 'Unassigned'}</span>
                  </span>
                  <span className="flex items-center gap-2 min-w-0">
                    <span className={`flex-grow h-[7px] rounded-full overflow-hidden ${isSel ? 'bg-white/80 dark:bg-white/15' : 'bg-brand-bg-body'}`}>
                      <span className={`block h-full ${isSel ? 'bg-brand-primary' : 'bg-brand-secondary'}`}
                        style={{ width: `${Math.min(100, (Math.abs(share) / Math.max(1, maxShare)) * 100)}%` }} />
                    </span>
                    <span className="text-[10.5px] text-brand-text-secondary tabular-nums w-10 text-right">{share.toFixed(1)}%</span>
                  </span>
                  <span className="text-right tabular-nums font-semibold">{fmt(v)}</span>
                  <span className={`text-right tabular-nums text-[11.5px] ${d === null || d === 0 ? 'text-brand-accent' : d > 0 ? 'text-status-green font-bold' : 'text-status-red font-bold'}`}>
                    {d === null ? '—' : d === 0 ? '=' : `${d > 0 ? '▲' : '▼'} ${fmt(Math.abs(d))}`}
                  </span>
                </div>
              );
              const det = isSel && detailOf ? detailOf(a2) : null;
              return isSel ? (
                <div key={a2 || '—'} className="my-0.5 rounded-lg border border-brand-primary/25 bg-brand-primary/5 px-2 py-1.5">
                  <button type="button" className="w-full text-left" onClick={() => setPinned(null)}
                    onMouseEnter={() => setHover(a2)} onMouseLeave={() => setHover(null)}>
                    {row}
                  </button>
                  {det && det.length > 0 && (
                    <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5 mt-1.5 pl-6 pr-2 pb-1">
                      {det.map(dr => {
                        const dmax = Math.max(1, ...det.map(x => Math.abs(x.now)));
                        const dd = dr.prev !== undefined ? dr.now - dr.prev : null;
                        return (
                          <div key={dr.k}>
                            <div className="flex justify-between gap-2 text-[10.5px]">
                              <span className="truncate" title={dr.label || dr.k}><b>{dr.k}</b>{dr.label ? ` ${dr.label}` : ''}</span>
                              <span className="tabular-nums whitespace-nowrap">
                                {fmt(dr.now)}
                                {dd !== null && dd !== 0 && (
                                  <span className={`ml-1 font-semibold ${dd > 0 ? 'text-status-green' : 'text-status-red'}`}>{dd > 0 ? '▲' : '▼'}{fmt(Math.abs(dd))}</span>
                                )}
                              </span>
                            </div>
                            <div className="h-1 rounded-full bg-white/85 dark:bg-white/15 overflow-hidden">
                              <div className="h-full bg-brand-secondary" style={{ width: `${Math.min(100, (Math.abs(dr.now) / dmax) * 100)}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex gap-3 pl-6 pb-0.5 pt-0.5">
                    <button onClick={() => a2 && zoomToA2(a2)}
                      className="text-[10.5px] font-semibold text-brand-text-secondary hover:text-brand-primary transition-colors">🔍 Zoom to country</button>
                    <button onClick={() => setPinned(null)}
                      className="text-[10.5px] font-semibold text-brand-text-secondary hover:text-brand-primary transition-colors">✕ close</button>
                  </div>
                </div>
              ) : (
                <button key={a2 || '—'} type="button"
                  onMouseEnter={() => setHover(a2)} onMouseLeave={() => setHover(null)}
                  onClick={() => { setPinned(a2); if (a2) zoomToA2(a2); }}
                  className={`w-full text-left px-2 py-[7px] border-b border-efg-line/60 transition-colors ${hover === a2 ? 'bg-brand-primary/5' : ''}`}>
                  {row}
                </button>
              );
            })}
            <div className="flex flex-wrap items-center justify-between gap-2 px-2 pt-2 text-[11px] text-brand-text-secondary">
              {ranked.length > 7 ? (
                <button onClick={() => setShowAll(s => !s)}
                  className="font-semibold text-brand-secondary hover:text-brand-primary transition-colors whitespace-nowrap">
                  {showAll ? '− show top 7 only ▴' : `＋ ${ranked.length - 7} more · ${fmt(ranked.slice(7).reduce((s, [, v]) => s + v, 0))} ${unit} ▾`}
                </button>
              ) : <span />}
              <span>{unit} · click a row or a bubble to pin{periodLabel ? ` · ${periodLabel}` : ''}{prevPeriodLabel ? ` vs ${prevPeriodLabel} ✔` : ''}</span>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};
