import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useData } from '../context/DataContext';
import { CalculatedKpis } from '../types';
import { formatDate, calculateRwaWaterfallData, calculateLcrWaterfallData, calculateCet1RatioEvolutionData, calculateKpis } from '../utils';
import { Card, PageHeader, BackButton, Select, SectionHeader, KpiDetailCard, HistoricalCompositionTable, TopCounterpartiesTable, WaterfallChart, CapitalEvolutionChart, MultiEntityKpiChart, HqlaEvolutionChart, CashflowEvolutionChart, TabButton } from '../components';

export const KpiDetailsPage: React.FC = () => {
    const { allEntities, getKpisForDate, data } = useData();
    const [entity, setEntity] = useState(allEntities[0] || '');
    const [activeTab, setActiveTab] = useState<'overview' | 'capital' | 'liquidity'>('overview');
    const [activeCurrency, setActiveCurrency] = useState('TOT');
    const [period, setPeriod] = useState(12);
    const [isExporting, setIsExporting] = useState(false);
    const reportRef = useRef<HTMLDivElement>(null);


    const handleSetOverviewTab = useCallback(() => setActiveTab('overview'), []);
    const handleSetCapitalTab = useCallback(() => setActiveTab('capital'), []);
    const handleSetLiquidityTab = useCallback(() => setActiveTab('liquidity'), []);

    const availableDates = useMemo(() => {
        return Array.from(new Set(data.kpisHistory.filter(k => k.entity === entity).map(k => k.date)))
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    }, [entity, data.kpisHistory]);

    const [date, setDate] = useState(availableDates[0] || '');
    const [compareDate, setCompareDate] = useState<string>('');

     useEffect(() => {
        if (availableDates.length > 0 && !availableDates.includes(date)) {
            setDate(availableDates[0]);
        } else if (availableDates.length === 0) {
            setDate('');
        }
        setCompareDate(''); // Reset comparison on entity change
    }, [entity, availableDates, date]);
    
    const kpiData = useMemo(() => getKpisForDate(entity, date, activeCurrency), [entity, date, getKpisForDate, activeCurrency]);
    const compareKpiData = useMemo(() => getKpisForDate(entity, compareDate, activeCurrency), [entity, compareDate, getKpisForDate, activeCurrency]);

    const thresholds = useMemo(() => data.riskAppetite[entity], [entity, data.riskAppetite]);
    
    const kpiHistory = useMemo(() => {
        const history = data.kpisHistory
            .filter(k => k.entity === entity)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .map(k => calculateKpis(k, activeCurrency))
            .filter((k): k is CalculatedKpis => k !== null);
        return history.slice(-period);
    }, [entity, period, data.kpisHistory, activeCurrency]);
    
    const allKpisHistoryLast12m = useMemo(() => {
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

        return data.kpisHistory
            .filter(k => new Date(k.date) >= twelveMonthsAgo)
            .map(k => calculateKpis(k, 'TOT'))
            .filter((k): k is CalculatedKpis => k !== null)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [data.kpisHistory]);

    const availableCurrencies = useMemo(() => {
        const entry = data.kpisHistory.find(k => k.entity === entity && k.date === date);
        if (!entry || !entry.liquidity) return ['TOT'];
        return ['TOT', ...Object.keys(entry.liquidity).filter(c => c !== 'TOT')];
    }, [entity, date, data.kpisHistory]);

    useEffect(() => {
        if (!availableCurrencies.includes(activeCurrency)) {
            setActiveCurrency('TOT');
        }
    }, [availableCurrencies, activeCurrency]);

    const handleExportPdf = async () => {
        if (!reportRef.current) {
            alert("No content to export.");
            return;
        }
        setIsExporting(true);
        try {
            // Loaded on demand to keep these heavy libraries out of the initial bundle.
            const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
                import('jspdf'),
                import('html2canvas'),
            ]);
            // Render at ~350 DPI equivalent so text and charts stay crisp.
            // Cap at 4x to keep memory in check on long reports.
            const scale = Math.min(4, Math.max(3, window.devicePixelRatio || 1));

            // Fixes applied to the *cloned* DOM only (the on-screen render is
            // untouched), reused for every section capture:
            //  1) Kill the `.animate-fade-in` animation — cloning restarts it and
            //     html2canvas would otherwise snapshot the content mid-fade
            //     (translucent / washed out).
            //  2) Re-apply solid brand colours: html2canvas 1.4.1 mis-parses
            //     Tailwind's `rgb(r g b / <alpha>)` syntax.
            const onclone = (clonedDoc: Document) => {
                const reset = clonedDoc.createElement('style');
                reset.textContent =
                    '*,*::before,*::after{animation:none!important;' +
                    'transition:none!important;opacity:1!important;}';
                clonedDoc.head.appendChild(reset);

                const paint = (selector: string, styles: Partial<CSSStyleDeclaration>) => {
                    clonedDoc.querySelectorAll<HTMLElement>(selector).forEach((el) => {
                        Object.assign(el.style, styles);
                    });
                };
                paint('.text-brand-text-primary', { color: '#2B3338' });
                paint('.text-brand-text-secondary', { color: '#6B7780' });
                paint('.text-brand-primary', { color: '#8C3A38' });
                paint('.bg-brand-secondary', { backgroundColor: '#52616A', color: '#FFFFFF' });
                paint('.bg-brand-primary', { backgroundColor: '#8C3A38', color: '#FFFFFF' });
                paint('.bg-brand-bg-body', { backgroundColor: '#F4F5F4' });
                paint('.bg-gray-50', { backgroundColor: '#F9FAFB' });
                paint('.text-white', { color: '#FFFFFF' });
                paint('.text-white\\/80', { color: '#E6E9EA' });
            };

            const captureWidth = reportRef.current.scrollWidth;
            const renderBlock = (el: HTMLElement) =>
                html2canvas(el, { scale, useCORS: true, backgroundColor: '#ffffff', windowWidth: captureWidth, onclone });

            const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const margin = 20;
            const contentWidth = pdfWidth - margin * 2;
            const pageContentHeight = pdfHeight - margin * 2;
            const gap = 14;

            // Each section card is captured on its own so a card is never split
            // across a page boundary unless it is taller than a whole page.
            const inner = reportRef.current.querySelector('.animate-fade-in')?.firstElementChild;
            const blocks = (inner && inner.children.length > 0)
                ? Array.from(inner.children) as HTMLElement[]
                : [reportRef.current];

            let cursorY = margin;
            let pageIsEmpty = true;

            for (const block of blocks) {
                const canvas = await renderBlock(block);
                const imgData = canvas.toDataURL('image/png');
                const imgHeight = (canvas.height * contentWidth) / canvas.width;

                if (imgHeight <= pageContentHeight) {
                    // Whole block fits on a page — start a new one if it won't
                    // fit in the remaining space.
                    if (!pageIsEmpty && cursorY + imgHeight > pdfHeight - margin) {
                        pdf.addPage();
                        cursorY = margin;
                        pageIsEmpty = true;
                    }
                    pdf.addImage(imgData, 'PNG', margin, cursorY, contentWidth, imgHeight, undefined, 'MEDIUM');
                    cursorY += imgHeight + gap;
                    pageIsEmpty = false;
                } else {
                    // Block taller than a page — give it its own page(s) and slice.
                    if (!pageIsEmpty) { pdf.addPage(); cursorY = margin; }
                    let pos = margin;
                    let drawn = pageContentHeight;
                    pdf.addImage(imgData, 'PNG', margin, pos, contentWidth, imgHeight, undefined, 'MEDIUM');
                    while (drawn < imgHeight) {
                        pdf.addPage();
                        pos -= pageContentHeight;
                        pdf.addImage(imgData, 'PNG', margin, pos, contentWidth, imgHeight, undefined, 'MEDIUM');
                        drawn += pageContentHeight;
                    }
                    // Mark page full so the next block starts fresh (no blank page).
                    cursorY = pdfHeight;
                    pageIsEmpty = false;
                }
            }

            pdf.save(`KPI_Report_${entity}_${date}.pdf`);

        } catch (error) {
            console.error("Error generating PDF:", error);
            alert("Sorry, there was an error creating the PDF report.");
        } finally {
            setIsExporting(false);
        }
    };


    const cet1EvolutionData = useMemo(() => (kpiData && compareKpiData) ? calculateCet1RatioEvolutionData(compareKpiData, kpiData) : null, [kpiData, compareKpiData]);
    const rwaWaterfallData = useMemo(() => (kpiData && compareKpiData) ? calculateRwaWaterfallData(compareKpiData, kpiData) : [], [kpiData, compareKpiData]);
    const lcrWaterfallData = useMemo(() => (kpiData && compareKpiData && kpiData.netCashOutflows && compareKpiData.netCashOutflows) ? calculateLcrWaterfallData(compareKpiData, kpiData) : [], [kpiData, compareKpiData]);
    
     const counterpartyData = useMemo(() => {
        return data.counterpartyRwa.filter(c => c.entity === entity && c.date === date);
    }, [data.counterpartyRwa, entity, date]);

    return (
        <div className="p-5 md:p-8">
            <BackButton />
            <PageHeader icon="🔍" title="KPI Analysis" subtitle="Detailed breakdown, historical trends and risk appetite" />
            
            <div className="mb-6 border-b border-efg-line">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <TabButton label="Overview" isActive={activeTab === 'overview'} onClick={handleSetOverviewTab} />
                    <TabButton label="Capital Adequacy" isActive={activeTab === 'capital'} onClick={handleSetCapitalTab} />
                    <TabButton label="Liquidity" isActive={activeTab === 'liquidity'} onClick={handleSetLiquidityTab} />
                </nav>
            </div>

            {activeTab !== 'overview' && (
                <Card className="mb-8">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        <Select label="Entity" value={entity} onChange={e => setEntity(e.target.value)}>
                            {allEntities.map(e => <option key={e} value={e}>{e}</option>)}
                        </Select>
                        <Select label="Date" value={date} onChange={e => setDate(e.target.value)}>
                            {availableDates.map(d => <option key={d} value={d}>{formatDate(d)}</option>)}
                        </Select>
                        <Select label="Compare to" value={compareDate} onChange={e => setCompareDate(e.target.value)}>
                            <option value="">Select date to compare</option>
                            {availableDates.filter(d => d < date).map(d => <option key={d} value={d}>{formatDate(d)}</option>)}
                        </Select>
                         <Select label="History" value={period} onChange={e => setPeriod(Number(e.target.value))}>
                            <option value={3}>Last 3 months</option>
                            <option value={6}>Last 6 months</option>
                            <option value={12}>Last 12 months</option>
                        </Select>
                        <div className="flex items-end">
                            <button
                                onClick={handleExportPdf}
                                disabled={isExporting}
                                className="w-full bg-brand-secondary hover:bg-brand-secondary-dark text-white text-sm font-semibold py-3 px-4 rounded-md transition-colors disabled:bg-gray-400"
                            >
                                {isExporting ? 'Exporting…' : 'Export PDF'}
                            </button>
                        </div>
                    </div>
                </Card>
            )}

            <div ref={reportRef}>
                {kpiData || activeTab === 'overview' ? (
                    <div key={activeTab} className="animate-fade-in">
                        {activeTab === 'overview' && (
                            <div className="space-y-8">
                               <Card>
                                   <SectionHeader title="Multi-Entity Ratio Evolution" suffix="(last 12 months)" />
                                   <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                                        <MultiEntityKpiChart historicalData={allKpisHistoryLast12m} kpiKey="cet1" title="CET1 Ratio" />
                                        <MultiEntityKpiChart historicalData={allKpisHistoryLast12m} kpiKey="leverage" title="Leverage Ratio" />
                                        <MultiEntityKpiChart historicalData={allKpisHistoryLast12m} kpiKey="lcr" title="LCR" />
                                        <MultiEntityKpiChart historicalData={allKpisHistoryLast12m} kpiKey="nsfr" title="NSFR" />
                                   </div>
                               </Card>
                            </div>
                        )}
                        {activeTab === 'capital' && kpiData && (
                            <div className="space-y-8">
                                 {compareKpiData && (
                                    <Card>
                                        <SectionHeader title="Variance Analysis" suffix={`${formatDate(compareKpiData.date)} vs ${formatDate(kpiData.date)}`} />
                                        <div className="space-y-12">
                                            {cet1EvolutionData ? (
                                                <CapitalEvolutionChart data={cet1EvolutionData} />
                                            ) : (
                                                <div><h3 className="text-lg font-bold text-brand-text-primary mb-2 text-center">Evolution CET1 Capital Ratio</h3><p className="text-center text-brand-text-secondary">Not enough data for CET1 ratio evolution analysis.</p></div>
                                            )}
                                            <div className="pt-8">
                                               <WaterfallChart title="Total RWA Variance (mCHF)" data={rwaWaterfallData} />
                                            </div>
                                        </div>
                                    </Card>
                                )}
                                <KpiDetailCard
                                    title="CET1 Ratio - Common Equity Tier 1"
                                    kpiData={kpiData}
                                    kpiKey="cet1"
                                    riskAppetite={thresholds?.cet1}
                                    historicalData={kpiHistory}
                                />
                                <KpiDetailCard
                                    title="Leverage Ratio"
                                    kpiData={kpiData}
                                    kpiKey="leverage"
                                    riskAppetite={thresholds?.leverage}
                                    historicalData={kpiHistory}
                                />
                                <Card>
                                    <SectionHeader title="Historical Composition" suffix="(mCHF)" />
                                    <HistoricalCompositionTable historicalData={kpiHistory} />
                                </Card>

                                <Card>
                                    <SectionHeader title="Top 20 Counterparty RWA" suffix="(mCHF)" />
                                    <TopCounterpartiesTable data={counterpartyData} />
                                </Card>
                            </div>
                        )}
                        {activeTab === 'liquidity' && kpiData && (
                             <div className="space-y-8">
                                <Card className="!p-4">
                                    <div className="bg-brand-bg-body p-2 rounded-md flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-semibold mr-2">Currency:</span>
                                        {availableCurrencies.map(c => (
                                            <TabButton key={c} label={c} isActive={activeCurrency === c} onClick={() => setActiveCurrency(c)} isSubTab={true} />
                                        ))}
                                    </div>
                                </Card>

                                {compareKpiData && (
                                    <Card>
                                        <SectionHeader title="Variance Analysis" suffix={`${formatDate(compareKpiData.date)} vs ${formatDate(kpiData.date)}`} />
                                        <div className="mt-6">
                                           <WaterfallChart title="LCR Variance (%)" data={lcrWaterfallData} unit="%" />
                                        </div>
                                    </Card>
                                )}
                                <KpiDetailCard
                                    title={`LCR - Liquidity Coverage Ratio (${activeCurrency})`}
                                    kpiData={kpiData}
                                    kpiKey="lcr"
                                    riskAppetite={thresholds?.lcr}
                                    historicalData={kpiHistory}
                                >
                                    <HqlaEvolutionChart data={kpiHistory} />
                                    <CashflowEvolutionChart data={kpiHistory} flowType="inflows" />
                                    <CashflowEvolutionChart data={kpiHistory} flowType="outflows" />
                                </KpiDetailCard>
                                <KpiDetailCard
                                    title={`NSFR - Net Stable Funding Ratio (${activeCurrency})`}
                                    kpiData={kpiData}
                                    kpiKey="nsfr"
                                    riskAppetite={thresholds?.nsfr}
                                    historicalData={kpiHistory}
                                />
                             </div>
                        )}
                    </div>
                ) : <Card><p className="text-center text-brand-text-secondary">No data available for the current selection.</p></Card>}
            </div>
        </div>
    );
};