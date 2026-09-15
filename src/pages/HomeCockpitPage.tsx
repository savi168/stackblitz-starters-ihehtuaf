import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useScope } from '../context/ScopeContext';
import { Card, SectionHeader } from '../components';

/**
 * v3.21 Home — the close cockpit (validated mockup): where the monthly close
 * stands at a glance. Pipeline Scope → Data → Controls → Reco → Certify,
 * KPIs, upcoming deadlines and the recent audit trail. The old module-cards
 * hub stays available at /hub (nothing removed).
 */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const periodLabel = (iso: string): string => {
  const m = iso.match(/^(\d{4})-(\d{2})/);
  return m ? `${MONTHS[Number(m[2]) - 1]}-${m[1].slice(2)}` : iso;
};
const fmtM = (n: number) => (n / 1_000_000).toLocaleString('en-CH', { maximumFractionDigits: 1 });

type BizEntry = { id: number; at: string; userName: string; dataset: string; action: string; details: string };

const StepDot: React.FC<{ state: 'done' | 'active' | 'todo'; label: string }> = ({ state, label }) => (
  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
    state === 'done' ? 'bg-status-green text-white'
    : state === 'active' ? 'bg-status-amber text-white'
    : 'bg-white border-2 border-brand-accent text-brand-text-secondary'
  }`}>{state === 'done' ? '✓' : label}</span>
);

export const HomeCockpitPage: React.FC = () => {
  const { data, mode, apiBaseUrl, isAdmin, currentUser } = useData();
  const scope = useScope();
  const [assets, setAssets] = useState<number | null>(null);
  const [activity, setActivity] = useState<BizEntry[]>([]);
  const fetched = useRef('');

  // Total booked assets of the selected scope (one aggregate call, cached).
  useEffect(() => {
    if (mode !== 'api' || scope.scopeLoadIds.length === 0) return;
    const key = scope.scopeLoadIds.join(',');
    if (fetched.current === key) return;
    fetched.current = key;
    const qs = scope.scopeLoadIds.length > 1
      ? `loadIds=${encodeURIComponent(key)}` : `loadId=${encodeURIComponent(scope.scopeLoadIds[0])}`;
    fetch(`${apiBaseUrl}/production/mercury/balance?${qs}`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then((rows: Array<{ prefix?: string; amount?: number }> | null) => {
        if (!rows) return;
        setAssets(rows.filter(r => String(r.prefix || '').startsWith('1')).reduce((s, r) => s + (r.amount || 0), 0));
      })
      .catch(() => { /* tile stays empty */ });
  }, [mode, apiBaseUrl, scope.scopeLoadIds]);

  useEffect(() => {
    if (mode !== 'api' || !isAdmin) return;
    fetch(`${apiBaseUrl}/logs/business?take=5`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : []))
      .then(l => setActivity(Array.isArray(l) ? l.slice(0, 5) : []))
      .catch(() => setActivity([]));
  }, [mode, apiBaseUrl, isAdmin]);

  const certified = scope.entity && scope.period
    ? (data.prodBaselines || []).some(b => b.entity === scope.entity && b.date === scope.period)
    : false;
  const hasData = scope.scopeLoadIds.length > 0;
  const baselines = (data.prodBaselines || []).filter(b => b.entity === scope.entity);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (data.deadlines || [])
    .filter(d => d.status !== 'completed' && (d.dueDate || '') >= today)
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
    .slice(0, 4);
  const daysTo = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  const nextDl = upcoming[0];

  const shortName = (currentUser.name.split('\\').pop() || currentUser.name).split(/[.\s]/)[0];
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="p-5 md:p-8 space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-efg-line pb-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-light tracking-tight">{greeting}{shortName !== 'local' ? `, ${shortName}` : ''}</h1>
          <p className="text-base text-brand-text-secondary mt-2 font-light">
            {scope.period
              ? `${periodLabel(scope.period)} close ${certified ? 'is certified ✔' : 'is in progress'} — here is where it stands.`
              : mode === 'api' ? 'No load collection visible yet — check the MERCURY connection (☰ → Logs).' : 'Local mode — connect the API backend for the close cockpit.'}
          </p>
        </div>
        {nextDl && (
          <span className="inline-flex items-center gap-2 bg-white border border-efg-line rounded-full px-4 py-1.5 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-status-amber" />
            {nextDl.name} due in {daysTo(nextDl.dueDate)} day{daysTo(nextDl.dueDate) > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {isAdmin && (
        <Card>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <h2 className="text-[15px] font-semibold">
              Monthly close{scope.period ? ` — ${periodLabel(scope.period)} · ${scope.entity}` : ''}
            </h2>
            <Link to="/production"
              className="ml-auto text-xs font-semibold bg-brand-primary text-white rounded-lg px-4 py-2 hover:bg-brand-primary-dark transition-colors">
              {certified ? 'Open the production line' : 'Continue the close →'}
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-2 gap-y-4">
            {([
              ['Scope', scope.entity ? 'done' : 'todo', scope.entity ? `${scope.entity} selected` : 'pick an entity', '/production'],
              ['Data', hasData ? 'done' : 'todo', hasData ? `${scope.scopeLoadIds.length} load(s) in collection` : 'no visible loads', '/production'],
              ['Controls', certified ? 'done' : hasData ? 'active' : 'todo', certified ? 'battery passed' : 'run the battery C1–C5', '/production'],
              ['Reco', certified ? 'done' : 'todo', 'adjustments & live balance', '/production/reco'],
              ['Certify', certified ? 'done' : 'todo', certified ? 'baseline stored ✔' : 'baseline + evidence pack', '/production'],
            ] as Array<[string, 'done' | 'active' | 'todo', string, string]>).map(([label, state, sub, to], i) => (
              <Link key={label} to={to} className="group">
                <div className="flex items-center gap-2">
                  <StepDot state={state} label={String(i + 1)} />
                  {i < 4 && <span className={`hidden sm:block flex-1 h-0.5 ${state === 'done' ? 'bg-status-green' : 'bg-efg-line'}`} />}
                </div>
                <p className={`text-xs font-semibold mt-1.5 group-hover:text-brand-primary transition-colors ${state === 'active' ? 'text-status-amber' : ''}`}>{label}</p>
                <p className="text-[10.5px] text-brand-text-secondary">{sub}</p>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="!p-4">
          <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-brand-text-secondary">Total assets (booked)</p>
          <p className="text-2xl font-bold mt-1 tabular-nums text-brand-primary">{assets !== null ? `${fmtM(assets)} mCHF` : '—'}</p>
          <p className="text-[11px] text-brand-text-secondary">{scope.period ? `${periodLabel(scope.period)} · ${scope.entity}` : 'needs the MERCURY connection'}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-brand-text-secondary">Certified baselines</p>
          <p className="text-2xl font-bold mt-1 tabular-nums">{baselines.length}</p>
          <p className="text-[11px] text-brand-text-secondary">{scope.entity || '—'} · latest {baselines.length > 0 ? periodLabel([...baselines].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0].date) : 'none yet'}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-brand-text-secondary">Periods available</p>
          <p className="text-2xl font-bold mt-1 tabular-nums">{scope.periods.length}</p>
          <p className="text-[11px] text-brand-text-secondary">load collections for {scope.entity || '—'}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-brand-text-secondary">Next deadline</p>
          <p className={`text-2xl font-bold mt-1 tabular-nums ${nextDl && daysTo(nextDl.dueDate) <= 7 ? 'text-status-amber' : ''}`}>
            {nextDl ? `${daysTo(nextDl.dueDate)} d` : '—'}
          </p>
          <p className="text-[11px] text-brand-text-secondary truncate">{nextDl ? `${nextDl.name} · ${nextDl.dueDate}` : 'nothing due'}</p>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <SectionHeader title="Upcoming deadlines" suffix={isAdmin ? 'full calendar in Monthly close' : ''} />
          {upcoming.length === 0 ? (
            <p className="text-sm text-brand-text-secondary">Nothing due — the calendar is clear.</p>
          ) : (
            <div className="divide-y divide-efg-line/70">
              {upcoming.map(d => (
                <div key={d.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${daysTo(d.dueDate) <= 7 ? 'bg-status-amber' : 'bg-brand-accent'}`} />
                  <span className="font-semibold truncate">{d.name}</span>
                  <span className="text-xs text-brand-text-secondary shrink-0">{d.entity}</span>
                  <span className="ml-auto text-xs text-brand-text-secondary tabular-nums shrink-0">{d.dueDate} · J−{daysTo(d.dueDate)}</span>
                </div>
              ))}
            </div>
          )}
          {isAdmin && <Link to="/deadlines" className="inline-block mt-3 text-xs font-semibold text-brand-secondary hover:underline">Open the calendar →</Link>}
        </Card>
        <Card>
          <SectionHeader title="Recent activity" suffix="business audit trail" />
          {activity.length === 0 ? (
            <p className="text-sm text-brand-text-secondary">{mode === 'api' ? 'No recorded change yet.' : 'Available with the API backend.'}</p>
          ) : (
            <div className="divide-y divide-efg-line/70">
              {activity.map(a => (
                <div key={a.id} className="flex items-start gap-3 py-2.5 text-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary bg-brand-bg-body rounded px-1.5 py-0.5 shrink-0 mt-0.5">{a.action}</span>
                  <span className="min-w-0">
                    <span className="font-semibold">{a.dataset}</span>
                    <span className="block text-xs text-brand-text-secondary truncate">{a.details}</span>
                  </span>
                  <span className="ml-auto text-[11px] text-brand-text-secondary tabular-nums shrink-0">{String(a.at).slice(11, 16) || String(a.at).slice(0, 10)}</span>
                </div>
              ))}
            </div>
          )}
          {isAdmin && <Link to="/logs" className="inline-block mt-3 text-xs font-semibold text-brand-secondary hover:underline">All logs →</Link>}
        </Card>
      </div>

      <p className="text-[11px] text-brand-text-secondary">
        Every module lives in the left navigation, grouped by domain. The period &amp; entity in the top bar are the global production scope.
        {' '}<Link to="/hub" className="text-brand-secondary hover:underline font-semibold">Classic modules overview →</Link>
      </p>
    </div>
  );
};

export default HomeCockpitPage;
