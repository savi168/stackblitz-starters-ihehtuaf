import * as XLSX from 'xlsx';

/**
 * Adjustments module (Production): accounting adjustment lines (LIGNE,
 * REFERENCE, MONTANT, CCY, CATEG, IND, CLIENT…) matched against
 * core_positions of a MERCURY load, using the mappings of Mapping.xlsb:
 *  - Mapping_GL_BALANCESHEET: LIGNE → LegalAccountNumber + cp_TypeOf/cp_SubType
 *  - CCY: FX rate per currency (BS_RATE_6 = CHF per 1 unit)
 *  - Maping: RT01 (CATEG) → QDL counterparty TypeOf
 *  - INDUSTRY: IND code → TypeOf + EconomicActivityType
 * Everything is located by header names — resilient to extra columns.
 */

export interface GlMapEntry {
  line: string;
  legalAccountNumber: string;
  typeOf?: string;
  subType?: string;
  description?: string;
}

export interface IndustryEntry {
  typeOf?: string;
  economicActivityType?: string;
  /** HYPERIOD_INTERCO — when set, the IND code is an intercompany: this value
   * goes into CounterpartyBookingCenterId of the generated position. */
  interco?: string;
  description?: string;
}

export interface AdjustmentMappings {
  gl: Map<string, GlMapEntry>;              // LIGNE → GL entry
  fx: Map<string, number>;                  // CCY → CHF rate per 1 unit
  rt01: Map<string, string>;                // CATEG (RT01) → QDL TypeOf
  industry: Map<string, IndustryEntry>;     // IND code → attributes (+ interco)
  /** LEFT(LegalAccountNumber,3) → label, derived from the GL sheet (most
   * frequent HFM description per prefix) — used by the impact preview. */
  accountLabels: Map<string, string>;
}

export interface AdjustmentLine {
  row: number;           // 1-based row in the file
  ligne: string;
  description?: string;
  montant: number;       // signed, position currency
  nominal?: number;
  ccy: string;
  categ?: string;
  ind?: string;
  reference: string;
  client?: string;
  libelle?: string;
  sense?: string;        // DEBIT | CREDIT (informational; montant is signed)
  vdDate?: string;
  matDate?: string;      // ISO — used for the generated list_securities row
}

