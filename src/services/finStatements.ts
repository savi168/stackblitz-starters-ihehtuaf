import { FinStatement, FinStatementKind, FinStatementLineItem } from '../types';
import { newItemId } from './capital';

/**
 * Financial statements domain logic: default section structures and manual
 * templates for Balance Sheet / P&L / Statement of Changes in Equity, section
 * totals and the balance-sheet check. Amounts are signed (expenses and
 * liability-side deductions negative where noted).
 */

/** Accounting frameworks — a reporting entity can carry several in parallel. */
export const GAAP_OPTIONS = ['Swiss GAAP', 'IFRS', 'Local GAAP'] as const;
export const DEFAULT_GAAP = 'Swiss GAAP';
/** Statements saved before the GAAP dimension existed count as Swiss GAAP. */
export const gaapOf = (s: { gaap?: string }): string => s.gaap || DEFAULT_GAAP;

export const KIND_LABELS: Record<FinStatementKind, string> = {
  balanceSheet: 'Balance Sheet',
  pnl: 'Profit & Loss',
  equity: "Shareholders' Equity",
};

export const KIND_SECTIONS: Record<FinStatementKind, Array<{ key: string; label: string }>> = {
  balanceSheet: [
    { key: 'assets', label: 'Assets' },
    { key: 'liabilities', label: 'Liabilities' },
    { key: 'equity', label: 'Equity' },
  ],
  pnl: [
    { key: 'income', label: 'Operating income' },
    { key: 'expenses', label: 'Operating expenses & taxes' },
  ],
  equity: [
    { key: 'movements', label: 'Movements of the period' },
  ],
};

const TEMPLATES: Record<FinStatementKind, Array<[string, string]>> = {
  balanceSheet: [
    ['assets', 'Cash and balances with central banks'],
    ['assets', 'Due from banks'],
    ['assets', 'Loans and advances to customers'],
    ['assets', 'Trading portfolio assets'],
    ['assets', 'Financial investments'],
    ['assets', 'Goodwill and intangible assets'],
    ['assets', 'Other assets'],
    ['liabilities', 'Due to banks'],
    ['liabilities', 'Due to customers (deposits)'],
    ['liabilities', 'Debt issued'],
    ['liabilities', 'Other liabilities'],
    ['equity', 'Share capital'],
    ['equity', 'Share premium'],
    ['equity', 'Retained earnings'],
    ['equity', 'Other comprehensive income (+/-)'],
    ['equity', 'Net profit for the period'],
  ],
  pnl: [
    ['income', 'Net interest income'],
    ['income', 'Net fee and commission income'],
    ['income', 'Net trading income'],
    ['income', 'Other operating income'],
    ['expenses', 'Personnel expenses (-)'],
    ['expenses', 'Other operating expenses (-)'],
    ['expenses', 'Depreciation and amortisation (-)'],
    ['expenses', 'Provisions and credit losses (-)'],
    ['expenses', 'Income taxes (-)'],
  ],
  equity: [
    ['movements', 'Opening balance'],
    ['movements', 'Net profit for the period'],
    ['movements', 'Dividends (-)'],
    ['movements', 'Share buy-back (-)'],
    ['movements', 'Share issuance / sales'],
    ['movements', 'Share-based payments / RSU'],
    ['movements', 'Currency translation adjustment (+/-)'],
    ['movements', 'Other comprehensive income (+/-)'],
    ['movements', 'Other movements (+/-)'],
  ],
};

export const createFinStatementTemplate = (entity: string, date: string, kind: FinStatementKind, gaap: string = DEFAULT_GAAP): FinStatement => ({
  id: newItemId(),
  entity,
  date,
  kind,
  gaap,
  source: 'manual',
  lineItems: TEMPLATES[kind].map(([section, label]) => ({
    id: newItemId(),
    section,
    code: '',
    label,
    amount: 0,
  })),
});

export const sectionTotal = (items: FinStatementLineItem[], section: string): number =>
  items.filter(i => i.section === section && !i.memo).reduce((a, i) => a + (i.amount || 0), 0);

export interface FinStatementSummary {
  /** Per-section totals (non-memo). */
  sections: Record<string, number>;
  /** balanceSheet: assets − liabilities − equity (should be 0) · pnl: net profit · equity: closing balance. */
  keyFigure: number;
  keyFigureLabel: string;
  /** balanceSheet only: whether the statement balances (|gap| < 0.5 mCHF). */
  balanced?: boolean;
}

export const computeFinSummary = (s: FinStatement): FinStatementSummary => {
  const sections: Record<string, number> = {};
  for (const { key } of KIND_SECTIONS[s.kind]) sections[key] = sectionTotal(s.lineItems, key);

  if (s.kind === 'balanceSheet') {
    const gap = (sections.assets || 0) - (sections.liabilities || 0) - (sections.equity || 0);
    return { sections, keyFigure: gap, keyFigureLabel: 'Balance check (assets − liabilities − equity)', balanced: Math.abs(gap) < 0.5 };
  }
  if (s.kind === 'pnl') {
    const net = (sections.income || 0) + (sections.expenses || 0);
    return { sections, keyFigure: net, keyFigureLabel: 'Net profit for the period' };
  }
  return { sections, keyFigure: sections.movements || 0, keyFigureLabel: 'Closing balance' };
};
