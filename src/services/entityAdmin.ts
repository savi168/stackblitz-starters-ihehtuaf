import { CentralData as AppData, DiagnosisResult } from '../types';

/**
 * Entity administration: the entity is a free-text string repeated across a
 * dozen datasets. Renaming must cascade everywhere at once — these helpers
 * inventory the usages, detect merge collisions and apply the rename on the
 * whole central-data document (one transactional PUT server-side).
 * Library documents are tagged/foldered separately and are handled by the
 * caller through the documents API.
 */

type EntityRow = { entity: string };
const DATASETS: Array<[label: string, get: (d: AppData) => EntityRow[] | undefined]> = [
  ['KPI history', d => d.kpisHistory],
  ['Capital reports', d => d.capitalReports],
  ['LCR reports', d => d.lcrReports],
  ['NSFR reports', d => d.nsfrReports],
  ['Financial statements', d => d.finStatements],
  ['Scenarios', d => d.scenarios],
  ['Large exposures', d => d.largeExposures],
  ['Counterparty RWA', d => d.counterpartyRwa],
  ['Deadlines', d => d.deadlines],
  ['Production counterparties', d => d.prodCounterparties],
  ['Production securities', d => d.prodSecurities],
  ['Production decisions', d => d.prodFindingLogs],
  ['Bridge adjustments', d => d.bridgeAdjustments],
];

export interface EntityUsage {
  entity: string;
  /** [dataset label, row count] for datasets that reference the entity. */
  counts: Array<[string, number]>;
  total: number;
  hasRiskAppetite: boolean;
}

export const entityUsages = (data: AppData): EntityUsage[] => {
  const map = new Map<string, EntityUsage>();
  const of = (entity: string): EntityUsage => {
    let u = map.get(entity);
    if (!u) map.set(entity, u = { entity, counts: [], total: 0, hasRiskAppetite: false });
    return u;
  };
  for (const [label, get] of DATASETS) {
    const byEntity = new Map<string, number>();
    for (const row of get(data) || []) {
      if (row.entity) byEntity.set(row.entity, (byEntity.get(row.entity) || 0) + 1);
    }
    for (const [entity, n] of byEntity) {
      const u = of(entity);
      u.counts.push([label, n]);
      u.total += n;
    }
  }
  for (const entity of Object.keys(data.riskAppetite || {})) of(entity).hasRiskAppetite = true;
  return Array.from(map.values()).sort((a, b) => a.entity.localeCompare(b.entity));
};

/**
 * Rows that would violate a server-side unique index if `from` were merged
 * into an already-existing entity `to` (same entity+date keys). Non-empty
 * result = the rename must be refused.
 */
export const renameCollisions = (data: AppData, from: string, to: string): string[] => {
  const issues: string[] = [];
  const check = <T extends EntityRow>(label: string, list: T[] | undefined, key: (x: T) => string) => {
    if (!list) return;
    const target = new Set(list.filter(x => x.entity === to).map(key));
    const n = list.filter(x => x.entity === from && target.has(key(x))).length;
    if (n > 0) issues.push(`${label}: ${n} row(s) exist for both entities on the same key`);
  };
  check('KPI history', data.kpisHistory, x => x.date);
  check('Capital reports', data.capitalReports, x => x.date);
  check('LCR reports', data.lcrReports, x => `${x.date}|${x.currency}`);
  check('NSFR reports', data.nsfrReports, x => x.date);
  check('Financial statements', data.finStatements, x => `${x.date}|${x.kind}|${x.gaap || ''}`);
  return issues;
};

/** Applies the rename across every dataset of the central data document. */
export const renameEntity = (data: AppData, from: string, to: string): AppData => {
  const mv = <T extends EntityRow>(list: T[]): T[] =>
    list.map(x => x.entity === from ? { ...x, entity: to } : x);
  const mvOpt = <T extends EntityRow>(list: T[] | undefined): T[] | undefined =>
    list ? mv(list) : undefined;

  const next: AppData = {
    ...data,
    kpisHistory: mv(data.kpisHistory),
    largeExposures: mv(data.largeExposures),
    counterpartyRwa: mv(data.counterpartyRwa),
    deadlines: mv(data.deadlines),
    capitalReports: mvOpt(data.capitalReports),
    lcrReports: mvOpt(data.lcrReports),
    nsfrReports: mvOpt(data.nsfrReports),
    finStatements: mvOpt(data.finStatements),
    scenarios: mvOpt(data.scenarios),
    prodCounterparties: mvOpt(data.prodCounterparties),
    prodSecurities: mvOpt(data.prodSecurities),
    prodFindingLogs: mvOpt(data.prodFindingLogs),
    bridgeAdjustments: mvOpt(data.bridgeAdjustments),
  };

  // Risk appetite: dictionary keyed by entity (existing target thresholds win
  // field by field only where the source has none).
  if (data.riskAppetite[from]) {
    const { [from]: moved, ...rest } = data.riskAppetite;
    next.riskAppetite = { ...rest, [to]: { ...moved, ...(data.riskAppetite[to] || {}) } };
  }

  // Diagnosis results: keys are "entity|date".
  if (data.diagnosisResults) {
    const d: Record<string, DiagnosisResult[]> = {};
    for (const [k, v] of Object.entries(data.diagnosisResults)) {
      d[k.startsWith(`${from}|`) ? `${to}|${k.slice(from.length + 1)}` : k] = v;
    }
    next.diagnosisResults = d;
  }
  return next;
};

/** New folder path for a Library document when an entity is renamed:
 * every exact path segment equal to the old name is replaced. */
export const renameFolderEntity = (folder: string, from: string, to: string): string =>
  folder.split('/').map(seg => seg === from ? to : seg).join('/');
