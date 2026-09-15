import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useData } from './DataContext';

/**
 * Global production scope (v3.21 architecture): the reporting period and
 * entity picked ONCE in the top bar. Phase 1 exposes the selection (persisted
 * per browser) and the reference lists; pages keep their own selectors for
 * now and will be wired to this context progressively.
 */

export type ScopeCollection = {
  loadCollectionId: number | string;
  name?: string | null;
  reportingDate?: string | null;
  reportingEntityId?: string | null;
  isMaster?: boolean;
  loadIds: Array<number | string>;
};

interface GlobalScope {
  /** Reporting entity id (consolidation level), '' when unknown. */
  entity: string;
  setEntity: (e: string) => void;
  /** Reporting date YYYY-MM-DD of the selected period, '' when unknown. */
  period: string;
  setPeriod: (p: string) => void;
  /** Entities that carry load collections (fallback: conso entities). */
  entities: Array<{ id: string; name?: string }>;
  /** Reporting dates available for the selected entity, most recent first. */
  periods: string[];
  /** Raw collections (MERCURY core_load_collections), all entities. */
  collections: ScopeCollection[];
  /** Loads of the selected entity+period (master collection preferred). */
  scopeLoadIds: string[];
  /** True once the MERCURY lists answered (api mode only). */
  ready: boolean;
}

const ScopeCtx = createContext<GlobalScope>({
  entity: '', setEntity: () => {}, period: '', setPeriod: () => {},
  entities: [], periods: [], collections: [], scopeLoadIds: [], ready: false,
});

const LS_KEY = 'regreport-global-scope';

export const ScopeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { mode, apiBaseUrl } = useData();
  const [collections, setCollections] = useState<ScopeCollection[]>([]);
  const [consoEntities, setConsoEntities] = useState<Array<{ id: string; name?: string }>>([]);
  const [ready, setReady] = useState(false);
  const [sel, setSel] = useState<{ entity: string; period: string }>(() => {
    try { return { entity: '', period: '', ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') }; }
    catch { return { entity: '', period: '' }; }
  });

  useEffect(() => {
    if (mode !== 'api') return;
    let cancelled = false;
    fetch(`${apiBaseUrl}/production/mercury/load-collections`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : []))
      .then(l => {
        if (cancelled) return;
        setCollections(Array.isArray(l)
          ? l.map((c: ScopeCollection) => ({ ...c, loadIds: Array.isArray(c.loadIds) ? c.loadIds : [] }))
          : []);
        setReady(true);
      })
      .catch(() => setReady(true));
    fetch(`${apiBaseUrl}/production/mercury/conso`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(out => {
        if (cancelled || !out) return;
        setConsoEntities((out.entities || []).map((e: { id: unknown; name?: unknown }) => ({
          id: String(e.id), name: e.name ? String(e.name) : undefined,
        })));
      })
      .catch(() => { /* unavailable */ });
    return () => { cancelled = true; };
  }, [mode, apiBaseUrl]);

  const entities = useMemo(() => {
    const withCols = Array.from(new Set(collections.map(c => String(c.reportingEntityId ?? '')).filter(Boolean))).sort();
    if (withCols.length === 0) return consoEntities;
    return withCols.map(id => ({ id, name: consoEntities.find(e => e.id === id)?.name }));
  }, [collections, consoEntities]);

  const entity = entities.some(e => e.id === sel.entity) ? sel.entity : (entities[0]?.id || '');

  const periods = useMemo(() => Array.from(new Set(
    collections
      .filter(c => String(c.reportingEntityId ?? '') === entity && (c.loadIds || []).length > 0)
      .map(c => String(c.reportingDate ?? '').slice(0, 10))
      .filter(Boolean),
  )).sort().reverse(), [collections, entity]);

  const period = periods.includes(sel.period) ? sel.period : (periods[0] || '');

  const scopeLoadIds = useMemo(() => {
    const cands = collections.filter(c =>
      String(c.reportingEntityId ?? '') === entity &&
      String(c.reportingDate ?? '').slice(0, 10) === period &&
      (c.loadIds || []).length > 0);
    const master = cands.find(c => c.isMaster) ?? cands[0];
    return master ? master.loadIds.map(String) : [];
  }, [collections, entity, period]);

  const persist = (next: { entity: string; period: string }) => {
    setSel(next);
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* no storage */ }
  };

  const value: GlobalScope = {
    entity, setEntity: e => persist({ entity: e, period: sel.period }),
    period, setPeriod: p => persist({ entity: sel.entity || entity, period: p }),
    entities, periods, collections, scopeLoadIds, ready,
  };
  return <ScopeCtx.Provider value={value}>{children}</ScopeCtx.Provider>;
};

export const useScope = (): GlobalScope => useContext(ScopeCtx);