const norm = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();
const numOf = (v: unknown): number | undefined => {
  if (typeof v === 'number' && isFinite(v)) return v;
  const n = Number(String(v ?? '').replace(/['\s]/g, '').replace(',', '.'));
  return isFinite(n) && String(v ?? '').trim() !== '' ? n : undefined;
};

const toIsoDate = (v: unknown): string | undefined => {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = norm(v);
  if (!s) return undefined;
  const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return undefined;
};

const sheetRows = (ws: XLSX.WorkSheet): unknown[][] =>
  XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as unknown[][];

const headerIndex = (header: unknown[], ...names: string[]): number => {
  const low = header.map(h => norm(h).toLowerCase());
  for (const n of names) {
    const i = low.indexOf(n.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
};

/** Parses Mapping.xlsb (or an equivalent xlsx) into the lookup maps. */
export const parseMappingWorkbook = (buffer: ArrayBuffer): AdjustmentMappings => {
  const wb = XLSX.read(buffer, { type: 'array' });
  const need = (name: string): XLSX.WorkSheet => {
    const key = wb.SheetNames.find(n => n.toLowerCase() === name.toLowerCase());
    if (!key) throw new Error(`Mapping workbook: sheet "${name}" not found (sheets: ${wb.SheetNames.join(', ')}).`);
    return wb.Sheets[key];
  };

  // GL balance sheet mapping (+ account-prefix labels for the impact preview)
  const gl = new Map<string, GlMapEntry>();
  const accountLabels = new Map<string, string>();
  {
    const rows = sheetRows(need('Mapping_GL_BALANCESHEET'));
    const h = rows[0] || [];
    const iLine = headerIndex(h, 'Line');
    const iLan = headerIndex(h, 'Legal Account Number');
    const iType = headerIndex(h, 'cp_TypeOf');
    const iSub = headerIndex(h, 'cp_SubType');
    const iDesc = headerIndex(h, 'Combined.DESC', 'CAO_DM.RepLineHFMDsc');
    const iHfm = headerIndex(h, 'CAO_DM.RepLineHFMDsc');
    if (iLine === -1 || iLan === -1) throw new Error('Mapping_GL_BALANCESHEET: columns "Line" and "Legal Account Number" are required.');
    const labelVotes = new Map<string, Map<string, number>>();
    for (let r = 1; r < rows.length; r++) {
      const line = norm(rows[r]?.[iLine]);
      const lan = norm(rows[r]?.[iLan]);
      if (!line || !lan) continue;
      if (!gl.has(line)) {
        gl.set(line, {
          line,
          legalAccountNumber: lan,
          typeOf: iType >= 0 ? norm(rows[r]?.[iType]) || undefined : undefined,
          subType: iSub >= 0 ? norm(rows[r]?.[iSub]) || undefined : undefined,
          description: iDesc >= 0 ? norm(rows[r]?.[iDesc]) || undefined : undefined,
        });
      }
      if (/^\d{3}/.test(lan)) {
        // Label of the LEFT3 prefix = most frequent HFM description ("111 00 01
        // - Cash in hand" → "Cash in hand"), falling back to Combined.DESC.
        const hfm = iHfm >= 0 ? norm(rows[r]?.[iHfm]).split(' - ').slice(1).join(' - ') : '';
        const label = hfm || (iDesc >= 0 ? norm(rows[r]?.[iDesc]) : '');
        if (label) {
          const prefix = lan.slice(0, 3);
          const votes = labelVotes.get(prefix) ?? new Map<string, number>();
          votes.set(label, (votes.get(label) || 0) + 1);
          labelVotes.set(prefix, votes);
        }
      }
    }
    for (const [prefix, votes] of labelVotes) {
      const best = Array.from(votes.entries()).sort((a, b) => b[1] - a[1])[0];
      if (best) accountLabels.set(prefix, best[0]);
    }
  }

  // FX rates (CHF per 1 unit)
  const fx = new Map<string, number>();
  {
    const rows = sheetRows(need('CCY'));
    const h = rows[0] || [];
    const iCcy = headerIndex(h, 'CCY');
    const iRate = headerIndex(h, 'BS_RATE_6');
    if (iCcy >= 0 && iRate >= 0) {
      for (let r = 1; r < rows.length; r++) {
        const ccy = norm(rows[r]?.[iCcy]).toUpperCase();
        const rate = numOf(rows[r]?.[iRate]);
        if (ccy && rate !== undefined) fx.set(ccy, rate);
      }
    }
    fx.set('CHF', 1);
  }

  // RT01 → QDL (first pair of columns of the "Maping" sheet)
  const rt01 = new Map<string, string>();
  {
    const rows = sheetRows(need('Maping'));
    for (let r = 1; r < Math.min(rows.length, 5000); r++) {
      const k = norm(rows[r]?.[0]);
      const v = norm(rows[r]?.[1]);
      if (k && v && !rt01.has(k)) rt01.set(k, v);
      if (!k && !v && r > 50) break; // past the end of the block
    }
  }

  // Industry codes (+ HYPERIOD_INTERCO → intercompany booking center)
  const industry = new Map<string, IndustryEntry>();
  {
    const rows = sheetRows(need('INDUSTRY'));
    const h = rows[0] || [];
    const iId = headerIndex(h, 'ID');
    const iType = headerIndex(h, 'TypeOf');
    const iEco = headerIndex(h, 'EconomicActivityType');
    const iInterco = headerIndex(h, 'HYPERIOD_INTERCO', 'HYPERION_INTERCO');
    const iDesc = headerIndex(h, 'Description');
    for (let r = 1; r < rows.length; r++) {
      const id = norm(rows[r]?.[iId]);
      if (!id) continue;
      industry.set(id, {
        typeOf: iType >= 0 ? norm(rows[r]?.[iType]) || undefined : undefined,
        economicActivityType: iEco >= 0 ? norm(rows[r]?.[iEco]) || undefined : undefined,
        interco: iInterco >= 0 ? norm(rows[r]?.[iInterco]) || undefined : undefined,
        description: iDesc >= 0 ? norm(rows[r]?.[iDesc]) || undefined : undefined,
      });
    }
  }

  return { gl, fx, rt01, industry, accountLabels };
};

/** Parses the accounting adjustments file (Book6-like: header row with LIGNE…). */
export const parseAdjustmentsFile = (buffer: ArrayBuffer): AdjustmentLine[] => {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  for (const name of wb.SheetNames) {
    const rows = sheetRows(wb.Sheets[name]);
    const hIdx = rows.findIndex(r => headerIndex(r || [], 'LIGNE') >= 0 && headerIndex(r || [], 'REFERENCE') >= 0);
    if (hIdx === -1) continue;
    const h = rows[hIdx];
    const iLigne = headerIndex(h, 'LIGNE');
    const iDesc = headerIndex(h, 'DESCRIPTION');
    const iMont = headerIndex(h, 'MONTANT');
    const iNom = headerIndex(h, 'NOMINAL');
    const iCcy = headerIndex(h, 'CCY');
    const iCateg = headerIndex(h, 'CATEG');
    const iInd = headerIndex(h, 'IND');
    const iRef = headerIndex(h, 'REFERENCE');
    const iClient = headerIndex(h, 'CLIENT');
    const iLib = headerIndex(h, 'LIBELLE');
    const iVd = headerIndex(h, 'VD DATE');
    const iMat = headerIndex(h, 'MAT DATE');
    const lines: AdjustmentLine[] = [];
    for (let r = hIdx + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const ligne = norm(row[iLigne]);
      const montant = numOf(row[iMont]);
      const reference = norm(row[iRef]);
      if (!ligne && !reference) continue;
      if (montant === undefined) continue;
      // DEBIT/CREDIT sits in an unlabelled-ish column — detect it by value.
      const sense = (row as unknown[]).map(norm).find(v => v === 'DEBIT' || v === 'CREDIT');
      lines.push({
        row: r + 1,
        ligne,
        description: iDesc >= 0 ? norm(row[iDesc]) || undefined : undefined,
        montant,
        nominal: iNom >= 0 ? numOf(row[iNom]) : undefined,
        ccy: (iCcy >= 0 ? norm(row[iCcy]) : '').toUpperCase() || 'CHF',
        categ: iCateg >= 0 ? norm(row[iCateg]) || undefined : undefined,
        ind: iInd >= 0 ? norm(row[iInd]) || undefined : undefined,
        reference,
        client: iClient >= 0 ? norm(row[iClient]) || undefined : undefined,
        libelle: iLib >= 0 ? norm(row[iLib]) || undefined : undefined,
        sense,
        vdDate: iVd >= 0 ? norm(row[iVd]) || undefined : undefined,
        matDate: iMat >= 0 ? toIsoDate(row[iMat]) : undefined,
      });
    }
    if (lines.length > 0) return lines;
  }
  throw new Error('Adjustments file: no sheet with LIGNE + REFERENCE headers found.');
};

const q = (v: string) => `'${v.replace(/'/g, "''")}'`;

/** Candidate row returned by the match endpoint (subset of core_positions). */
export interface MatchCandidate {
  id: string;
  legalAccountNumber?: string;
  typeOf?: string;
  subType?: string;
  currency?: string;
  bookAmount?: number;
  counterpartyId?: string;
  counterpartyPIT?: number;
  internalReference1?: string;
  contractId?: string;
  securityId?: string;
  securityPIT?: number;
  guarantorId?: string;
  guarantorPIT?: number;
  bookingCenterId?: string;
  locationCountry?: string;
  dataSource?: string;
  accountMatch?: boolean;
  /** Full core_positions row as returned by the API (all columns) — used to
   * build the one-shot Excel export with the copied attributes. */
  raw?: Record<string, unknown>;
}

/** The API returns SQL column names as-is (PascalCase dictionary keys) —
 * normalize them into a MatchCandidate, case-insensitively. */
export const normalizeCandidate = (raw: Record<string, unknown>): MatchCandidate => {
  const get = (name: string): unknown => {
    const k = Object.keys(raw).find(key => key.toLowerCase() === name.toLowerCase());
    return k === undefined ? undefined : raw[k];
  };
  const s = (name: string): string | undefined => {
    const v = get(name);
    return v === null || v === undefined || v === '' ? undefined : String(v);
  };
  const n = (name: string): number | undefined => {
    const v = get(name);
    return typeof v === 'number' && isFinite(v) ? v : undefined;
  };
  return {
    id: s('Id') ?? '',
    legalAccountNumber: s('LegalAccountNumber'),
    typeOf: s('TypeOf'),
    subType: s('SubType'),
    currency: s('Currency'),
    bookAmount: n('BookAmount'),
    counterpartyId: s('CounterpartyId'),
    counterpartyPIT: n('CounterpartyPIT'),
    internalReference1: s('InternalReference1'),
    contractId: s('ContractId'),
    securityId: s('SecurityId'),
    securityPIT: n('SecurityPIT'),
    guarantorId: s('GuarantorId'),
    guarantorPIT: n('GuarantorPIT'),
    bookingCenterId: s('BookingCenterId'),
    locationCountry: s('LocationCountry'),
    dataSource: s('DataSource'),
    accountMatch: get('accountMatch') === true,
    raw,
  };
};

/** All core_positions columns in INSERT order, with the neutral default used
 * when building a brand-new position: text → '', num → 0, date → 1900-01-01,
 * pit → NULL (only *PIT columns are nullable in the real DDL). The SQL
 * builders, the one-shot Excel export and the manual generator all derive
 * from this single list. */
type PosColKind = 'text' | 'num' | 'date' | 'pit';
export const CORE_POSITION_COLS: Array<[string, PosColKind]> = [
  ['Id', 'text'], ['LoadId', 'num'], ['BookingCenterId', 'text'], ['LegalAccountNumber', 'num'],
  ['Currency', 'text'], ['LocationCountry', 'text'],
  ['InternalReference1', 'text'], ['InternalReference2', 'text'], ['InternalReference3', 'text'],
  ['InternalReference4', 'text'], ['InternalReference5', 'text'],
  ['DataSource', 'text'], ['PositionCurrencyBookAmount', 'num'], ['BookAmount', 'num'],
  ['EncumberedFlag', 'num'], ['EncumberedAmount', 'num'], ['EncumbranceEndDate', 'date'],
  ['Notional', 'num'], ['InternalLendingValue', 'num'], ['PV', 'num'], ['Provision', 'num'],
  ['Capacity', 'text'], ['MaturityDate', 'date'], ['MaturityType', 'text'], ['ImpairedFlag', 'num'],
  ['NonPerformingFlag', 'num'], ['RatingClass', 'num'], ['IRBFlag', 'num'], ['RelatedPartyType', 'text'],
  ['Subordination', 'num'], ['PriorityClaimLevel', 'num'],
  ['ParticipationLevel', 'num'], ['GoodsXBorderFlag', 'num'], ['PledgeLink', 'text'],
  ['StartDate', 'date'], ['GeneralLedger', 'text'], ['TradingBookFlag', 'num'],
  ['NumberOfComponents', 'num'], ['LongContractFlag', 'num'], ['NettingSetId', 'text'],
  ['NettingAgreementType', 'text'], ['CounterpartyId', 'text'], ['CounterpartyPIT', 'num'],
  ['CounterpartyBookingCenterId', 'text'], ['MarginAgreementId', 'text'], ['MarginAgreementPIT', 'pit'],
  ['ClearingFacilityTypeOf', 'text'], ['ClearingFacilityId', 'text'],
  ['ClearingFacilityPIT', 'pit'], ['PledgedFlag', 'num'], ['PledgeEndDate', 'date'],
  ['CollateralHolderId', 'text'], ['CollateralHolderPIT', 'pit'], ['ContractId', 'text'],
  ['PropertyId', 'text'], ['PropertyPIT', 'pit'], ['Account', 'text'], ['DerivativeId', 'text'],
  ['DerivativeSwapId', 'text'], ['SecurityId', 'text'], ['SecurityPIT', 'pit'], ['CommodityId', 'text'],
  ['CommodityPIT', 'pit'], ['IRReference', 'text'], ['IRSpread', 'num'], ['InterestRate', 'num'],
  ['IRTypeOf', 'text'], ['IRNextFixingDate', 'date'], ['IRReFixingFrequency', 'text'],
  ['IRNextPaymentDate', 'date'], ['IRPaymentFrequency', 'text'], ['IRCompoundingType', 'text'],
  ['TypeOf', 'text'], ['SubType', 'text'], ['IRDayCount', 'text'], ['IRSpreadFlag', 'num'],
  ['GuarantorId', 'text'], ['GuarantorPIT', 'pit'], ['IsEdited', 'num'],
  ['CryptoAssetId', 'text'], ['CryptoAssetPIT', 'pit'], ['ReportingDate', 'date'],
  ['CreditFacilityId', 'text'],
  ['PortfolioAdjustmentProvisionId', 'text'], ['PortfolioAdjustmentProvisionPIT', 'pit'],
];

const numOrSelf = (v: string): number | string => (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);

/** Options applied at generation time (chosen in the UI when the adjustment
 * files are loaded). */
export interface AdjustmentBuildOptions {
  /** BookingCenterId stamped on brand-new positions. */
  bookingCenterId?: string;
}

/** Intercompany lookup: IND code → HYPERIOD_INTERCO of the INDUSTRY sheet —
 * when set, the counterparty is a group company and the value goes into
 * CounterpartyBookingCenterId. */
export const intercoOf = (line: AdjustmentLine, mappings: AdjustmentMappings): IndustryEntry | undefined => {
  const e = line.ind ? mappings.industry.get(line.ind) : undefined;
  return e?.interco ? e : undefined;
};
const chfOf = (line: AdjustmentLine, mappings: AdjustmentMappings): { rate: number; chf: number } => {
  const rate = mappings.fx.get(line.ccy) ?? 1;
  return { rate, chf: Math.round(line.montant * rate * 100) / 100 };
};
const sqlVal = (v: unknown): string =>
  v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : q(String(v));
const chunk6 = (items: string[]): string[] => {
  const out: string[] = [];
  for (let i = 0; i < items.length; i += 6)
    out.push('    ' + items.slice(i, i + 6).join(', ') + (i + 6 < items.length ? ',' : ''));
  return out;
};

/** A line builds a *security* position when the GL mapping says so — in that
 * case the package also creates the list_securities row (+ its issuer in
 * list_counterparties); otherwise only list_counterparties for the CLIENT. */
export const isSecurityLine = (line: AdjustmentLine, mappings: AdjustmentMappings): boolean =>
  (mappings.gl.get(line.ligne)?.typeOf ?? '').trim().toLowerCase() === 'security';
const newSecurityId = (line: AdjustmentLine): string => `ADJ-SEC-${line.ligne}-${line.row}`;
const isIsin = (v: string): boolean => /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(v);

/** JS values of a brand-new position built from the mappings (no match). */
const newPositionValues = (
  line: AdjustmentLine, loadId: string, reportingDate: string, mappings: AdjustmentMappings,
  opts?: AdjustmentBuildOptions
): Record<string, unknown> => {
  const glEntry = mappings.gl.get(line.ligne);
  const { chf } = chfOf(line, mappings);
  const row: Record<string, unknown> = {};
  for (const [name, kind] of CORE_POSITION_COLS)
    row[name] = kind === 'pit' ? null : kind === 'date' ? '1900-01-01' : kind === 'num' ? 0 : '';
  if (isSecurityLine(line, mappings)) {
    row.SecurityId = newSecurityId(line);
    row.SecurityPIT = numOrSelf(loadId);
  }
  Object.assign(row, {
    Id: `ADJ-${line.ligne}-${line.row}`,
    LoadId: numOrSelf(loadId),
    BookingCenterId: opts?.bookingCenterId ?? '',
    LegalAccountNumber: numOrSelf(glEntry?.legalAccountNumber ?? '0'),
    Currency: line.ccy,
    InternalReference1: String(line.reference),
    DataSource: 'ADJUSTMENT',
    PositionCurrencyBookAmount: line.montant,
    BookAmount: chf,
    Notional: line.nominal ?? 0,
    CounterpartyId: line.client ?? '',
    CounterpartyPIT: numOrSelf(loadId),
    CounterpartyBookingCenterId: intercoOf(line, mappings)?.interco ?? '',
    TypeOf: glEntry?.typeOf ?? '',
    SubType: glEntry?.subType ?? '',
    IsEdited: 1,
    ReportingDate: reportingDate,
  });
  return row;
};

/** Columns overridden on the matched position when creating the adjustment
 * (everything else is copied as-is). */
const adjustmentOverrides = (
  line: AdjustmentLine, cand: MatchCandidate, mappings: AdjustmentMappings
): Record<string, unknown> => {
  const { chf } = chfOf(line, mappings);
  const interco = intercoOf(line, mappings);
  return {
    Id: `${cand.id}-ADJ-${line.row}`,
    Currency: line.ccy,
    InternalReference1: String(line.reference),
    DataSource: 'ADJUSTMENT',
    PositionCurrencyBookAmount: line.montant,
    BookAmount: chf,
    EncumberedAmount: 0,
    Notional: line.nominal ?? 0,
    InternalLendingValue: 0, PV: 0, Provision: 0,
    IsEdited: 1,
    // The accounting line's IND code marks an intercompany → force the group
    // company into CounterpartyBookingCenterId (otherwise keep the copied one).
    ...(interco ? { CounterpartyBookingCenterId: interco.interco } : {}),
  };
};

/** Adjustment INSERT based on an existing matched position (attributes copied). */
export const buildAdjustmentInsert = (
  line: AdjustmentLine, cand: MatchCandidate, loadId: string, mappings: AdjustmentMappings
): string => {
  const { rate, chf } = chfOf(line, mappings);
  const over = adjustmentOverrides(line, cand, mappings);
  const adjId = String(over.Id);
  const interco = intercoOf(line, mappings);
  return [
    `-- Adjustment for accounting line ${line.ligne} (row ${line.row})${line.libelle ? ` — ${line.libelle}` : ''}`,
    `-- Matched position ${cand.id} (account ${cand.legalAccountNumber}); MONTANT ${line.montant} ${line.ccy}${line.ccy !== 'CHF' ? ` → ${chf} CHF @${rate}` : ''}`,
    ...(interco ? [`-- Intercompany: IND ${line.ind} → ${interco.description ?? '?'} → CounterpartyBookingCenterId ${q(interco.interco!)}`] : []),
    `-- 1) CHECK:`,
    `SELECT * FROM core_positions WHERE LoadId = ${loadId} AND Id = ${q(adjId)};`,
    `-- 2) INSERT (all other NOT NULL columns are copied from the matched position):`,
    `INSERT INTO core_positions (`,
    ...chunk6(CORE_POSITION_COLS.map(([n]) => n)),
    `)`,
    `SELECT`,
    ...chunk6(CORE_POSITION_COLS.map(([n]) => (n in over ? sqlVal(over[n]) : n))),
    `FROM core_positions WHERE LoadId = ${loadId} AND Id = ${q(cand.id)};`,
  ].join('\n');
};

/** Full new position when no candidate exists — built from the mappings. */
export const buildNewPositionInsert = (
  line: AdjustmentLine, loadId: string, reportingDate: string, mappings: AdjustmentMappings,
  opts?: AdjustmentBuildOptions
): string => {
  const glEntry = mappings.gl.get(line.ligne);
  const ind = line.ind ? mappings.industry.get(line.ind) : undefined;
  const rt = line.categ ? mappings.rt01.get(line.categ) : undefined;
  const interco = intercoOf(line, mappings);
  const row = newPositionValues(line, loadId, reportingDate, mappings, opts);
  const newId = String(row.Id);
  const lan = glEntry?.legalAccountNumber ?? '0';
  return [
    `-- New position for accounting line ${line.ligne} (row ${line.row}) — no match found in load ${loadId}`,
    `-- GL mapping: account ${lan}, TypeOf ${glEntry?.typeOf ?? '?'}${glEntry?.subType ? `/${glEntry.subType}` : ''}${glEntry?.description ? ` (${glEntry.description})` : ''}`,
    `-- Counterparty ${line.client ?? '?'} — IND ${line.ind ?? '—'} → ${ind?.typeOf ?? '?'}/${ind?.economicActivityType ?? '?'} · CATEG ${line.categ ?? '—'} → ${rt ?? '?'}`,
    ...(interco ? [`-- Intercompany: IND ${line.ind} → ${interco.description ?? '?'} → CounterpartyBookingCenterId ${q(interco.interco!)}`] : []),
    `-- ⚠ Review every default before executing (all NOT NULL columns get neutral values).`,
    `-- 1) CHECK:`,
    `SELECT * FROM core_positions WHERE LoadId = ${loadId} AND Id = ${q(newId)};`,
    `-- 2) INSERT:`,
    `INSERT INTO core_positions (`,
    ...chunk6(CORE_POSITION_COLS.map(([n]) => n)),
    `)`,
    `VALUES (`,
    ...chunk6(CORE_POSITION_COLS.map(([n]) => sqlVal(row[n]))),
    `);`,
  ].join('\n');
};

// ---------------------------------------------------------------------------
// Referential companions: a brand-new position must not create C5 orphans —
// the package also inserts the missing list_counterparties row (the CLIENT,
// or the issuer of a created security) and, for security lines, the
// list_securities row. All guarded by IF NOT EXISTS. Column lists per the
// exact MERCURY DDL (docs/mercury-model/ddl.txt) — same neutral defaults.
// ---------------------------------------------------------------------------

export const LIST_CPTY_COLS: Array<[string, PosColKind]> = [
  ['Id', 'text'], ['PointInTime', 'num'], ['CreationDate', 'date'], ['Name', 'text'],
  ['LegalName', 'text'], ['LEI', 'text'], ['DomicileCountry', 'text'], ['DomicileCanton', 'text'],
  ['HQDomicile', 'text'], ['RelatedPartyType', 'text'], ['TypeOf', 'text'],
  ['EconomicActivityType', 'text'], ['RatingClass', 'num'], ['ExternalRatingId', 'text'],
  ['ExternalRatingPIT', 'pit'], ['BookingCenterId', 'text'], ['GroupLEXId', 'text'],
  ['GroupARISId', 'text'], ['Headcount', 'num'], ['Turnover', 'num'], ['BalanceSheet', 'num'],
  ['Income1', 'num'], ['Income2', 'num'], ['SMEFlag', 'num'], ['AdequateSupervisionFlag', 'num'],
  ['RelationshipManagerId', 'text'], ['EstablishedRelationshipFlag', 'num'], ['LEXLimitFlag', 'num'],
  ['CreditQuality', 'text'], ['IncomeCurrency', 'text'], ['IsEdited', 'num'], ['Nationality', 'text'],
  ['ReportingDate', 'date'], ['PD', 'num'], ['RiskEvaluationDate', 'date'], ['SIScode', 'text'],
];
export const LIST_SEC_COLS: Array<[string, PosColKind]> = [
  ['Id', 'text'], ['PointInTime', 'num'], ['CreationDate', 'date'], ['Name', 'text'],
  ['ISIN', 'text'], ['BBGTicker', 'text'], ['FIGI', 'text'], ['SEDOL', 'text'], ['Currency', 'text'],
  ['IndexFlag', 'num'], ['MainIndexFlag', 'num'], ['RevaluationFrequency', 'text'],
  ['SNBEligibleFlag', 'num'], ['CMAApproachType', 'text'], ['CMARiskIndicator', 'num'],
  ['CMASARwFlag', 'num'], ['RatingClass', 'num'], ['ExternalRatingId', 'text'],
  ['ExternalRatingPIT', 'pit'], ['MaturityDate', 'date'], ['TypeOf', 'text'], ['SubType', 'text'],
  ['InterestRateId', 'text'], ['IssuerId', 'text'], ['IssuerPIT', 'pit'],
  ['InvestmentGradeFlag', 'num'], ['TimeSeriesId', 'num'], ['HQLACategory', 'text'],
  ['LEXGuaranteedFlag', 'num'], ['ListedType', 'text'], ['IsEdited', 'num'],
  ['StartDate', 'date'], ['ReportingDate', 'date'],
];

const listDefaults = (cols: Array<[string, PosColKind]>): Record<string, unknown> => {
  const row: Record<string, unknown> = {};
  for (const [name, kind] of cols)
    row[name] = kind === 'pit' ? null : kind === 'date' ? '1900-01-01' : kind === 'num' ? 0 : '';
  return row;
};

/** list_counterparties row for the CLIENT of a new position — TypeOf and
 * EconomicActivityType prefilled from the IND→INDUSTRY / CATEG→RT01 maps. */
export const counterpartyValues = (
  line: AdjustmentLine, loadId: string, reportingDate: string, mappings: AdjustmentMappings
): Record<string, unknown> => {
  const ind = line.ind ? mappings.industry.get(line.ind) : undefined;
  const rt = line.categ ? mappings.rt01.get(line.categ) : undefined;
  const row = listDefaults(LIST_CPTY_COLS);
  Object.assign(row, {
    Id: line.client ?? '',
    PointInTime: numOrSelf(loadId),
    CreationDate: new Date().toISOString().slice(0, 10),
    Name: line.libelle ?? line.client ?? '',
    TypeOf: ind?.typeOf ?? rt ?? '',
    EconomicActivityType: ind?.economicActivityType ?? '',
    IsEdited: 1,
    ReportingDate: reportingDate,
  });
  return row;
};

/** list_securities row created for a security line (issuer = CLIENT). */
export const securityValues = (
  line: AdjustmentLine, loadId: string, reportingDate: string, mappings: AdjustmentMappings
): Record<string, unknown> => {
  const glEntry = mappings.gl.get(line.ligne);
  const row = listDefaults(LIST_SEC_COLS);
  Object.assign(row, {
    Id: newSecurityId(line),
    PointInTime: numOrSelf(loadId),
    CreationDate: new Date().toISOString().slice(0, 10),
    Name: line.libelle ?? String(line.reference),
    ISIN: isIsin(String(line.reference)) ? String(line.reference) : '',
    Currency: line.ccy,
    MaturityDate: line.matDate ?? '1900-01-01',
    TypeOf: glEntry?.subType ?? '',
    IssuerId: line.client ?? '',
    IssuerPIT: line.client ? numOrSelf(loadId) : null,
    IsEdited: 1,
    ReportingDate: reportingDate,
  });
  return row;
};

const buildListInsert = (
  table: string, cols: Array<[string, PosColKind]>, row: Record<string, unknown>, comment: string
): string => [
  `-- ${comment}`,
  `IF NOT EXISTS (SELECT 1 FROM ${table} WHERE Id = ${sqlVal(row.Id)} AND PointInTime = ${sqlVal(row.PointInTime)})`,
  `INSERT INTO ${table} (`,
  ...chunk6(cols.map(([n]) => n)),
  `)`,
  `VALUES (`,
  ...chunk6(cols.map(([n]) => sqlVal(row[n]))),
  `);`,
].join('\n');

/** Full script for a no-match line: missing referential rows first (guarded
 * by IF NOT EXISTS — no duplicate if they already exist at the PIT), then
 * the core_positions INSERT. */
export const buildNewPositionPackage = (
  line: AdjustmentLine, loadId: string, reportingDate: string, mappings: AdjustmentMappings,
  opts?: AdjustmentBuildOptions
): string => {
  const parts: string[] = [];
  const sec = isSecurityLine(line, mappings);
  if (line.client) {
    parts.push(buildListInsert('list_counterparties', LIST_CPTY_COLS,
      counterpartyValues(line, loadId, reportingDate, mappings),
      `Referential: ${sec ? 'issuer' : 'counterparty'} ${line.client} at PIT ${loadId} (skipped if it already exists → no C5 orphan)`));
  }
  if (sec) {
    parts.push(buildListInsert('list_securities', LIST_SEC_COLS,
      securityValues(line, loadId, reportingDate, mappings),
      `Referential: security ${newSecurityId(line)} at PIT ${loadId} (GL line is cp_TypeOf = Security)`));
  }
  parts.push(buildNewPositionInsert(line, loadId, reportingDate, mappings, opts));
  return parts.join('\n\n');
};

// ---------------------------------------------------------------------------
// One-shot generation: combined SQL script + Excel of the rows to insert
// ---------------------------------------------------------------------------

export interface AdjustmentItem { line: AdjustmentLine; cand: MatchCandidate | null }

/** JS values (all core_positions columns) of the row a line will generate —
 * copied attributes + overrides when matched, mapping defaults otherwise. */
export const buildPositionRow = (
  item: AdjustmentItem, loadId: string, reportingDate: string, mappings: AdjustmentMappings,
  opts?: AdjustmentBuildOptions
): Record<string, unknown> => {
  const { line, cand } = item;
  if (!cand?.raw) return newPositionValues(line, loadId, reportingDate, mappings, opts);
  const rawKeys = Object.keys(cand.raw);
  const row: Record<string, unknown> = {};
  for (const [name] of CORE_POSITION_COLS) {
    const k = rawKeys.find(x => x.toLowerCase() === name.toLowerCase());
    let v: unknown = k === undefined ? null : cand.raw[k];
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) v = v.slice(0, 10);
    if (typeof v === 'boolean') v = v ? 1 : 0;
    row[name] = v;
  }
  Object.assign(row, adjustmentOverrides(line, cand, mappings));
  return row;
};

/** Single combined script for all resolved lines — one execution in SSMS. */
export const buildAllSql = (
  items: AdjustmentItem[], loadId: string, reportingDate: string, mappings: AdjustmentMappings,
  opts?: AdjustmentBuildOptions
): string => {
  const adj = items.filter(i => i.cand).length;
  const header = [
    `-- ============================================================================`,
    `-- Adjustments one-shot script — load ${loadId} (${reportingDate || 'date ?'})`,
    `-- ${items.length} line(s): ${adj} adjustment(s) from matched positions, ${items.length - adj} new position(s).`,
    `-- Generated by RegReport Production on ${new Date().toISOString().slice(0, 10)}.`,
    `-- Review, then run in SSMS — consider wrapping in BEGIN TRAN / COMMIT.`,
    `-- ============================================================================`,
  ].join('\n');
  return [header, ...items.map(i => (i.cand
    ? buildAdjustmentInsert(i.line, i.cand, loadId, mappings)
    : buildNewPositionPackage(i.line, loadId, reportingDate, mappings, opts)))].join('\n\n');
};

/** Balance-sheet impact of the adjustments, aggregated by
 * LEFT(LegalAccountNumber,3): matched lines hit the account of the chosen
 * position, new lines the GL-mapping account; amounts in CHF (CCY sheet). */
export const computeImpactByPrefix = (
  items: AdjustmentItem[], mappings: AdjustmentMappings
): Map<string, { delta: number; lines: number }> => {
  const per = new Map<string, { delta: number; lines: number }>();
  for (const { line, cand } of items) {
    const lan = cand
      ? String(cand.legalAccountNumber ?? '')
      : (mappings.gl.get(line.ligne)?.legalAccountNumber ?? '');
    const prefix = lan.slice(0, 3) || '???';
    const { chf } = chfOf(line, mappings);
    const e = per.get(prefix) ?? { delta: 0, lines: 0 };
    e.delta = Math.round((e.delta + chf) * 100) / 100;
    e.lines += 1;
    per.set(prefix, e);
  }
  return per;
};

/** Excel workbook: Summary sheet + the core_positions rows to insert (all
 * columns, ready for a bulk import / mass review). Triggers the download. */
export const exportAdjustmentsWorkbook = (
  items: AdjustmentItem[], loadId: string, reportingDate: string, mappings: AdjustmentMappings,
  opts?: AdjustmentBuildOptions
): string => {
  const rows = items.map(i => buildPositionRow(i, loadId, reportingDate, mappings, opts));
  const summary = items.map((i, idx) => ({
    Row: i.line.row,
    LIGNE: i.line.ligne,
    Reference: i.line.reference,
    Client: i.line.client ?? '',
    Montant: i.line.montant,
    CCY: i.line.ccy,
    'BookAmount CHF': rows[idx].BookAmount,
    Mode: i.cand ? `adjustment from ${i.cand.id}` : 'new position (from mappings)',
    'Target Id': rows[idx].Id,
    'GL account': rows[idx].LegalAccountNumber,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Summary');
  XLSX.utils.book_append_sheet(wb,
    XLSX.utils.json_to_sheet(rows, { header: CORE_POSITION_COLS.map(([n]) => n) }),
    'core_positions');
  // Referential companions of the new positions (deduplicated) — same rows the
  // one-shot .sql creates with IF NOT EXISTS.
  const newItems = items.filter(i => !i.cand);
  const cptyRows = new Map<string, Record<string, unknown>>();
  for (const i of newItems) {
    if (!i.line.client || cptyRows.has(i.line.client)) continue;
    cptyRows.set(i.line.client, counterpartyValues(i.line, loadId, reportingDate, mappings));
  }
  if (cptyRows.size > 0) {
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.json_to_sheet(Array.from(cptyRows.values()), { header: LIST_CPTY_COLS.map(([n]) => n) }),
      'list_counterparties');
  }
  const secRows = newItems.filter(i => isSecurityLine(i.line, mappings))
    .map(i => securityValues(i.line, loadId, reportingDate, mappings));
  if (secRows.length > 0) {
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.json_to_sheet(secRows, { header: LIST_SEC_COLS.map(([n]) => n) }),
      'list_securities');
  }
  const name = `adjustments-load${loadId}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, name);
  return name;
};
