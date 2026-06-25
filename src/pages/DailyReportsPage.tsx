import { FC, useState, useMemo, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { CalculatedKpis } from '../types';
import { calculateKpis, formatDate, formatNumber } from '../utils';
import { Card, PageHeader, BackButton, Select, TabButton, SectionHeader } from '../components';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import { PALETTE } from '../theme';

type ReportEntity = 'Liechtenstein' | 'Bank' | 'Hong Kong';

const LcrReportCard: FC<{ entity: ReportEntity; date: string }> = ({ entity, date }) => {
    const { data, getKpisForDate } = useData();

    const currentLcr = useMemo(() => getKpisForDate(entity, date), [entity, date, getKpisForDate]);

    const historyData = useMemo(() => {
        const endDate = new Date(date + 'T00:00:00Z');
        const startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - 6);

        return data.kpisHistory
            .filter(k => k.entity === entity && new Date(k.date) >= startDate && new Date(k.date) <= endDate)
            .map(k => calculateKpis(k))
            .filter((k): k is CalculatedKpis => k !== null)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .map(k => ({ name: k.date.slice(5), LCR: parseFloat(k.lcr) }));
    }, [data.kpisHistory, entity, date]);

    if (!currentLcr) {
        return (
            <Card>
                <SectionHeader title="LCR Report" />
                <p className="text-brand-text-secondary text-sm">No LCR data for {entity} on {date}.</p>
            </Card>
        );
    }

    return (
        <Card>
            <SectionHeader title="LCR Report" suffix="Liquidity Coverage Ratio" />
            <div className="flex justify-between items-end mb-6">
                <div>
                    <p className="text-xs uppercase tracking-widest text-brand-text-secondary mb-1">LCR</p>
                    <p className="text-4xl font-light text-brand-primary">{currentLcr.lcr}<span className="text-xl">%</span></p>
                </div>
                <div className="text-right space-y-1">
                    <p className="text-sm text-brand-text-secondary">
                        HQLA <span className="font-semibold text-brand-text-primary ml-2">{formatNumber(currentLcr.hqla || 0)} m</span>
                    </p>
                    <p className="text-sm text-brand-text-secondary">
                        Net Outflows <span className="font-semibold text-brand-text-primary ml-2">{formatNumber(currentLcr.netCashOutflows || 0)} m</span>
                    </p>
                </div>
            </div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-text-secondary mb-3">7-Day Trend</p>
            <ResponsiveContainer width="100%" height={160}>
                <LineChart data={historyData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.line} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis unit="%" domain={['dataMin - 5', 'dataMax + 5']} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, 'LCR']} />
                    <Line type="monotone" dataKey="LCR" stroke={PALETTE.red} strokeWidth={1.5} dot={{ r: 2.5, fill: '#fff', stroke: PALETTE.red, strokeWidth: 1.5 }} activeDot={{ r: 4 }} />
                </LineChart>
            </ResponsiveContainer>
        </Card>
    );
};

