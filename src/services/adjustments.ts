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

export interface AdjustmentMappings {
  gl: Map<string, GlMapEntry>;              // LIGNE → GL entry
  fx: Map<string, number>;                  // CCY → CHF rate per 1 unit
  rt01: Map<string, string>;                // CATEG (RT01) → QDL TypeOf
  industry: Map<string, { typeOf?: string; economicActivityType?: string }>;
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
}

const norm = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();
const numOf = (v: unknown): number | undefined => {
  if (typeof v === 'number' && isFinite(v)) return v;
  const n = Number(String(v ?? '').replace(/['\s]/g, '').replace(',', '.'));
  return isFinite(n) && String(v ?? '').trim() !== '' ? n : undefined;
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

  // GL balance sheet mapping
  const gl = new Map<string, GlMapEntry>();
  {
    const rows = sheetRows(need('Mapping_GL_BALANCESHEET'));
    const h = rows[0] || [];
    const iLine = headerIndex(h, 'Line');
    const iLan = headerIndex(h, 'Legal Account Number');
    const iType = headerIndex(h, 'cp_TypeOf');
    const iSub = headerIndex(h, 'cp_SubType');
    const iDesc = headerIndex(h, 'Combined.DESC', 'CAO_DM.RepLineHFMDsc');
    if (iLine === -1 || iLan === -1) throw new Error('Mapping_GL_BALANCESHEET: columns "Line" and "Legal Account Number" are required.');
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

  // Industry codes
  const industry = new Map<string, { typeOf?: string; economicActivityType?: string }>();
  {
    const rows = sheetRows(need('INDUSTRY'));
    const h = rows[0] || [];
    const iId = headerIndex(h, 'ID');
    const iType = headerIndex(h, 'TypeOf');
    const iEco = headerIndex(h, 'EconomicActivityType');
    for (let r = 1; r < rows.length; r++) {
      const id = norm(rows[r]?.[iId]);
      if (!id) continue;
      industry.set(id, {
        typeOf: iType >= 0 ? norm(rows[r]?.[iType]) || undefined : undefined,
        economicActivityType: iEco >= 0 ? norm(rows[r]?.[iEco]) || undefined : undefined,
      });
    }
  }

  return { gl, fx, rt01, industry };
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
  };
};

/** Adjustment INSERT based on an existing matched position (attributes copied). */
export const buildAdjustmentInsert = (
  line: AdjustmentLine, cand: MatchCandidate, loadId: string, mappings: AdjustmentMappings
): string => {
  const rate = mappings.fx.get(line.ccy) ?? 1;
  const chf = Math.round(line.montant * rate * 100) / 100;
  const adjId = `${cand.id}-ADJ-${line.row}`;
  return [
    `-- Adjustment for accounting line ${line.ligne} (row ${line.row})${line.libelle ? ` — ${line.libelle}` : ''}`,
    `-- Matched position ${cand.id} (account ${cand.legalAccountNumber}); MONTANT ${line.montant} ${line.ccy}${line.ccy !== 'CHF' ? ` → ${chf} CHF @${rate}` : ''}`,
    `-- 1) CHECK:`,
    `SELECT * FROM core_positions WHERE LoadId = ${loadId} AND Id = ${q(adjId)};`,
    `-- 2) INSERT (all other NOT NULL columns are copied from the matched position):`,
    `INSERT INTO core_positions (Id, LoadId, BookingCenterId, LegalAccountNumber, Currency, LocationCountry,`,
    `    InternalReference1, InternalReference2, InternalReference3, InternalReference4, InternalReference5,`,
    `    DataSource, PositionCurrencyBookAmount, BookAmount, EncumberedFlag, EncumberedAmount, EncumbranceEndDate,`,
    `    Notional, InternalLendingValue, PV, Provision, Capacity, MaturityDate, MaturityType, ImpairedFlag,`,
    `    NonPerformingFlag, RatingClass, IRBFlag, RelatedPartyType, Subordination, PriorityClaimLevel,`,
    `    ParticipationLevel, GoodsXBorderFlag, PledgeLink, StartDate, GeneralLedger, TradingBookFlag,`,
    `    NumberOfComponents, LongContractFlag, NettingSetId, NettingAgreementType, CounterpartyId, CounterpartyPIT,`,
    `    CounterpartyBookingCenterId, MarginAgreementId, MarginAgreementPIT, ClearingFacilityTypeOf, ClearingFacilityId,`,
    `    ClearingFacilityPIT, PledgedFlag, PledgeEndDate, CollateralHolderId, CollateralHolderPIT, ContractId,`,
    `    PropertyId, PropertyPIT, Account, DerivativeId, DerivativeSwapId, SecurityId, SecurityPIT, CommodityId,`,
    `    CommodityPIT, IRReference, IRSpread, InterestRate, IRTypeOf, IRNextFixingDate, IRReFixingFrequency,`,
    `    IRNextPaymentDate, IRPaymentFrequency, IRCompoundingType, TypeOf, SubType, IRDayCount, IRSpreadFlag,`,
    `    GuarantorId, GuarantorPIT, IsEdited, CryptoAssetId, CryptoAssetPIT, ReportingDate, CreditFacilityId,`,
    `    PortfolioAdjustmentProvisionId, PortfolioAdjustmentProvisionPIT)`,
    `SELECT ${q(adjId)}, LoadId, BookingCenterId, LegalAccountNumber, ${q(line.ccy)}, LocationCountry,`,
    `    ${q(String(line.reference))}, InternalReference2, InternalReference3, InternalReference4, InternalReference5,`,
    `    'ADJUSTMENT', ${line.montant}, ${chf}, EncumberedFlag, 0, EncumbranceEndDate,`,
    `    ${line.nominal ?? 0}, 0, 0, 0, Capacity, MaturityDate, MaturityType, ImpairedFlag,`,
    `    NonPerformingFlag, RatingClass, IRBFlag, RelatedPartyType, Subordination, PriorityClaimLevel,`,
    `    ParticipationLevel, GoodsXBorderFlag, PledgeLink, StartDate, GeneralLedger, TradingBookFlag,`,
    `    NumberOfComponents, LongContractFlag, NettingSetId, NettingAgreementType, CounterpartyId, CounterpartyPIT,`,
    `    CounterpartyBookingCenterId, MarginAgreementId, MarginAgreementPIT, ClearingFacilityTypeOf, ClearingFacilityId,`,
    `    ClearingFacilityPIT, PledgedFlag, PledgeEndDate, CollateralHolderId, CollateralHolderPIT, ContractId,`,
    `    PropertyId, PropertyPIT, Account, DerivativeId, DerivativeSwapId, SecurityId, SecurityPIT, CommodityId,`,
    `    CommodityPIT, IRReference, IRSpread, InterestRate, IRTypeOf, IRNextFixingDate, IRReFixingFrequency,`,
    `    IRNextPaymentDate, IRPaymentFrequency, IRCompoundingType, TypeOf, SubType, IRDayCount, IRSpreadFlag,`,
    `    GuarantorId, GuarantorPIT, 1, CryptoAssetId, CryptoAssetPIT, ReportingDate, CreditFacilityId,`,
    `    PortfolioAdjustmentProvisionId, PortfolioAdjustmentProvisionPIT`,
    `FROM core_positions WHERE LoadId = ${loadId} AND Id = ${q(cand.id)};`,
  ].join('\n');
};

/** Full new position when no candidate exists — built from the mappings. */
export const buildNewPositionInsert = (
  line: AdjustmentLine, loadId: string, reportingDate: string, mappings: AdjustmentMappings
): string => {
  const glEntry = mappings.gl.get(line.ligne);
  const rate = mappings.fx.get(line.ccy) ?? 1;
  const chf = Math.round(line.montant * rate * 100) / 100;
  const ind = line.ind ? mappings.industry.get(line.ind) : undefined;
  const rt = line.categ ? mappings.rt01.get(line.categ) : undefined;
  const newId = `ADJ-${line.ligne}-${line.row}`;
  const lan = glEntry?.legalAccountNumber ?? '0';
  return [
    `-- New position for accounting line ${line.ligne} (row ${line.row}) — no match found in load ${loadId}`,
    `-- GL mapping: account ${lan}, TypeOf ${glEntry?.typeOf ?? '?'}${glEntry?.subType ? `/${glEntry.subType}` : ''}${glEntry?.description ? ` (${glEntry.description})` : ''}`,
    `-- Counterparty ${line.client ?? '?'} — IND ${line.ind ?? '—'} → ${ind?.typeOf ?? '?'}/${ind?.economicActivityType ?? '?'} · CATEG ${line.categ ?? '—'} → ${rt ?? '?'}`,
    `-- ⚠ Review every default before executing (all NOT NULL columns get neutral values).`,
    `-- 1) CHECK:`,
    `SELECT * FROM core_positions WHERE LoadId = ${loadId} AND Id = ${q(newId)};`,
    `-- 2) INSERT:`,
    `INSERT INTO core_positions (Id, LoadId, BookingCenterId, LegalAccountNumber, Currency, LocationCountry,`,
    `    InternalReference1, InternalReference2, InternalReference3, InternalReference4, InternalReference5,`,
    `    DataSource, PositionCurrencyBookAmount, BookAmount, EncumberedFlag, EncumberedAmount, EncumbranceEndDate,`,
    `    Notional, InternalLendingValue, PV, Provision, Capacity, MaturityDate, MaturityType, ImpairedFlag,`,
    `    NonPerformingFlag, RatingClass, IRBFlag, RelatedPartyType, Subordination, PriorityClaimLevel,`,
    `    ParticipationLevel, GoodsXBorderFlag, PledgeLink, StartDate, GeneralLedger, TradingBookFlag,`,
    `    NumberOfComponents, LongContractFlag, NettingSetId, NettingAgreementType, CounterpartyId, CounterpartyPIT,`,
    `    CounterpartyBookingCenterId, MarginAgreementId, MarginAgreementPIT, ClearingFacilityTypeOf, ClearingFacilityId,`,
    `    ClearingFacilityPIT, PledgedFlag, PledgeEndDate, CollateralHolderId, CollateralHolderPIT, ContractId,`,
    `    PropertyId, PropertyPIT, Account, DerivativeId, DerivativeSwapId, SecurityId, SecurityPIT, CommodityId,`,
    `    CommodityPIT, IRReference, IRSpread, InterestRate, IRTypeOf, IRNextFixingDate, IRReFixingFrequency,`,
    `    IRNextPaymentDate, IRPaymentFrequency, IRCompoundingType, TypeOf, SubType, IRDayCount, IRSpreadFlag,`,
    `    GuarantorId, GuarantorPIT, IsEdited, CryptoAssetId, CryptoAssetPIT, ReportingDate, CreditFacilityId,`,
    `    PortfolioAdjustmentProvisionId, PortfolioAdjustmentProvisionPIT)`,
    `VALUES (${q(newId)}, ${loadId}, '', ${lan}, ${q(line.ccy)}, '',`,
    `    ${q(String(line.reference))}, '', '', '', '',`,
    `    'ADJUSTMENT', ${line.montant}, ${chf}, 0, 0, '1900-01-01',`,
    `    ${line.nominal ?? 0}, 0, 0, 0, '', '1900-01-01', '', 0,`,
    `    0, 0, 0, '', 0, 0,`,
    `    0, 0, '', '1900-01-01', '', 0,`,
    `    0, 0, '', '', ${q(line.client ?? '')}, ${loadId},`,
    `    '', '', NULL, '', '',`,
    `    NULL, 0, '1900-01-01', '', NULL, '',`,
    `    '', NULL, '', '', '', '', NULL, '',`,
    `    NULL, '', 0, 0, '', '1900-01-01', '',`,
    `    '1900-01-01', '', '', ${q(glEntry?.typeOf ?? '')}, ${q(glEntry?.subType ?? '')}, '', 0,`,
    `    '', NULL, 1, '', NULL, ${q(reportingDate)}, '',`,
    `    '', NULL);`,
  ].join('\n');
};
