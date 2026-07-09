import * as XLSX from 'xlsx';
import { ImportMapping } from '../types';
import { resolveMapping } from './importMapping';

/**
 * Template re-scan: given a NEW (possibly blank) FINMA/SNB template workbook,
 * re-derive the import mapping automatically — no code change, no manual
 * mapping edits. Strategy per mapped concept:
 *   1. keep the current code if it still exists in the new template and its
 *      label is compatible;
 *   2. otherwise relocate the concept by matching labels (normalized token
 *      overlap) and read its NEW code from the code column;
 *   3. otherwise flag it as "not found" for a manual decision.
 * The result is a proposal (old → new + matched label + status) the user
 * confirms in the Mapping editor before it is saved.
 */

export interface ScanChange {
  concept: string;          // e.g. "capitalRows[goodwill]", "km1Items.rwa", "lcrCodes.lcrRatio"
  kind: 'ok' | 'changed' | 'missing';
  oldValue: string;
  newValue?: string;
  matchedLabel?: string;
}

export interface ScanResult {
  fileKind: 'capital' | 'lcr' | 'nsfr';
  mapping: ImportMapping;   // updated full mapping (merged over the current one)
  changes: ScanChange[];
}

const norm = (v: unknown): string =>
  String(v ?? '').toLowerCase().replace(/[–—\-()+/.,:;'"’]/g, ' ').replace(/\s+/g, ' ').trim();

const tokens = (s: string): Set<string> => new Set(norm(s).split(' ').filter(t => t.length > 2));

/** Jaccard-ish similarity between two labels. */
const similarity = (a: string, b: string): number => {
  const ta = tokens(a), tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
};

interface RowIndex { code: string; label: string; row: number }

/** Index a sheet: code column + label column → rows. */
const indexSheet = (ws: XLSX.WorkSheet, codeCol: string, labelCol: string, maxRow = 900): RowIndex[] => {
  const out: RowIndex[] = [];
  for (let r = 1; r <= maxRow; r++) {
    const codeRaw = ws[`${codeCol}${r}`]?.v;
    const label = ws[`${labelCol}${r}`]?.v;
    if (codeRaw === undefined || codeRaw === null || label === undefined) continue;
    const code = String(codeRaw).trim().split(/\s/)[0];
    if (!code) continue;
    out.push({ code, label: String(label), row: r });
  }
  return out;
};

const bestMatch = (label: string, index: RowIndex[]): { entry: RowIndex; score: number } | null => {
  let best: RowIndex | null = null;
  let bestScore = 0;
  for (const e of index) {
    const s = similarity(label, e.label);
    if (s > bestScore) { bestScore = s; best = e; }
  }
  return best && bestScore >= 0.45 ? { entry: best, score: bestScore } : null;
};

/** Find the sheet whose given column contains a label similar to `needle`. */
const findSheet = (wb: XLSX.WorkBook, col: string, needle: string, maxRow = 200): string | undefined => {
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    for (let r = 1; r <= maxRow; r++) {
      const v = ws[`${col}${r}`]?.v;
      if (v !== undefined && similarity(String(v), needle) >= 0.6) return name;
    }
  }
  return undefined;
};

export const scanTemplate = (buffer: ArrayBuffer, current?: ImportMapping): ScanResult => {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const m = resolveMapping(current);
  const changes: ScanChange[] = [];
  const next: ImportMapping = JSON.parse(JSON.stringify(resolveMapping(current)));

  const record = (concept: string, oldValue: string, found?: { code: string; label: string }) => {
    if (!found) { changes.push({ concept, kind: 'missing', oldValue }); return oldValue; }
    changes.push({
      concept,
      kind: found.code === oldValue ? 'ok' : 'changed',
      oldValue,
      newValue: found.code,
      matchedLabel: found.label.replace(/\s+/g, ' ').slice(0, 80),
    });
    return found.code;
  };

  // ---- NSFR template? (one form sheet with 'Total ASF') ----
  const nsfrSheet = wb.SheetNames.includes(m.nsfr.sheet!) ? m.nsfr.sheet!
    : findSheet(wb, 'D', 'Total ASF', 400);
  if (nsfrSheet && findSheet(wb, 'D', 'Net stable funding ratio', 400)) {
    next.nsfr = { ...next.nsfr, sheet: nsfrSheet };
    if (nsfrSheet !== m.nsfr.sheet) changes.push({ concept: 'nsfr.sheet', kind: 'changed', oldValue: m.nsfr.sheet!, newValue: nsfrSheet });
    const idx = indexSheet(wb.Sheets[nsfrSheet], 'E', 'D', 400);
    const locate = (label: string) => { const b = bestMatch(label, idx); return b ? { code: b.entry.code, label: b.entry.label } : undefined; };
    next.nsfr.totalAsf = record('nsfr.totalAsf (Total ASF)', m.nsfr.totalAsf!, locate('Total ASF'));
    next.nsfr.totalRsf = record('nsfr.totalRsf (Total RSF)', m.nsfr.totalRsf!, locate('Total RSF'));
    next.nsfr.ratio = record('nsfr.ratio (NSFR %)', m.nsfr.ratio!, locate('Net stable funding ratio'));
    return { fileKind: 'nsfr', mapping: next, changes };
  }

  // ---- LCR template? (per-currency sheets) ----
  const lcrSheets = wb.SheetNames.filter(n => /^LCR_G\d+_[A-Z]{3}\.MELD$/.test(n));
  if (lcrSheets.length > 0) {
    const ws = wb.Sheets[lcrSheets[0]];
    const idx = indexSheet(ws, 'E', 'C', 800);
    const locate = (label: string) => { const b = bestMatch(label, idx); return b ? { code: b.entry.code, label: b.entry.label } : undefined; };
    const codes: Array<[keyof NonNullable<ImportMapping['lcrCodes']>, string]> = [
      ['totalOutflows', 'Total cash outflows'],
      ['inflowsBeforeCap', 'Total cash inflows before applying the cap'],
      ['inflowsAfterCap', 'Total cash inflows after applying the cap'],
      ['lcrRatio', 'LCR'],
      ['retailOutflows', 'Total retail deposits run-off'],
      ['wholesaleOutflows', 'Total unsecured wholesale funding run-off'],
      ['derivativesOutflows', 'Derivatives cash outflow'],
      ['reverseRepoInflows', 'Total inflows on reverse repo and securities borrowing transactions'],
      ['derivativesInflows', 'derivatives cash inflow'],
    ];
    next.lcrCodes = { ...next.lcrCodes };
    for (const [key, label] of codes) {
      (next.lcrCodes as Record<string, string>)[key] =
        record(`lcrCodes.${key} (${label})`, (m.lcrCodes as Record<string, string>)[key], locate(label));
    }
    // HQLA labels: check the exact Y labels still exist; else keep + flag.
    for (const [key, labels] of Object.entries(m.lcrHqlaLabels) as Array<[string, string[]]>) {
      const found = labels.some(l => {
        for (let r = 1; r <= 800; r++) {
          const v = ws[`Y${r}`]?.v;
          if (v !== undefined && norm(v) === norm(l)) return true;
        }
        return false;
      });
      changes.push({ concept: `lcrHqlaLabels.${key}`, kind: found ? 'ok' : 'missing', oldValue: labels[0] });
    }
    return { fileKind: 'lcr', mapping: next, changes };
  }

  // ---- Capital template (CASABIS) ----
  const km1Sheet = wb.SheetNames.includes(m.sheets.km1!) ? m.sheets.km1!
    : findSheet(wb, 'B', 'Common Equity Tier 1 (CET1)', 60);
  const capSheet = wb.SheetNames.includes(m.sheets.cap!) ? m.sheets.cap!
    : findSheet(wb, 'B', 'Total eligible capital');
  const rwaSheet = wb.SheetNames.includes(m.sheets.rwa!) ? m.sheets.rwa!
    : findSheet(wb, 'B', 'Total risk-weighted assets (RWA)');
  if (!capSheet && !km1Sheet) {
    throw new Error('Unrecognized template: no NSFR_G01 sheet, no LCR_G01_*.MELD sheets, and no capital sheet with "Total eligible capital" found.');
  }
  next.sheets = { km1: km1Sheet || m.sheets.km1, cap: capSheet || m.sheets.cap, rwa: rwaSheet || m.sheets.rwa };
  for (const [k, oldV, newV] of [['km1', m.sheets.km1, km1Sheet], ['cap', m.sheets.cap, capSheet], ['rwa', m.sheets.rwa, rwaSheet]] as const) {
    changes.push({ concept: `sheets.${k}`, kind: !newV ? 'missing' : newV === oldV ? 'ok' : 'changed', oldValue: oldV!, newValue: newV || undefined });
  }

  // Capital composition rows: relocate each mapped FINMA code by label.
  if (capSheet) {
    const idx = indexSheet(wb.Sheets[capSheet], 'A', 'B', 250);
    next.capitalRows = m.capitalRows.map(rowDef => {
      const existing = idx.find(e => e.code === rowDef.finma);
      const relocated = existing ?? bestMatch(rowDef.label, idx)?.entry;
      const found = relocated ? { code: relocated.code, label: relocated.label } : undefined;
      const finma = record(`capitalRows[${rowDef.code}] (${rowDef.label.slice(0, 40)})`, rowDef.finma, found);
      return { ...rowDef, finma };
    });
    const anchorIdx = idx;
    const netCet1 = anchorIdx.find(e => e.code === m.capitalAnchors.netCet1) ??
      bestMatch('Net CET1 capital', anchorIdx)?.entry;
    next.capitalAnchors = { ...next.capitalAnchors };
    next.capitalAnchors.netCet1 = record('capitalAnchors.netCet1', m.capitalAnchors.netCet1!, netCet1 ? { code: netCet1.code, label: netCet1.label } : undefined);
  }

  // RWA anchors by label on the RWA sheet.
  if (rwaSheet) {
    const idx = indexSheet(wb.Sheets[rwaSheet], 'A', 'B', 120);
    const locate = (curCode: string | undefined, label: string) => {
      const byCode = curCode ? idx.find(e => e.code === curCode) : undefined;
      const e = byCode ?? bestMatch(label, idx)?.entry;
      return e ? { code: e.code, label: e.label } : undefined;
    };
    const a = m.capitalAnchors;
    next.capitalAnchors = {
      ...next.capitalAnchors,
      rwaTotal: record('capitalAnchors.rwaTotal', a.rwaTotal!, locate(a.rwaTotal, 'Total risk-weighted assets (RWA)')),
      creditRwa: record('capitalAnchors.creditRwa', a.creditRwa!, locate(a.creditRwa, 'RWA for credit and counterparty credit risks')),
      marketRwa: record('capitalAnchors.marketRwa', a.marketRwa!, locate(a.marketRwa, 'RWA for market risk')),
      opRwa: record('capitalAnchors.opRwa', a.opRwa!, locate(a.opRwa, 'RWA for operational risk')),
      leverageExposure: record('capitalAnchors.leverageExposure', a.leverageExposure!, locate(a.leverageExposure, 'Leverage ratio exposure')),
    };
  }

  // KM1 item numbers: leading token of the col-B label found by similarity.
  if (km1Sheet) {
    const ws = wb.Sheets[km1Sheet];
    const rows: Array<{ item: string; label: string }> = [];
    for (let r = 1; r <= 60; r++) {
      const v = ws[`B${r}`]?.v;
      if (typeof v !== 'string') continue;
      const mm = v.replace(/\s+/g, ' ').trim().match(/^(\d+[a-z]?)\s+(.*)$/);
      if (mm) rows.push({ item: mm[1], label: mm[2] });
    }
    const KM1_LABELS: Array<[string, string]> = [
      ['cet1Capital', 'Common Equity Tier 1 (CET1)'], ['tier1Capital', 'Tier 1'], ['totalCapital', 'Total capital'],
      ['rwa', 'Total risk-weighted assets (RWA)'], ['cet1Ratio', 'CET1 ratio (%)'], ['tier1Ratio', 'T1 ratio (%)'],
      ['totalCapitalRatio', 'Total capital ratio (%)'],
      ['leverageExposure', 'Total Basel III leverage ratio exposure measure'],
      ['leverageRatio', 'Basel III Leverage Ratio'],
    ];
    next.km1Items = { ...next.km1Items };
    for (const [key, label] of KM1_LABELS) {
      const currentItem = (m.km1Items as Record<string, string>)[key] || '';
      // Prefer keeping the current item number when it still points at a
      // compatible label (item numbers are far more stable than wording).
      const existing = rows.find(r => r.item === currentItem);
      let found: { code: string; label: string } | undefined;
      if (existing && similarity(label, existing.label) >= 0.2) {
        found = { code: existing.item, label: existing.label };
      } else {
        let best: { item: string; label: string } | null = null;
        let bestScore = 0;
        for (const r of rows) {
          const s = similarity(label, r.label);
          if (s > bestScore) { bestScore = s; best = r; }
        }
        if (best && bestScore >= 0.5) found = { code: best.item, label: best.label };
      }
      (next.km1Items as Record<string, string>)[key] =
        record(`km1Items.${key} (${label})`, currentItem, found);
    }
  }

  return { fileKind: 'capital', mapping: next, changes };
};