const LargeExposuresReportCard: FC<{ entity: ReportEntity; date: string }> = ({ entity, date }) => {
    const { data } = useData();

    const exposureData = useMemo(() => {
        return data.largeExposures
            .filter(le => le.entity === entity && le.date === date)
            .map(le => ({ ...le, utilization: (le.exposureValue / le.limit) * 100 }))
            .sort((a, b) => b.utilization - a.utilization);
    }, [data.largeExposures, entity, date]);

    if (exposureData.length === 0) {
        return (
            <Card>
                <SectionHeader title="Large Exposures" />
                <p className="text-brand-text-secondary text-sm">No large exposure data for {entity} on {date}.</p>
            </Card>
        );
    }

    const UtilizationBar: FC<{ value: number }> = ({ value }) => {
        const width = Math.min(Math.max(value, 0), 100);
        let color = 'bg-green-500';
        if (value > 90) color = 'bg-brand-primary';
        else if (value > 75) color = 'bg-yellow-500';
        return (
            <div className="w-full bg-efg-line rounded-full h-3 relative overflow-hidden">
                <div className={`${color} h-3 rounded-full transition-all duration-300`} style={{ width: `${width}%` }} />
                <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold" style={{ color: value > 40 ? '#fff' : '#374151', mixBlendMode: 'difference' }}>{value.toFixed(1)}%</span>
            </div>
        );
    };

    return (
        <Card>
            <SectionHeader title="Large Exposures" suffix="vs. approved limits" />
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead>
                        <tr className="border-b border-efg-line">
                            <th className="pb-2 text-xs uppercase tracking-widest text-brand-text-secondary font-medium">Counterparty</th>
                            <th className="pb-2 text-xs uppercase tracking-widest text-brand-text-secondary font-medium text-right">Exposure</th>
                            <th className="pb-2 text-xs uppercase tracking-widest text-brand-text-secondary font-medium text-right">Limit</th>
                            <th className="pb-2 text-xs uppercase tracking-widest text-brand-text-secondary font-medium pl-4">Utilization</th>
                        </tr>
                    </thead>
                    <tbody>
                        {exposureData.map(le => (
                            <tr key={le.counterparty} className="border-b border-efg-line last:border-0">
                                <td className="py-3 font-medium text-brand-text-primary">{le.counterparty}</td>
                                <td className="py-3 text-right font-mono text-brand-text-secondary">{formatNumber(le.exposureValue)}</td>
                                <td className="py-3 text-right font-mono text-brand-text-secondary">{formatNumber(le.limit)}</td>
                                <td className="py-3 pl-4 w-36">
                                    <UtilizationBar value={le.utilization} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};

export const DailyReportsPage: FC = () => {
    const { data } = useData();
    const [selectedEntity, setSelectedEntity] = useState<ReportEntity>('Liechtenstein');
    const [selectedDate, setSelectedDate] = useState('');

    const entities: ReportEntity[] = ['Liechtenstein', 'Bank', 'Hong Kong'];

    const availableDates = useMemo(() => {
        const allDates = new Set<string>();
        data.kpisHistory.filter(k => k.entity === selectedEntity).forEach(k => allDates.add(k.date));
        if (selectedEntity !== 'Bank') {
            data.largeExposures.filter(le => le.entity === selectedEntity).forEach(le => allDates.add(le.date));
        }
        return Array.from(allDates).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    }, [data.kpisHistory, data.largeExposures, selectedEntity]);

    useEffect(() => {
        if (availableDates.length > 0) {
            setSelectedDate(availableDates[0]);
        } else {
            setSelectedDate('');
        }
    }, [availableDates]);

    return (
        <div className="p-5 md:p-8">
            <BackButton />
            <PageHeader title="Daily / Weekly Reports" subtitle="LCR and large exposure snapshot by entity" />

            <Card className="mb-8">
                <div className="flex flex-col md:flex-row md:items-end gap-6">
                    <div className="flex-grow">
                        <p className="text-xs font-semibold uppercase tracking-widest text-brand-text-secondary mb-2">Entity</p>
                        <div className="bg-brand-bg-body p-1 rounded-md flex items-center gap-2 flex-wrap">
                            {entities.map(entity => (
                                <TabButton key={entity} label={entity} isActive={selectedEntity === entity} onClick={() => setSelectedEntity(entity)} isSubTab />
                            ))}
                        </div>
                    </div>
                    <div className="md:w-48">
                        <Select label="Reporting Date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} disabled={availableDates.length === 0}>
                            {availableDates.length > 0 ? (
                                availableDates.map(d => <option key={d} value={d}>{formatDate(d)}</option>)
                            ) : (
                                <option>No data available</option>
                            )}
                        </Select>
                    </div>
                </div>
            </Card>

            {selectedDate ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
                    <LcrReportCard entity={selectedEntity} date={selectedDate} />
                    {(selectedEntity === 'Liechtenstein' || selectedEntity === 'Hong Kong') && (
                        <LargeExposuresReportCard entity={selectedEntity} date={selectedDate} />
                    )}
                </div>
            ) : (
                <Card>
                    <p className="text-center text-brand-text-secondary py-8">No data available for {selectedEntity}. Please select another entity or check the data source.</p>
                </Card>
            )}
        </div>
    );
};
