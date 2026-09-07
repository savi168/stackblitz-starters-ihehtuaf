import * as XLSX from 'xlsx';
import { LargeExposure } from '../types';

/**
 * FINMA K-LER template importer (Large Exposure Reporting, e.g. v1.7):
 *  - LER_01: capital base — Tier 1 of the current period (kCHF);
 *  - LER_02: one row per counterparty / group of connected counterparties,
 *    with the counterparty type (SOV, SOB, BFN, NFC…), the total adjusted
 *    position after weighting (AI, kCHF) and the upper limit in % of the
 *    capital base (AK).
 * Everything is located by labels and by the column-letter row (K, L, … AP),
 * never by fixed positions — resilient to template layout changes.
 */

export interface ParsedKler {
  kind: 'kler';
  fileName: string;
  date: string;           // reporting date YYYY-MM-DD
  tier1Kchf: number | null;
  rows: Array<Omit<LargeExposure, 'entity'>>;
  /** Group-business rows (G0T/G0B/G1T/G1B) excluded from the register. */
  skipped: string[];
}

/** Sovereign-family K-LER types (excluded from the "top non-sov" view). */
export const KLER_SOVEREIGN_TYPES = new Set(['SOV', 'SOB', 'SOO', 'CAN', 'MUN', 'FPS']);
const GROUP_BUSINESS_TYPES = new Set(['G0T', 'G0B', 'G1T', 'G1B']);

type Sheet = XLSX.WorkSheet;
const cellV = (ws: Sheet, r: number, c: number): unknown => ws[XLSX.utils.encode_cell({ r, c })]?.v;
const norm = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();
const num = (v: unknown): number | undefined => (typeof v === 'number' && isFinite(v) ? v : undefined);
const rangeOf = (ws: Sheet) => XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');

const serialToIso = (serial: number): string => {
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

export const parseKlerWorkbook = (buffer: ArrayBuffer, fileName: string): ParsedKler => {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = (name: string): Sheet | null => {
    const key = wb.SheetNames.find(n => n.trim().toLowerCase() === name.toLowerCase());
    return key ? wb.Sheets[key] : null;
  };
  const ler02 = sheet('LER_02');
  if (!ler02) throw new Error('Not a K-LER workbook (no LER_02 sheet).');

  // Reporting date: "Reporting date" label with an Excel serial next to it
  // (LER_02 header block, else the Delivery Note).
  let date = '';
  for (const ws of [ler02, sheet('Delivery Note')]) {
    if (!ws || date) continue;
    const rg = rangeOf(ws);
    for (let r = 0; r <= Math.min(rg.e.r, 10) && !date; r++) {
      for (let c = 0; c <= rg.e.c && !date; c++) {
        if (norm(cellV(ws, r, c)).toLowerCase() === 'reporting date') {
          const v = num(cellV(ws, r, c + 1));
          if (v && v > 20000) date = serialToIso(v);
          const d = cellV(ws, r, c + 1);
          if (!date && d instanceof Date) date = serialToIso(25569 + d.getTime() / 86400000);
        }
      }
    }
  }
  if (!date) throw new Error('K-LER: reporting date not found.');

  // Tier 1 (kCHF): LER_01 — the "Tier 1 capital" column header, read on the
  // "Current period" row (fallback: "Previous period").
  let tier1Kchf: number | null = null;
  const ler01 = sheet('LER_01');
  if (ler01) {
    const rg = rangeOf(ler01);
    let t1Col = -1;
    for (let r = 0; r <= rg.e.r && t1Col === -1; r++) {
      for (let c = 0; c <= rg.e.c; c++) {
        if (norm(cellV(ler01, r, c)).toLowerCase() === 'tier 1 capital') { t1Col = c; break; }
      }
    }
    if (t1Col >= 0) {
      for (const label of ['current period', 'previous period']) {
        for (let r = 0; r <= rg.e.r && tier1Kchf === null; r++) {
          for (let c = 0; c <= Math.min(rg.e.c, 8); c++) {
            if (norm(cellV(ler01, r, c)).toLowerCase() === label) {
              const v = num(cellV(ler01, r, t1Col));
              if (v !== undefined && v > 0) tier1Kchf = v;
            }
          }
        }
        if (tier1Kchf !== null) break;
      }
    }
  }

  // Column map from the letter row of LER_02 (the row holding K, L, M… AP).
  const rg = rangeOf(ler02);
  let letterRow = -1;
  const colOf: Record<string, number> = {};
  for (let r = 0; r <= Math.min(rg.e.r, 40) && letterRow === -1; r++) {
    const found: Record<string, number> = {};
    for (let c = 0; c <= rg.e.c; c++) {
      const v = norm(cellV(ler02, r, c));
      if (/^[A-Z]{1,2}$/.test(v)) found[v] = c;
    }
    if (found['K'] !== undefined && found['P'] !== undefined && found['AI'] !== undefined) {
      letterRow = r;
      Object.assign(colOf, found);
    }
  }
  if (letterRow === -1) throw new Error('K-LER: LER_02 column-letter row (K…AP) not found.');

  const rows: Array<Omit<LargeExposure, 'entity'>> = [];
  const skipped: string[] = [];
  for (let r = letterRow + 1; r <= rg.e.r; r++) {
    const name = norm(cellV(ler02, r, colOf['K']));
    if (!name) continue;
    const type = norm(cellV(ler02, r, colOf['P'])).toUpperCase();
    if (GROUP_BUSINESS_TYPES.has(type)) { skipped.push(`${name} (${type})`); continue; }
    const adjustedKchf = num(cellV(ler02, r, colOf['AI'])) ?? num(cellV(ler02, r, colOf['AH']));
    if (adjustedKchf === undefined) continue;
    // Upper limit: AK is a fraction of the capital base; default 25%.
    const limitFrac = num(cellV(ler02, r, colOf['AK']));
    const limitMchf = tier1Kchf !== null
      ? ((limitFrac && limitFrac > 0 ? limitFrac : 0.25) * tier1Kchf) / 1000
      : 0;
    // Decomposition (kCHF): direct U–Z, indirect AA–AB, CRM AD–AG (negative
    // in the template → stored positive).
    const sumOf = (letters: string[]) =>
      letters.reduce((a, L) => a + (colOf[L] !== undefined ? (num(cellV(ler02, r, colOf[L])) ?? 0) : 0), 0);
    const directKchf = sumOf(['U', 'V', 'W', 'X', 'Y', 'Z']);
    const indirectKchf = sumOf(['AA', 'AB']);
    const crmKchf = Math.abs(sumOf(['AD', 'AE', 'AF', 'AG']));
    rows.push({
      date,
      counterparty: name,
      exposureValue: Math.round(adjustedKchf) / 1000, // kCHF → mCHF
      limit: Math.round(limitMchf * 10) / 10,
      counterpartyType: type || undefined,
      directExposure: Math.round(directKchf) / 1000,
      indirectExposure: Math.round(indirectKchf) / 1000,
      crmReduction: Math.round(crmKchf) / 1000,
    });
  }
  if (rows.length === 0) throw new Error('K-LER: no counterparty rows found in LER_02.');
  return { kind: 'kler', fileName, date, tier1Kchf, rows, skipped };
};
