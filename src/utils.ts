

import { KpiHistoryEntry, CalculatedKpis, Deadline, KpiThresholds, LiquidityDataPoint } from './types';

export const formatNumber = (num: number, digits: number = 0): string => {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(num);
};

export const formatDate = (dateStr: string): string => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
};

export const parseDateToYmd = (dateStr: string): string => {
    if (!dateStr || typeof dateStr !== 'string') return '';
    const trimmedDate = dateStr.trim();

    // Case 1: YYYY-MM-DD (ISO format)
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
        const d = new Date(trimmedDate);
        if (!isNaN(d.getTime())) return trimmedDate;
    }

    // Case 2: DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY (European format)
    const euroMatch = trimmedDate.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (euroMatch) {
        const [, day, month, year] = euroMatch;
        const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const d = new Date(ymd  + 'T00:00:00Z');
        if (!isNaN(d.getTime())) {
            return ymd;
        }
    }
    
    // Fallback for other JS-parsable formats (like MM/DD/YYYY)
    const d = new Date(trimmedDate);
    if (!isNaN(d.getTime())) {
         const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        if (year > 1900 && year < 2100) {
            return `${year}-${month}-${day}`;
        }
    }

    return '';
};


export const calculateKpis = (kpi: KpiHistoryEntry, currency: string = 'TOT'): CalculatedKpis | null => {
    if (!kpi) return null;

    const rwaTotal = kpi.creditRWA + kpi.marketRWA + kpi.opRWA + (kpi.otherRWA || 0);
    
    let liquidityData: Partial<LiquidityDataPoint> = {};

    if (kpi.liquidity) {
        if (currency === 'TOT' && kpi.liquidity.TOT) {
            liquidityData = kpi.liquidity.TOT;
        } else if (currency === 'TOT') {
            // Aggregate all currencies if TOT is not pre-calculated
            liquidityData = Object.values(kpi.liquidity).reduce((acc, curr) => {
                const numericKeys: (keyof LiquidityDataPoint)[] = ['hqla', 'netCashOutflows', 'asf', 'rsf'];
                numericKeys.forEach(key => {
                    const val = curr[key];
                    if (typeof val === 'number') {
                        (acc[key] as number) = (acc[key] as number || 0) + val;
                    }
                });
                return acc;
            }, { hqla: 0, netCashOutflows: 0, asf: 0, rsf: 0 } as LiquidityDataPoint);
        } else {
            liquidityData = kpi.liquidity[currency] || {};
        }
    }

    const { hqla = 0, netCashOutflows = 0, asf = 0, rsf = 0 } = liquidityData;

    const calculated: CalculatedKpis = {
        ...kpi,
        ...liquidityData,
        rwaTotal,
        cet1: rwaTotal > 0 ? ((kpi.cet1Capital / rwaTotal) * 100).toFixed(2) : '0.00',
        lcr: netCashOutflows > 0 ? ((hqla / netCashOutflows) * 100).toFixed(2) : '0.00',
        nsfr: asf > 0 && rsf > 0 ? ((asf / rsf) * 100).toFixed(2) : 'N/A',
        leverage: kpi.exposure > 0 ? ((kpi.tier1 / kpi.exposure) * 100).toFixed(2) : '0.00',
    };
    return calculated;
};

export const getStatusClass = (value: string | number, thresholds?: KpiThresholds): string => {
    const numValue = parseFloat(String(value));
    if (isNaN(numValue) || !thresholds) return 'text-gray-500';

    if (numValue < thresholds.red) return 'text-red-600';
    if (numValue < thresholds.amber) return 'text-yellow-600';
    return 'text-green-700';
};

export const getStatusColor = (value: string | number, thresholds?: KpiThresholds): string => {
    const numValue = parseFloat(String(value));
     if (isNaN(numValue) || !thresholds) return '#6b7280'; // gray-500

    if (numValue < thresholds.red) return '#dc2626'; // red-600
    if (numValue < thresholds.amber) return '#d97706'; // yellow-600
    return '#15803d'; // green-700
};

export const calculateRegulatoryDeadline = (dueDateStr: string): string => {
    if (!dueDateStr) return 'N/A';
    
    const startDate = new Date(dueDateStr + 'T00:00:00Z');
    if (isNaN(startDate.getTime())) return 'N/A';

    let count = 0;
    const currentDate = new Date(startDate.getTime());
    
    while (count < 10) {
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        const dayOfWeek = currentDate.getUTCDay(); // 0 = Sunday, 6 = Saturday
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            count++;
        }
    }
    
    return currentDate.toISOString().split('T')[0];
};

export const getStatusBadge = (status: Deadline['status']) => {
    switch (status) {
        case 'completed': return 'bg-green-100 text-green-800';
        case 'inprogress': return 'bg-orange-100 text-orange-800';
        case 'upcoming': return 'bg-yellow-100 text-yellow-800';
        default: return 'bg-gray-100 text-gray-800';
    }
};

