import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useData } from '../context/DataContext';
import { CalculatedKpis } from '../types';
import { formatDate, calculateRwaWaterfallData, calculateLcrWaterfallData, calculateCet1RatioEvolutionData, calculateKpis } from '../utils';
import { Card, PageHeader, BackButton, InfoBox, Select, KpiDetailCard, HistoricalCompositionTable, TopCounterpartiesTable, WaterfallChart, CapitalEvolutionChart, MultiEntityKpiChart, HqlaEvolutionChart, CashflowEvolutionChart, TabButton } from '../components';

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
            const canvas = await html2canvas(reportRef.current, {
                scale: 2, // Use a higher scale for better resolution and clarity
                useCORS: true,
                backgroundColor: '#ffffff', // Use a standard white background for the export
            });
            // Use JPEG format for significant file size reduction with high quality
            const imgData = canvas.toDataURL('image/jpeg', 0.95); 
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'pt',
                format: 'a4',
            });
            
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const canvasWidth = canvas.width;
            const canvasHeight = canvas.height;
            const ratio = canvasWidth / canvasHeight;

            // Calculate dimensions to fit the PDF page with a margin
            const imgWidth = pdfWidth - 40; // 20pt margin on each side
            const imgHeight = imgWidth / ratio;
            
            let finalHeight = imgHeight;
            let position = 20;

            // Check if the content is taller than the page and scale it down if necessary
            if (imgHeight > pdfHeight - 40) {
                 finalHeight = pdfHeight - 40;
                 console.warn("Report content is too long for one page. It will be scaled to fit.");
            }

            // Add the captured image to the PDF
            pdf.addImage(imgData, 'JPEG', 20, position, imgWidth, finalHeight);
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
            
            <div className="mb-6 border-b border-gray-200">
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
                                className="w-full bg-brand-secondary hover:bg-brand-secondary-dark text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:bg-gray-400"
                            >
                                {isExporting ? 'Exporting...' : '📄 Export PDF'}
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
                                   <h2 className="text-xl font-bold text-brand-text-primary mb-4">Multi-Entity Ratio Evolution (Last 12 Months)</h2>
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
                                        <h2 className="text-xl font-bold text-brand-text-primary mb-4 pb-2 border-b-2 border-brand-accent">🔎 Variance Analysis ({formatDate(compareKpiData.date)} vs {formatDate(kpiData.date)})</h2>
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
                                    icon="🏦"
                                    title="CET1 Ratio - Common Equity Tier 1"
                                    kpiData={kpiData}
                                    kpiKey="cet1"
                                    riskAppetite={thresholds?.cet1}
                                    historicalData={kpiHistory}
                                />
                                <KpiDetailCard
                                    icon="📊"
                                    title="Leverage Ratio"
                                    kpiData={kpiData}
                                    kpiKey="leverage"
                                    riskAppetite={thresholds?.leverage}
                                    historicalData={kpiHistory}
                                />
                                <Card>
                                    <h2 className="text-xl font-bold text-brand-text-primary mb-4 pb-2 border-b-2 border-brand-accent">
                                        📜 Historical Composition
                                    </h2>
                                    <HistoricalCompositionTable historicalData={kpiHistory} />
                                </Card>

                                <Card>
                                    <h2 className="text-xl font-bold text-brand-text-primary mb-4 pb-2 border-b-2 border-brand-accent">
                                        🏆 Top 20 Counterparty RWA
                                    </h2>
                                    <TopCounterpartiesTable data={counterpartyData} />
                                </Card>
                            </div>
                        )}
                        {activeTab === 'liquidity' && kpiData && (
                             <div className="space-y-8">
                                <Card className="!p-4">
                                    <div className="bg-gray-100 p-2 rounded-lg flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-semibold mr-2">Currency:</span>
                                        {availableCurrencies.map(c => (
                                            <TabButton key={c} label={c} isActive={activeCurrency === c} onClick={() => setActiveCurrency(c)} isSubTab={true} />
                                        ))}
                                    </div>
                                </Card>

                                {compareKpiData && (
                                    <Card>
                                        <h2 className="text-xl font-bold text-brand-text-primary mb-4 pb-2 border-b-2 border-brand-accent">🔎 Variance Analysis ({formatDate(compareKpiData.date)} vs {formatDate(kpiData.date)})</h2>
                                        <div className="mt-6">
                                           <WaterfallChart title="LCR Variance (%)" data={lcrWaterfallData} unit="%" />
                                        </div>
                                    </Card>
                                )}
                                <KpiDetailCard
                                    icon="💧"
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
                                    icon="⏱️"
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