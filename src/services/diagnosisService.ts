import { KpiHistoryEntry, DiagnosisResult } from '../types';

export const diagnoseKpiData = (
  currentEntry: KpiHistoryEntry,
  previousEntry?: KpiHistoryEntry
): DiagnosisResult[] => {
  const results: DiagnosisResult[] = [];

  // 1. Retail Deposits Control (Example: LCR Outflows Retail)
  if (currentEntry.liquidity?.['TOT']?.netCashOutflowsBreakdown?.outflows?.retail) {
    const currentRetail = currentEntry.liquidity['TOT'].netCashOutflowsBreakdown.outflows.retail;
    
    if (previousEntry?.liquidity?.['TOT']?.netCashOutflowsBreakdown?.outflows?.retail) {
      const prevRetail = previousEntry.liquidity['TOT'].netCashOutflowsBreakdown.outflows.retail;
      const variation = (currentRetail - prevRetail) / (prevRetail || 1);
      
      // If variation > 15%, flag it
      if (Math.abs(variation) > 0.15) {
        results.push({
          severity: 'warning',
          category: 'LCR Outflows',
          message: `Significant variation in Retail Outflows: ${(variation * 100).toFixed(2)}% vs previous period.`,
          field: 'liquidity.TOT.netCashOutflowsBreakdown.outflows.retail'
        });
      }
    }
  }

  // 2. Capital Adequacy - RWA consistency
  if (currentEntry.creditRWA && currentEntry.exposure) {
    const rwaDensity = currentEntry.creditRWA / currentEntry.exposure;
    if (rwaDensity > 0.60) {
      results.push({
        severity: 'info',
        category: 'Capital',
        message: `High RWA density detected (${(rwaDensity * 100).toFixed(2)}%). Verification of asset risk weightings recommended.`,
        field: 'creditRWA'
      });
    }
  }

  // 3. Negative Values Check (except for deductions)
  const numericFields: (keyof KpiHistoryEntry)[] = ['cet1Capital', 'creditRWA', 'marketRWA', 'tier1', 'exposure'];
  numericFields.forEach(field => {
    const val = currentEntry[field];
    if (typeof val === 'number' && val < 0) {
      results.push({
        severity: 'error',
        category: 'Data Integrity',
        message: `Negative value detected for ${field}. This is usually a sign of incorrect sign convention in source data.`,
        field: field.toString()
      });
    }
  });

  return results;
};