export const getTypeBadge = (type: Deadline['type']) => {
    switch (type) {
        case 'regulatory': return 'bg-purple-100 text-purple-800';
        case 'internal': return 'bg-indigo-100 text-indigo-800';
        default: return 'bg-gray-100 text-gray-800';
    }
};

// --- WATERFALL CHART UTILS ---

type WaterfallDataPoint = { name: string; value: number };

export const calculateCet1RatioEvolutionData = (startData: CalculatedKpis, endData: CalculatedKpis) => {
    if (!startData.cet1CapitalBreakdown || !endData.cet1CapitalBreakdown || !endData.cet1CapitalBreakdown.dividend || startData.rwaTotal === 0) return null;

    const startRatio = parseFloat(startData.cet1);
    const endRatio = parseFloat(endData.cet1);

    const { cet1CapitalBreakdown: startB, rwaTotal: startRwa } = startData;
    const { cet1CapitalBreakdown: endB, rwaTotal: endRwa } = endData;

    // --- Calculate capital deltas ---
    const pnlDelta = endB.pnl - (startB.pnl || 0);
    const dividendDelta = -(endB.dividend || 0);
    const buybackDelta = -(endB.shareBuyback - startB.shareBuyback);
    
    // Other capital movements (equity changes, other deductions)
    const otherCapitalDelta = (endData.cet1Capital - endB.pnl) - (startData.cet1Capital - startB.pnl) - buybackDelta - dividendDelta;


    // --- Calculate ratio impacts (bps) ---
    // Approximation: impact of capital change is delta Capital / start RWA
    const pnlImpact = (pnlDelta / startRwa) * 100;
    const dividendImpact = (dividendDelta / startRwa) * 100;
    const shareBuybackImpact = (buybackDelta / startRwa) * 100;
    const otherCapitalImpact = (otherCapitalDelta / startRwa) * 100;
    
    // RWA impact is the change in ratio due to change in RWA denominator
    const capitalAfterMovements = startData.cet1Capital + pnlDelta + dividendDelta + buybackDelta + otherCapitalDelta;
    const rwaImpact = ((capitalAfterMovements / endRwa) * 100) - ((capitalAfterMovements / startRwa) * 100);

    const totalCalculatedImpact = pnlImpact + dividendImpact + shareBuybackImpact + otherCapitalImpact + rwaImpact;
    const plug = (endRatio - startRatio) - totalCalculatedImpact;

    return {
        startData: {
            date: formatDate(startData.date),
            cet1Ratio: startRatio,
        },
        endData: {
            date: formatDate(endData.date),
            cet1Ratio: endRatio,
        },
        deltas: [
            { name: 'P&L & non-cash', value: pnlImpact },
            { name: 'RWA & FX/CTA', value: rwaImpact },
            { name: 'Dividend', value: dividendImpact },
            { name: 'Share Buyback', value: shareBuybackImpact },
            { name: 'Other', value: otherCapitalImpact + plug },
        ].filter(d => Math.abs(d.value) > 0.005)
    };
};


export const calculateRwaWaterfallData = (startData: CalculatedKpis, endData: CalculatedKpis): WaterfallDataPoint[] => {
    const creditDelta = endData.creditRWA - startData.creditRWA;
    const marketDelta = endData.marketRWA - startData.marketRWA;
    const opDelta = endData.opRWA - startData.opRWA;
    const otherDelta = endData.otherRWA - startData.otherRWA;

    return [
        { name: 'Start', value: startData.rwaTotal },
        { name: 'Credit', value: creditDelta },
        { name: 'Market', value: marketDelta },
        { name: 'Operational', value: opDelta },
        { name: 'Other', value: otherDelta },
        { name: 'End', value: endData.rwaTotal },
    ].filter(d => d.value !== 0 || d.name.includes('Start') || d.name.includes('End'));
};

export const calculateLcrWaterfallData = (startData: CalculatedKpis, endData: CalculatedKpis): WaterfallDataPoint[] => {
    const startLcr = parseFloat(startData.lcr);
    const endLcr = parseFloat(endData.lcr);
    if (isNaN(startLcr) || isNaN(endLcr) || !startData.netCashOutflows || startData.netCashOutflows === 0) return [];
    if (!endData.hqla) return [];

    // Calculate an intermediate LCR holding NCO constant to isolate the impact of HQLA change
    const interimLcr = (endData.hqla / startData.netCashOutflows) * 100;

    const hqlaImpact = interimLcr - startLcr;
    const ncoImpact = endLcr - interimLcr;

    return [
        { name: 'Start', value: startLcr },
        { name: 'HQLA Δ', value: hqlaImpact },
        { name: 'NCO Δ', value: ncoImpact },
        { name: 'End', value: endLcr },
    ];
};