import { CentralData } from '../types';
import { dataRepository } from './dataRepository';

/**
 * In-app logging, two channels:
 *
 *  - TECH: what this browser tab did — every fetch to the API (method, path,
 *    status, duration) plus app events and errors. Ring buffer in memory,
 *    complemented on the Logs page by the API server's own buffer
 *    (GET /api/logs/tech).
 *
 *  - BUSINESS: what changed in the data — dataset-level diffs computed on
 *    every save, and detailed field-level entries pushed explicitly by the
 *    Data Explorer editor. Persisted to the ChangeLogs SQL table through
 *    POST /api/logs/business (localStorage in local/demo mode).
 */

// ---------------------------------------------------------------- tech log
export interface TechEntry {
  at: number;
  kind: 'api' | 'app' | 'error';
  message: string;
  /** HTTP status for 'api' entries. */
  status?: number;
  /** duration in ms for 'api' entries. */
  ms?: number;
}

const TECH_MAX = 400;
const techBuffer: TechEntry[] = [];
const techListeners = new Set<() => void>();

const notifyTech = () => techListeners.forEach(l => l());

export const logTech = (kind: TechEntry['kind'], message: string, extra?: Partial<TechEntry>) => {
  techBuffer.push({ at: Date.now(), kind, message, ...extra });
  if (techBuffer.length > TECH_MAX) techBuffer.splice(0, techBuffer.length - TECH_MAX);
  notifyTech();
};

export const getTechLog = (): readonly TechEntry[] => techBuffer;
export const subscribeTechLog = (listener: () => void): (() => void) => {
  techListeners.add(listener);
  return () => techListeners.delete(listener);
};

/**
 * Instruments window.fetch once so every API/document request is recorded
 * with its status and duration — no call-site changes needed. Installed at
 * app start (DataProvider); idempotent.
 */
let fetchInstalled = false;
export const installFetchLogger = () => {
  if (fetchInstalled || typeof window === 'undefined') return;
  fetchInstalled = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
    // Don't log the log endpoints themselves (the Logs page would spam the buffer).
    const silent = url.includes('/logs/tech') || url.includes('/logs/business');
    const t0 = performance.now();
    try {
      const res = await original(input as RequestInfo, init);
      if (!silent) {
        const short = url.replace(/^https?:\/\/[^/]+/, '');
        logTech('api', `${method} ${short}`, { status: res.status, ms: Math.round(performance.now() - t0) });
      }
      return res;
    } catch (err) {
      if (!silent) {
        const short = url.replace(/^https?:\/\/[^/]+/, '');
        logTech('error', `${method} ${short} — ${err instanceof Error ? err.message : String(err)}`, {
          ms: Math.round(performance.now() - t0),
        });
      }
      throw err;
    }
  };
};

// ------------------------------------------------------------ business log
export interface BusinessEntry {
  at: number;
  userName: string;
  dataset: string;
  /** insert | update | delete | import | save */
  action: string;
  details: string;
}

const BUSINESS_LS_KEY = 'regReportBusinessLog';
const BUSINESS_MAX = 300;

const readLocalBusiness = (): BusinessEntry[] => {
  try {
    const raw = localStorage.getItem(BUSINESS_LS_KEY);
    if (raw) return JSON.parse(raw) as BusinessEntry[];
  } catch { /* no storage */ }
  return [];
};

const writeLocalBusiness = (entries: BusinessEntry[]) => {
  try { localStorage.setItem(BUSINESS_LS_KEY, JSON.stringify(entries.slice(-BUSINESS_MAX))); } catch { /* no storage */ }
};

// Datasets that just received an explicit (detailed) entry: the generic
// per-save diff skips them for a short window so one edit doesn't produce
// two log lines saying the same thing.
const recentExplicit = new Map<string, number>();
const EXPLICIT_WINDOW_MS = 10_000;

/**
 * Records business log entries. In API mode they are POSTed to the ChangeLogs
 * table (fire-and-forget — logging must never block the app); in local mode
 * they go to localStorage. `explicit` marks detailed entries (Data Explorer
 * edits) so the generic save diff won't duplicate them.
 */
export const logBusiness = (
  entries: { dataset: string; action: string; details: string }[],
  opts?: { explicit?: boolean },
) => {
  if (entries.length === 0) return;
  const now = Date.now();
  if (opts?.explicit) entries.forEach(e => recentExplicit.set(e.dataset, now));

  if (dataRepository.mode === 'api' && dataRepository.baseUrl) {
    void fetch(`${dataRepository.baseUrl}/logs/business`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(entries),
    }).catch(() => { /* logging is best-effort */ });
  } else {
    const local = readLocalBusiness();
    entries.forEach(e => local.push({ at: now, userName: 'local', ...e }));
    writeLocalBusiness(local);
  }
};

/** Local-mode reader for the Logs page (API mode reads /api/logs/business). */
export const getLocalBusinessLog = (): BusinessEntry[] => readLocalBusiness().slice().reverse();

// --------------------------------------------------------- dataset diffing
/** Rows keyed by id when every row has one, else by their full JSON. */
const rowSignatures = (rows: Record<string, unknown>[]): Map<string, string> => {
  const allHaveId = rows.length > 0 && rows.every(r => r.id !== null && r.id !== undefined);
  const map = new Map<string, string>();
  rows.forEach((r, i) => {
    const key = allHaveId ? String(r.id) : `#${i}:${JSON.stringify(r)}`;
    map.set(key, JSON.stringify(r));
  });
  return map;
};

/**
 * Compares two CentralData snapshots and returns one human-readable entry per
 * dataset that changed ("+2 added, 1 modified") — the generic audit line
 * behind every save. Datasets that just got an explicit entry are skipped.
 */
export const diffCentralData = (
  prev: CentralData,
  next: CentralData,
): { dataset: string; action: string; details: string }[] => {
  const out: { dataset: string; action: string; details: string }[] = [];
  const now = Date.now();
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);

  for (const key of keys) {
    const explicitAt = recentExplicit.get(key);
    if (explicitAt && now - explicitAt < EXPLICIT_WINDOW_MS) continue;

    const a = (prev as unknown as Record<string, unknown>)[key];
    const b = (next as unknown as Record<string, unknown>)[key];
    if (a === b) continue;

    if (Array.isArray(a) || Array.isArray(b)) {
      const rowsA = Array.isArray(a) ? (a as Record<string, unknown>[]) : [];
      const rowsB = Array.isArray(b) ? (b as Record<string, unknown>[]) : [];
      if (rowsA === rowsB) continue;
      const sigA = rowSignatures(rowsA);
      const sigB = rowSignatures(rowsB);
      let added = 0, removed = 0, modified = 0;
      for (const [k, v] of sigB) {
        const old = sigA.get(k);
        if (old === undefined) added++;
        else if (old !== v) modified++;
      }
      for (const k of sigA.keys()) if (!sigB.has(k)) removed++;
      if (added === 0 && removed === 0 && modified === 0) continue;
      const parts: string[] = [];
      if (added) parts.push(`${added} added`);
      if (modified) parts.push(`${modified} modified`);
      if (removed) parts.push(`${removed} removed`);
      out.push({ dataset: key, action: 'save', details: `${parts.join(', ')} (${rowsB.length} rows total)` });
    } else {
      // Non-array datasets (bilan, riskAppetite, importMapping…).
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        out.push({ dataset: key, action: 'save', details: 'document modified' });
      }
    }
  }
  return out;
};
