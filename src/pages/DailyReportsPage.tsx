import { FC, useState, useMemo, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { CalculatedKpis } from '../types';
import { calculateKpis, formatDate, formatNumber } from '../utils';
import { Card, PageHeader, BackButton, Select, TabButton } from '../components';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts';

type ReportEntity = 'Liechtenstein' | 'Bank' | 'Hong Kong';

const LcrReportCard: FC<{ entity: ReportEntity; date: string }> = ({ entity, date }) => {
    const { data, getKpisForDate } = useData();

    const currentLcr = useMemo(() => getKpisForDate(entity, date), [entity, date, getKpisForDate]);
    
    const historyData = useMemo(() => {
        const endDate = new Date(date + 'T00:00:00Z');
        const startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - 6);

        const relevantHistory = data.kpisHistory
            .filter(k => k.entity === entity && new Date(k.date) >= startDate && new Date(k.date) <= endDate)
            .map(k => calculateKpis(k))
            .filter((k): k is CalculatedKpis => k !== null)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        return relevantHistory.map(k => ({
            name: k.date.slice(5), // M-DD format
            LCR: parseFloat(k.lcr)
        }));

    }, [data.kpisHistory, entity, date]);

    if (!currentLcr) {
        return <Card><h4>LCR Report</h4><p>No LCR data for {entity} on {date}.</p></Card>;
    }

    return (
        <Card>
            <h3 className="text-xl font-bold text-brand-text-primary mb-4 pb-2 border-b">💧 LCR Report</h3>
            <div className="flex justify-between items-center mb-4">
                <div>
                    <p className="text-sm text-brand-text-secondary">LCR</p>
                    <p className="text-4xl font-bold text-brand-primary">{currentLcr.lcr}%</p>
                </div>
                <div className="text-right">
                    <p className="text-sm text-brand-text-secondary">HQLA: <span className="font-semibold">{formatNumber(currentLcr.hqla || 0)}m</span></p>
                    <p className="text-sm text-brand-text-secondary">Net Outflows: <span className="font-semibold">{formatNumber(currentLcr.netCashOutflows || 0)}m</span></p>
                </div>
            </div>
            <h4 className="text-sm font-semibold text-brand-text-secondary mb-2">Last 7 Days Trend</h4>
            <ResponsiveContainer width="100%" height={200}>
                <LineChart data={historyData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                    <XAxis dataKey="name" />
                    <YAxis unit="%" domain={['dataMin - 10', 'dataMax + 10']} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="LCR" stroke="#c0504d" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
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
            .map(le => ({
                ...le,
                utilization: (le.exposureValue / le.limit) * 100,
            }))
            .sort((a,b) => b.utilization - a.utilization);
    }, [data.largeExposures, entity, date]);

    if (exposureData.length === 0) {
         return <Card><h4>Large Exposure Report</h4><p>No Large Exposure data for {entity} on {date}.</p></Card>;
    }

    const UtilizationBar: FC<{ value: number }> = ({ value }) => {
        const width = Math.min(Math.max(value, 0), 100);
        let color = 'bg-green-500';
        if (value > 90) color = 'bg-red-500';
        else if (value > 75) color = 'bg-yellow-500';
        
        return (
            <div className="w-full bg-gray-200 rounded-full h-4 relative">
                <div className={`${color} h-4 rounded-full`} style={{ width: `${width}%` }}></div>
                 <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white mix-blend-difference">{value.toFixed(1)}%</span>
            </div>
        )
    };

    return (
        <Card>
            <h3 className="text-xl font-bold text-brand-text-primary mb-4 pb-2 border-b">💥 Large Exposure Report</h3>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-brand-text-secondary uppercase bg-gray-50">
                        <tr>
                            <th className="px-4 py-2">Counterparty</th>
                            <th className="px-4 py-2 text-right">Exposure (m)</th>
                            <th className="px-4 py-2 text-right">Limit (m)</th>
                            <th className="px-4 py-2">Utilization</th>
                        </tr>
                    </thead>
                    <tbody>
                        {exposureData.map(le => (
                            <tr key={le.counterparty} className="border-b">
                                <td className="px-4 py-3 font-medium text-brand-text-primary">{le.counterparty}</td>
                                <td className="px-4 py-3 text-right font-mono">{formatNumber(le.exposureValue)}</td>
                                <td className="px-4 py-3 text-right font-mono">{formatNumber(le.limit)}</td>
                                <td className="px-4 py-3 w-32">
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
            <PageHeader icon="📈" title="Daily / Weekly Reports" subtitle="View latest LCR and Large Exposure data for key entities" />

            <Card className="mb-8">
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                    <div className="flex-grow">
                         <label className="block text-sm font-medium text-brand-text-secondary mb-2">Select Entity</label>
                         <div className="bg-gray-100 p-1 rounded-lg flex items-center gap-2 flex-wrap">
                            {entities.map(entity => (
                                <TabButton
                                    key={entity}
                                    label={entity}
                                    isActive={selectedEntity === entity}
                                    onClick={() => setSelectedEntity(entity)}
                                    isSubTab
                                />
                            ))}
                        </div>
                    </div>
                    <div className="md:w-1/4">
                        <Select label="Select Date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} disabled={availableDates.length === 0}>
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
