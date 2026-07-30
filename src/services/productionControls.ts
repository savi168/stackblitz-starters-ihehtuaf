import { ProdCounterpartyRecord, ProdDataset, ProdGuaranteeRef, ProdSecurityRecord } from '../types';

/**
 * Production consistency controls: verify that counterparties and securities
 * receive the SAME treatment period over period, across datasets, and versus
 * the Grouplexid guarantee/HQLA reference (e.g. a KFW bond is guaranteed by
 * the German government → expected HQLA level L1).
 */

export const PROD_DATASETS: Array<{ key: ProdDataset; label: string }> = [
  { key: 'liquidityAssets', label: 'Liquidity assets' },
  { key: 'dueFromBanks', label: 'Due from banks' },
  { key: 'dueToBanks', label: 'Due to banks' },
  { key: 'dueFromCustomers', label: 'Due from customers' },
  { key: 'dueToCustomers', label: 'Due to customers' },
  { key: 'mortgages', label: 'Mortgages' },
];

export interface ControlFinding {
  severity: 'error' | 'warning' | 'info';
  control: string;
  key: string;     // client number / ISIN / grouplexid
  dataset?: string;
  message: string;
}

const diffAttrs = <T extends object>(a: T, b: T, fields: Array<[keyof T, string]>): string[] =>
  fields
    .filter(([f]) => String(a[f] ?? '') !== String(b[f] ?? '') && (a[f] !== undefined || b[f] !== undefined))
    .map(([f, label]) => `${label}: "${a[f] ?? '—'}" → "${b[f] ?? '—'}"`);

/** C1 — Counterparty attribute drift between two periods, per dataset & client. */
export const runCounterpartyDrift = (
  records: ProdCounterpartyRecord[], entity: string, dateA: string, dateB: string
): ControlFinding[] => {
  const findings: ControlFinding[] = [];
  for (const { key: dataset, label } of PROD_DATASETS) {
    const at = (d: string) => new Map(records
      .filter(r => r.entity === entity && r.date === d && r.dataset === dataset)
      .map(r => [r.clientNumber, r]));
    const mapA = at(dateA), mapB = at(dateB);
    if (mapA.size === 0 && mapB.size === 0) continue;
    for (const [client, b] of mapB) {
      const a = mapA.get(client);
      if (!a) { findings.push({ severity: 'info', control: 'C1 drift', dataset: label, key: client, message: `New client in ${label} (${b.clientType || '—'}, ${b.groupLexId || '—'})` }); continue; }
      const diffs = diffAttrs(a, b, [
        ['clientType', 'client type'], ['groupLexId', 'grouplexid'],
        ['counterpartyType', 'counterparty type'], ['issuerRating', 'issuer rating'],
      ]);
      if (diffs.length > 0) {
        findings.push({ severity: 'warning', control: 'C1 drift', dataset: label, key: client, message: diffs.join(' · ') });
      }
    }
    for (const client of mapA.keys()) {
      if (!mapB.has(client)) findings.push({ severity: 'info', control: 'C1 drift', dataset: label, key: client, message: `Client disappeared from ${label}` });
    }
  }
  return findings;
};

/** C2 — Cross-dataset consistency in ONE period: a grouplexid / client must not carry different types across datasets. */
export const runCrossDataset = (
  records: ProdCounterpartyRecord[], entity: string, date: string
): ControlFinding[] => {
  const findings: ControlFinding[] = [];
  const period = records.filter(r => r.entity === entity && r.date === date);
  const byLex = new Map<string, ProdCounterpartyRecord[]>();
  period.forEach(r => { if (r.groupLexId) byLex.set(r.groupLexId, [...(byLex.get(r.groupLexId) || []), r]); });
  for (const [lex, rows] of byLex) {
    const types = new Set(rows.map(r => r.counterpartyType).filter(Boolean));
    if (types.size > 1) {
      findings.push({
        severity: 'error', control: 'C2 cross-dataset', key: lex,
        message: `Grouplexid classified with ${types.size} different counterparty types in ${dsList(rows)}: ${Array.from(types).join(' / ')}`,
      });
    }
    const ratings = new Set(rows.map(r => r.issuerRating).filter(Boolean));
    if (ratings.size > 1) {
      findings.push({
        severity: 'warning', control: 'C2 cross-dataset', key: lex,
        message: `Different issuer ratings for the same grouplexid in ${dsList(rows)}: ${Array.from(ratings).join(' / ')}`,
      });
    }
  }
  return findings;
};

