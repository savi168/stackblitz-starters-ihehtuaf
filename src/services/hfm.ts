/**
 * IFRS (HFM) mapping helpers — kept free of any xlsx dependency so the
 * balance-sheet views can import them without pulling the workbook parser
 * into the main bundle.
 *
 * A MERCURY LegalAccountNumber maps to an HFM (IFRS) account through the
 * Mapping_GL_BALANCESHEET sheet (HFM_Account column, stored as
 * ProdMappingEntries kind "hfm"); when the sheet has no mapping for the
 * account (bs_PL null / HFM_Account = IGNORE), the prefix fallback below
 * applies — it mirrors the team's HFM Power Query CASE, and can be
 * overridden per prefix via ProdMappingEntries rows of kind "hfmrule"
 * (mapKey = LEFT-3 prefix, textValue = HFM account).
 */
export const HFM_PREFIX_RULES: Record<string, string> = {
  '101': '111 00 02', '102': '113 00 01', '103': '113 00 01', '104': '116 00 01',
  '106': '114 00 00 03', '107': '115 00 01 01', '109': '117 00 00 01',
  '110': '123 00 01', '111': '118 00 01', '112': '120 00 01', '114': '123 00 01',
  '201': '211 00 01', '203': '213 00 01', '204': '214 01 01', '205': '212 00 01 01',
  '208': '214 01 01', '209': '218 02 01', '210': '218 02 01',
  '211': '218 03 01', '212': '218 03 01',
  '213': '311 00 10', '214': '311 00 10', '215': '311 00 10',
  '216': '311 00 10', '218': '311 00 10', '219': '311 00 10',
};

/** HFM account of a MERCURY account, given the stored direct map and the
 * per-prefix rule overrides (both may be empty). */
export const hfmKeyOf = (
  account: string,
  direct: Map<string, string>,
  ruleOverrides?: Map<string, string>,
): string => {
  const d = direct.get(account);
  if (d && d.toUpperCase() !== 'IGNORE') return d;
  const pfx = account.slice(0, 3);
  return ruleOverrides?.get(pfx) ?? HFM_PREFIX_RULES[pfx] ?? '— unmapped —';
};