const dsList = (rows: ProdCounterpartyRecord[]): string =>
  Array.from(new Set(rows.map(r => PROD_DATASETS.find(d => d.key === r.dataset)?.label || r.dataset))).join(', ');

/** C3 — Security attribute drift between two periods, per ISIN. */
export const runSecurityDrift = (
  secs: ProdSecurityRecord[], entity: string, dateA: string, dateB: string
): ControlFinding[] => {
  const findings: ControlFinding[] = [];
  const at = (d: string) => new Map(secs.filter(s => s.entity === entity && s.date === d).map(s => [s.isin, s]));
  const mapA = at(dateA), mapB = at(dateB);
  for (const [isin, b] of mapB) {
    const a = mapA.get(isin);
    if (!a) { findings.push({ severity: 'info', control: 'C3 security drift', key: isin, message: `New security (${b.securityType || '—'}, HQLA ${b.hqlaLevel || '—'})` }); continue; }
    const diffs = diffAttrs(a, b, [
      ['securityMaster', 'security master'], ['securityType', 'type'], ['rating', 'rating'],
      ['dailyReval', 'daily reval'], ['issuerLexId', 'issuer lexid'],
      ['guarantorLexId', 'guarantor lexid'], ['hqlaLevel', 'HQLA level'],
    ]);
    if (diffs.length > 0) {
      const grave = diffs.some(d => d.startsWith('HQLA level'));
      findings.push({ severity: grave ? 'error' : 'warning', control: 'C3 security drift', key: isin, message: diffs.join(' · ') });
    }
  }
  for (const isin of mapA.keys()) {
    if (!mapB.has(isin)) findings.push({ severity: 'info', control: 'C3 security drift', key: isin, message: 'Security disappeared' });
  }
  return findings;
};

/** C5 — Orphan positions: the MERCURY feed emits records with empty
 * ClientType/GroupLexId when the resolved counterparty (issuer for securities)
 * was not found in list_counterparties at the load's point in time. */
export const runOrphans = (
  records: ProdCounterpartyRecord[], entity: string, date: string
): ControlFinding[] =>
  records
    .filter(r => r.entity === entity && r.date === date && !r.groupLexId && !r.clientType)
    .map(r => ({
      severity: 'error' as const,
      control: 'C5 orphans',
      dataset: PROD_DATASETS.find(d => d.key === r.dataset)?.label || r.dataset,
      key: r.clientNumber,
      message: `No counterparty found in list_counterparties at the load PIT` +
        (r.amount !== undefined ? ` — amount ${r.amount.toFixed(1)} mn${r.currency ? ` ${r.currency}` : ''}` : ''),
    }));

/** C4 — Securities vs the Grouplexid guarantee/HQLA reference (expected treatment). */
export const runSecurityVsRef = (
  secs: ProdSecurityRecord[], refs: ProdGuaranteeRef[], entity: string, date: string
): ControlFinding[] => {
  const findings: ControlFinding[] = [];
  const refByLex = new Map(refs.map(r => [r.groupLexId, r]));
  for (const s of secs.filter(x => x.entity === entity && x.date === date)) {
    const ref = (s.issuerLexId && refByLex.get(s.issuerLexId)) || (s.guarantorLexId && refByLex.get(s.guarantorLexId)) || undefined;
    if (!ref) continue;
    if (ref.guarantorLexId && s.guarantorLexId && ref.guarantorLexId !== s.guarantorLexId) {
      findings.push({
        severity: 'error', control: 'C4 vs reference', key: s.isin,
        message: `Guarantor mismatch: reference says ${ref.guarantorName || ref.guarantorLexId} for ${ref.name || ref.groupLexId}, data carries ${s.guarantorName || s.guarantorLexId}`,
      });
    } else if (ref.guarantorLexId && !s.guarantorLexId) {
      findings.push({
        severity: 'warning', control: 'C4 vs reference', key: s.isin,
        message: `Missing guarantor: ${ref.name || ref.groupLexId} is expected to be guaranteed by ${ref.guarantorName || ref.guarantorLexId}`,
      });
    }
    if (ref.expectedHqlaLevel && (s.hqlaLevel || '') !== ref.expectedHqlaLevel) {
      findings.push({
        severity: 'error', control: 'C4 vs reference', key: s.isin,
        message: `HQLA level "${s.hqlaLevel || '—'}" differs from expected "${ref.expectedHqlaLevel}" (${ref.name || ref.groupLexId}${ref.notes ? ` — ${ref.notes}` : ''})`,
      });
    }
  }
  return findings;
};
