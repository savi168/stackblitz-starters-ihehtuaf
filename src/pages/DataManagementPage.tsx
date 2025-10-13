import React, { useState, useMemo, useEffect } from 'react';
import { useData, LOCAL_STORAGE_KEY } from '../context/DataContext';
import { Deadline, KpiHistoryEntry, CounterpartyRwa, RiskAppetite, LiquidityDataPoint, LiquidityByCurrency } from '../types';
import { parseDateToYmd, formatDate } from '../utils';
import { Card, PageHeader, BackButton, InfoBox, Select, Modal } from '../components';

// --- DATA MANAGEMENT HELPERS ---

const normalizeHeader = (header: string): string => 
    header.trim().toLowerCase().replace(/"/g, '').replace(/[\s._-]+/g, '');

const detectDelimiter = (line: string): string => {
    const delimiters = [';', ',', '\t', '|'];
    let maxCount = 0;
    let detectedDelimiter = ',';
    for (const delimiter of delimiters) {
        const count = line.split(delimiter).length;
        if (count > maxCount) {
            maxCount = count;
            detectedDelimiter = delimiter;
        }
    }
    return detectedDelimiter;
};

const parseCsvLine = (line: string, delimiter: string): string[] => {
    const values: string[] = [];
    let currentVal = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                currentVal += '"'; // It's an escaped quote, add one and skip the next
                i++;
            } else {
                inQuotes = !inQuotes; // Start or end of a quoted value
            }
        } else if (char === delimiter && !inQuotes) {
            values.push(currentVal.trim());
            currentVal = '';
        } else {
            currentVal += char;
        }
    }
    values.push(currentVal.trim());
    return values;
};

const parseCSV = (csvText: string): Record<string, string>[] => {
    const lines = csvText.trim().split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) return [];

    const headerLine = lines.shift();
    if (!headerLine) return [];
    
    const delimiter = detectDelimiter(headerLine);
    const headers = parseCsvLine(headerLine, delimiter).map(normalizeHeader);

    return lines.map(line => {
        const values = parseCsvLine(line, delimiter);
        const obj: Record<string, string> = {};
        headers.forEach((header, index) => {
            obj[header] = values[index] || '';
        });
        return obj;
    });
};


const toDeadline = (obj: Record<string, string>): Omit<Deadline, 'history' | 'attachments'> | null => {
    const get = (...keys: string[]) => keys.map(normalizeHeader).map(k => obj[k]).find(v => v !== undefined && v.trim() !== '') || '';

    const parseBool = (val: string) => val.toLowerCase() === 'true';

    try {
        const id = parseInt(get('id'), 10);
        const name = get('title');
        const dueDate = parseDateToYmd(get('duedate'));

        if (!id || !name || !dueDate) {
            return null; // Basic validation for required fields
        }

        return {
            id: id,
            name: name.trim(),
            status: 'upcoming', // Default status on import
            type: 'regulatory', // Default type on import
            comments: get('comments'),
            endOfPeriod: parseDateToYmd(get('endofperiod')),
            dueDate: dueDate,
            entity: get('entity'),
            controlNumber: get('controlnumber'),
            frequency: get('frequency'),
            ownerGroup: get('controlownergroup'),
            validator1: get('validation1'),
            validator2: get('validation2'),
            ownerApproved: parseBool(get('ownerapproved')),
            validation1Approved: parseBool(get('validation1approved')),
            validation2Approved: parseBool(get('validation2approved')),
            signedOffWithException: get('signedoffwithexception').toLowerCase() === 'faux' ? false : parseBool(get('signedoffwithexception')),
            lightFull: (get('lightfull') as Deadline['lightFull']) || '',
            itemType: get('itemtype'),
            path: get('path'),
        };
    } catch {
        return null;
    }
};

const toKpiCapitalEntry = (obj: Record<string, string>): Partial<KpiHistoryEntry> | null => {
    const get = (...keys: string[]) => keys.map(normalizeHeader).map(k => obj[k]).find(v => v !== undefined && v.trim() !== '') || '';
    const toNumber = (val: string) => {
        if (val === null || val.trim() === '') return 0;
        const num = parseFloat(val.replace(',', '.'));
        return isNaN(num) ? 0 : num;
    };
    
    try {
        const requiredFields = ['entity', 'date', 'cet1Capital', 'creditRWA', 'marketRWA', 'opRWA', 'tier1', 'exposure'];
        for (const field of requiredFields) {
            if (!get(field)) return null;
        }
        
        const entry: Partial<KpiHistoryEntry> = {
            entity: get('entity'),
            date: get('date'),
            cet1Capital: toNumber(get('cet1Capital')),
            creditRWA: toNumber(get('creditRWA')),
            marketRWA: toNumber(get('marketRWA')),
            opRWA: toNumber(get('opRWA')),
            otherRWA: toNumber(get('otherRWA')),
            tier1: toNumber(get('tier1')),
            exposure: toNumber(get('exposure')),
        };

        const cet1BreakdownFields = ['cet1_equity', 'cet1_pnl', 'cet1_sharebuyback', 'cet1_goodwillintangibles', 'cet1_otherdeductions', 'cet1_tobedefined', 'cet1_dividend'];
        if (cet1BreakdownFields.some(f => get(f).trim() !== '')) {
            entry.cet1CapitalBreakdown = {
                equity: toNumber(get('cet1_equity')),
                pnl: toNumber(get('cet1_pnl')),
                shareBuyback: toNumber(get('cet1_sharebuyback')),
                goodwillIntangibles: toNumber(get('cet1_goodwillintangibles')),
                otherDeductions: toNumber(get('cet1_otherdeductions')),
                toBeDefined: toNumber(get('cet1_tobedefined')),
                dividend: toNumber(get('cet1_dividend')),
            };
        }

        return entry;
    } catch {
        return null;
    }
};

const toKpiLiquidityEntry = (obj: Record<string, string>): { entity: string; date: string; currency: string; data: Partial<LiquidityDataPoint> } | null => {
    const get = (...keys: string[]) => keys.map(normalizeHeader).map(k => obj[k]).find(v => v !== undefined && v.trim() !== '') || '';
    const toNumber = (val: string) => {
        if (val === null || val.trim() === '') return 0;
        const num = parseFloat(val.replace(',', '.'));
        return isNaN(num) ? 0 : num;
    };
    
    try {
        const requiredFields = ['entity', 'date', 'currency', 'hqla', 'netCashOutflows', 'asf', 'rsf'];
        for (const field of requiredFields) {
            if (!get(field)) return null;
        }

        const liquidityData: Partial<LiquidityDataPoint> = {
            hqla: toNumber(get('hqla')),
            netCashOutflows: toNumber(get('netcashoutflows', 'netcashoutflow')),
            asf: toNumber(get('asf')),
            rsf: toNumber(get('rsf')),
        };

        const hqlaBreakdownFields = ['hqla_centralbank', 'hqla_reverserepo', 'hqla_sovereign', 'hqla_publicsector', 'hqla_other'];
        if (hqlaBreakdownFields.some(f => get(f).trim() !== '')) {
            liquidityData.hqlaBreakdown = {
                centralBank: toNumber(get('hqla_centralbank')),
                reverseRepo: toNumber(get('hqla_reverserepo')),
                sovereign: toNumber(get('hqla_sovereign')),
                publicSector: toNumber(get('hqla_publicsector')),
                other: toNumber(get('hqla_other')),
            };
        }

        const ncoInflowFields = ['nco_in_bankandfi', 'nco_in_retail', 'nco_in_corporate', 'nco_in_derivatives', 'nco_in_other'];
        const ncoOutflowFields = ['nco_out_bankandfi', 'nco_out_retail', 'nco_out_corporate', 'nco_out_derivatives', 'nco_out_other'];
        if ([...ncoInflowFields, ...ncoOutflowFields].some(f => get(f).trim() !== '')) {
            liquidityData.netCashOutflowsBreakdown = {
                inflows: {
                    bankAndFi: toNumber(get('nco_in_bankandfi')),
                    retail: toNumber(get('nco_in_retail')),
                    corporate: toNumber(get('nco_in_corporate')),
                    derivatives: toNumber(get('nco_in_derivatives')),
                    other: toNumber(get('nco_in_other')),
                },
                outflows: {
                    bankAndFi: toNumber(get('nco_out_bankandfi')),
                    retail: toNumber(get('nco_out_retail')),
                    corporate: toNumber(get('nco_out_corporate')),
                    derivatives: toNumber(get('nco_out_derivatives')),
                    other: toNumber(get('nco_out_other')),
                }
            };
        }

        return {
            entity: get('entity'),
            date: get('date'),
            currency: get('currency').toUpperCase(),
            data: liquidityData
        };
    } catch {
        return null;
    }
}

const toCounterpartyRwa = (obj: Record<string, string>): CounterpartyRwa | null => {
    const get = (...keys: string[]) => keys.map(normalizeHeader).map(k => obj[k]).find(v => v !== undefined && v.trim() !== '') || '';
    const toNumber = (val: string) => {
        if (val === null || val.trim() === '') return 0;
        const num = parseFloat(val.replace(',', '.'));
        return isNaN(num) ? 0 : num;
    };

    try {
        const entry: CounterpartyRwa = {
            entity: get('entity'),
            date: parseDateToYmd(get('date')),
            counterpartyName: get('counterpartyname', 'counterparty'),
            industry: get('industry') as CounterpartyRwa['industry'],
            rwa: toNumber(get('rwa')),
        };
        
        const validIndustries: CounterpartyRwa['industry'][] = ['Bank', 'Corporate', 'Retail', 'Sovereign', 'Real Estate', 'Equity'];
        if (!entry.entity || !entry.date || !entry.counterpartyName || !validIndustries.includes(entry.industry)) {
            console.warn('Skipping invalid counterparty row:', obj);
            return null;
        }
        return entry;
    } catch (error) {
        console.error('Error parsing counterparty row:', obj, error);
        return null;
    }
};


export const DataManagementPage: React.FC = () => {
    const { data, setData, allEntities } = useData();
    const [textData, setTextData] = useState(JSON.stringify(data, null, 2));
    const [jsonError, setJsonError] = useState<string | null>(null);
    const [deadlineImportMode, setDeadlineImportMode] = useState<'replace' | 'append'>('replace');
    const [kpiCapitalImportMode, setKpiCapitalImportMode] = useState<'replace' | 'append'>('append');
    const [kpiLiquidityImportMode, setKpiLiquidityImportMode] = useState<'replace' | 'append'>('append');
    const [counterpartyImportMode, setCounterpartyImportMode] = useState<'replace' | 'append'>('append');
    const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);
    const [confirmation, setConfirmation] = useState<{ title: string; message: React.ReactNode; onConfirm: () => void } | null>(null);

    const [appetiteData, setAppetiteData] = useState<RiskAppetite>(data.riskAppetite);

    // State for KPI Editor
    const [selectedEntity, setSelectedEntity] = useState<string>('');
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [editableKpi, setEditableKpi] = useState<KpiHistoryEntry | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [newKpiDate, setNewKpiDate] = useState('');

    const createBlankKpiEntry = (): KpiHistoryEntry => ({
        entity: '', date: '', cet1Capital: 0, creditRWA: 0, marketRWA: 0, opRWA: 0, otherRWA: 0,
        tier1: 0, exposure: 0,
        cet1CapitalBreakdown: { equity: 0, pnl: 0, shareBuyback: 0, goodwillIntangibles: 0, otherDeductions: 0, toBeDefined: 0, dividend: 0 },
        liquidity: {
            "TOT": {
                hqla: 0, netCashOutflows: 0, asf: 0, rsf: 0,
                hqlaBreakdown: { centralBank: 0, reverseRepo: 0, sovereign: 0, publicSector: 0, other: 0 },
                netCashOutflowsBreakdown: {
                    inflows: { bankAndFi: 0, retail: 0, corporate: 0, derivatives: 0, other: 0 },
                    outflows: { bankAndFi: 0, retail: 0, corporate: 0, derivatives: 0, other: 0 }
                }
            }
        }
    });

    useEffect(() => {
        setTextData(JSON.stringify(data, null, 2));
        setAppetiteData(data.riskAppetite);
        setJsonError(null);
    }, [data]);
    
    const availableDatesForEntity = useMemo(() => {
        if (!selectedEntity) return [];
        return Array.from(new Set(data.kpisHistory.filter(k => k.entity === selectedEntity).map(k => k.date)))
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    }, [selectedEntity, data.kpisHistory]);

    useEffect(() => {
        if (isCreating) return;
        if (selectedEntity && selectedDate) {
            const entry = data.kpisHistory.find(k => k.entity === selectedEntity && k.date === selectedDate);
            setEditableKpi(entry ? JSON.parse(JSON.stringify(entry)) : null);
        } else {
            setEditableKpi(null);
        }
    }, [selectedEntity, selectedDate, data.kpisHistory, isCreating]);

    useEffect(() => {
        setSelectedDate('');
        setEditableKpi(null);
    }, [selectedEntity]);


    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setTextData(e.target.value);
        try {
            JSON.parse(e.target.value);
            setJsonError(null);
        } catch (error) {
            setJsonError("Invalid JSON format. Please correct it before saving.");
        }
    };

    const handleUpdateData = () => {
        if(jsonError) {
            alert('❌ Cannot save, JSON data is invalid.');
            return;
        }
        try {
            const parsedData = JSON.parse(textData);
            setData(parsedData);
            alert('✅ Data updated successfully!');
        } catch (error) {
            setJsonError("Invalid JSON format. Could not update data.");
            alert('❌ Invalid JSON format. Could not update data.');
        }
    };
    
    const handleAppetiteChange = (entity: string, kpi: 'cet1' | 'lcr' | 'nsfr' | 'leverage', level: 'red' | 'amber', value: string) => {
        const numValue = parseFloat(value);
        setAppetiteData(prev => ({
            ...prev,
            [entity]: {
                ...prev[entity],
                [kpi]: {
                    ...prev[entity]?.[kpi],
                    [level]: isNaN(numValue) ? 0 : numValue
                }
            }
        }));
    };

    const handleSaveAppetite = () => {
        setData(prev => ({
            ...prev,
            riskAppetite: appetiteData
        }));
        alert('✅ Risk Appetite thresholds saved!');
    };

    const handleKpiChange = (path: string, value: string) => {
        setEditableKpi(prev => {
            if (!prev) return null;
    
            const newKpi = JSON.parse(JSON.stringify(prev));
            
            if (isCreating && (path === 'entity' || path === 'date')) {
                 (newKpi as any)[path] = value;
                 return newKpi;
            }

            const keys = path.split('.');
            let current: any = newKpi;
    
            for (let i = 0; i < keys.length - 1; i++) {
                const key = keys[i];
                 if (current[key] === undefined || current[key] === null) {
                    current[key] = {};
                }
                current = current[key];
            }
    
            current[keys[keys.length - 1]] = value;
            return newKpi;
        });
    };

    const handleSaveKpi = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editableKpi) return alert('❌ No KPI data to save.');
    
        const numerify = (value: any): number => {
            if (typeof value === 'number') return value;
            if (typeof value !== 'string') return 0;
            if (value.trim() === '' || value === '-') return 0;
            const num = parseFloat(value);
            return isNaN(num) ? 0 : num;
        };
    
        const sanitizeKpiObject = (obj: any): any => {
            const newObj: { [key: string]: any } = {};
            for (const key in obj) {
                if (key === 'entity' || key === 'date') {
                    newObj[key] = obj[key];
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    newObj[key] = sanitizeKpiObject(obj[key]);
                } else {
                    newObj[key] = numerify(obj[key]);
                }
            }
            return newObj;
        };
    
        const finalKpi: KpiHistoryEntry = sanitizeKpiObject(editableKpi);

        if (isCreating) {
            const entity = finalKpi.entity;
            const date = newKpiDate;
            if (!entity || !date) return alert('❌ Entity and Date are required for new entries.');

            const exists = data.kpisHistory.some(k => k.entity === entity && k.date === date);
            if (exists) return alert(`❌ An entry for ${entity} on ${date} already exists. Please choose a different date or edit the existing entry.`);

            const newEntry: KpiHistoryEntry = { ...finalKpi, entity, date };
            setData(prev => ({ ...prev, kpisHistory: [...prev.kpisHistory, newEntry] }));
            alert(`✅ New KPI entry for ${entity} on ${date} created.`);
            setIsCreating(false);
            setEditableKpi(null);
            setNewKpiDate('');
            setSelectedEntity('');

        } else {
             setData(prevData => {
                const newHistory = prevData.kpisHistory.map(entry => 
                    (entry.entity === selectedEntity && entry.date === selectedDate) ? finalKpi : entry
                );
                return { ...prevData, kpisHistory: newHistory };
            });
            alert(`✅ KPI data for ${selectedEntity} on ${formatDate(selectedDate)} has been updated.`);
        }
    };
    
    const handleDeleteKpi = () => {
        if (isCreating || !selectedEntity || !selectedDate) return;
        
        setConfirmation({
            title: "Confirm Deletion",
            message: <p>Are you sure you want to delete the KPI entry for <strong>{selectedEntity}</strong> on <strong>{formatDate(selectedDate)}</strong>? This action cannot be undone.</p>,
            onConfirm: () => {
                setData(prev => ({
                    ...prev,
                    kpisHistory: prev.kpisHistory.filter(k => !(k.entity === selectedEntity && k.date === selectedDate))
                }));
                alert('✅ KPI entry deleted.');
                setSelectedEntity('');
                setSelectedDate('');
                setEditableKpi(null);
                setConfirmation(null);
            }
        });
    };

    const handleJsonImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        setImportResult(null);
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const content = e.target?.result as string;
                    const parsedData = JSON.parse(content);
                    setData(parsedData);
                    setImportResult({ success: true, message: '✅ JSON data imported successfully!' });
                } catch (error) {
                    setImportResult({ success: false, message: '❌ Error importing JSON file. Please check the file format.' });
                }
            };
            reader.readAsText(file);
        }
    };
    
    const handleCsvImport = (
        event: React.ChangeEvent<HTMLInputElement>,
        dataType: 'deadlines' | 'kpisCapital' | 'kpisLiquidity' | 'counterpartyRwa',
    ) => {
        setImportResult(null);
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const content = e.target?.result as string;
                    const parsed = parseCSV(content);
                    if (parsed.length === 0 && content.trim() !== '') {
                        throw new Error("Could not parse CSV file. Ensure it has a header and at least one data row.");
                    }

                    if (dataType === 'deadlines') {
                        const importMode = deadlineImportMode;
                        const parsedDeadlinesData = parsed.map(toDeadline).filter((d): d is Omit<Deadline, 'history' | 'attachments'> => d !== null);
                        const parsedDeadlines = parsedDeadlinesData.map(d => ({...d, history: [], attachments: []}));

                        if (parsedDeadlines.length !== parsed.length) {
                             throw new Error(`Invalid rows found. ${parsedDeadlines.length} of ${parsed.length} deadlines were valid. Please check file content and format.`);
                        }
                        
                        const importAction = () => {
                            if (importMode === 'replace') {
                                setData(prev => ({ ...prev, deadlines: parsedDeadlines }));
                                setImportResult({ success: true, message: `✅ ${parsedDeadlines.length} deadlines imported. All previous data was replaced.`});
                            } else { // append
                                const existingIds = new Set(data.deadlines.map(d => d.id));
                                const uniqueNewDeadlines = parsedDeadlines.filter(d => !existingIds.has(d.id));
                                const skippedCount = parsedDeadlines.length - uniqueNewDeadlines.length;

                                setData(prev => ({ ...prev, deadlines: [...prev.deadlines, ...uniqueNewDeadlines] }));
                                
                                let message = `✅ ${uniqueNewDeadlines.length} deadlines were successfully appended.`;
                                if (skippedCount > 0) message += ` ${skippedCount} duplicates (by ID) were skipped.`;
                                setImportResult({ success: true, message });
                            }
                        };
                        
                        if (importMode === 'replace') {
                            setConfirmation({
                                title: "Confirm Data Replacement",
                                message: <p className="text-gray-700">Are you sure you want to replace all <strong>{data.deadlines.length}</strong> existing deadlines with the <strong>{parsedDeadlines.length}</strong> from the file?</p>,
                                onConfirm: () => { importAction(); setConfirmation(null); }
                            });
                        } else {
                            importAction();
                        }

                    } else if (dataType === 'kpisCapital') {
                        const importMode = kpiCapitalImportMode;
                        const parsedKpis = parsed.map(toKpiCapitalEntry).filter((k): k is Partial<KpiHistoryEntry> => k !== null);
                         if (parsedKpis.length !== parsed.length) {
                             throw new Error(`Invalid rows found. ${parsedKpis.length} of ${parsed.length} KPI entries were valid. Please check file content and format.`);
                        }

                        const importAction = () => {
                            if (importMode === 'replace') {
                                const fullEntries = parsedKpis.map(k => ({...createBlankKpiEntry(), ...k} as KpiHistoryEntry));
                                setData(prev => ({ ...prev, kpisHistory: fullEntries }));
                                setImportResult({ success: true, message: `✅ ${fullEntries.length} KPI entries imported. All previous data was replaced.` });
                            } else { // append/merge
                                let updatedCount = 0;
                                let addedCount = 0;
                                const mergedKpis = [...data.kpisHistory];

                                parsedKpis.forEach(newKpi => {
                                    const existingIndex = mergedKpis.findIndex(k => k.entity === newKpi.entity && k.date === newKpi.date);
                                    if (existingIndex !== -1) {
                                        mergedKpis[existingIndex] = { ...mergedKpis[existingIndex], ...newKpi };
                                        updatedCount++;
                                    } else {
                                        mergedKpis.push({ ...createBlankKpiEntry(), ...newKpi } as KpiHistoryEntry);
                                        addedCount++;
                                    }
                                });
                                
                                setData(prev => ({ ...prev, kpisHistory: mergedKpis }));
                                setImportResult({ success: true, message: `✅ Import complete! ${addedCount} capital entries added, ${updatedCount} entries updated.`});
                            }
                        };
                        
                        if (importMode === 'replace') {
                             setConfirmation({
                                title: "Confirm Data Replacement",
                                message: <p className="text-gray-700">Are you sure you want to replace all <strong>{data.kpisHistory.length}</strong> existing KPI entries with capital data from this file?</p>,
                                onConfirm: () => { importAction(); setConfirmation(null); }
                            });
                        } else {
                            importAction();
                        }
                    } else if (dataType === 'kpisLiquidity') {
                        const importMode = kpiLiquidityImportMode;
                        const parsedLiquidity = parsed.map(toKpiLiquidityEntry).filter((k): k is { entity: string, date: string, currency: string, data: Partial<LiquidityDataPoint> } => k !== null);
                         if (parsedLiquidity.length !== parsed.length) {
                             throw new Error(`Invalid rows found. ${parsedLiquidity.length} of ${parsed.length} KPI entries were valid. Please check file content and format.`);
                        }
                        
                        const importAction = () => {
                            if (importMode === 'replace') {
                                const newHistory: KpiHistoryEntry[] = [];
                                const groupedByEntityDate = new Map<string, KpiHistoryEntry>();

                                parsedLiquidity.forEach(item => {
                                    const key = `${item.entity}|${item.date}`;
                                    if (!groupedByEntityDate.has(key)) {
                                        groupedByEntityDate.set(key, { ...createBlankKpiEntry(), entity: item.entity, date: item.date });
                                    }
                                    const entry = groupedByEntityDate.get(key)!;
                                    if(!entry.liquidity) entry.liquidity = {};
                                    entry.liquidity[item.currency] = item.data;
                                });

                                setData(prev => ({ ...prev, kpisHistory: Array.from(groupedByEntityDate.values()) }));
                                setImportResult({ success: true, message: `✅ ${groupedByEntityDate.size} KPI entries imported with liquidity data. All previous data was replaced.` });

                            } else { // append/merge
                                const mergedKpis = [...data.kpisHistory];
                                let updatedCount = 0;
                                let addedCount = 0;

                                const groupedByEntityDate = new Map<string, { entity: string, date: string, liquidity: LiquidityByCurrency }>();

                                parsedLiquidity.forEach(item => {
                                    const key = `${item.entity}|${item.date}`;
                                    if (!groupedByEntityDate.has(key)) {
                                        groupedByEntityDate.set(key, { entity: item.entity, date: item.date, liquidity: {} });
                                    }
                                    const group = groupedByEntityDate.get(key)!;
                                    group.liquidity[item.currency] = item.data;
                                });

                                for (const [key, group] of groupedByEntityDate.entries()) {
                                    const existingIndex = mergedKpis.findIndex(k => k.entity === group.entity && k.date === group.date);
                                    if (existingIndex !== -1) {
                                        mergedKpis[existingIndex].liquidity = { ...(mergedKpis[existingIndex].liquidity || {}), ...group.liquidity };
                                        updatedCount++;
                                    } else {
                                        const newEntry = { ...createBlankKpiEntry(), entity: group.entity, date: group.date, liquidity: group.liquidity };
                                        mergedKpis.push(newEntry);
                                        addedCount++;
                                    }
                                }
                                
                                setData(prev => ({ ...prev, kpisHistory: mergedKpis }));
                                setImportResult({ success: true, message: `✅ Liquidity data import complete! ${addedCount} entries created, ${updatedCount} entries updated.`});
                            }
                        };
                        
                        if (importMode === 'replace') {
                             setConfirmation({
                                title: "Confirm Data Replacement",
                                message: <p className="text-gray-700">Are you sure you want to replace all <strong>{data.kpisHistory.length}</strong> existing KPI entries with liquidity data from this file?</p>,
                                onConfirm: () => { importAction(); setConfirmation(null); }
                            });
                        } else {
                            importAction();
                        }
                    }
                    else if (dataType === 'counterpartyRwa') {
                        const importMode = counterpartyImportMode;
                        const parsedData = parsed.map(toCounterpartyRwa).filter((c): c is CounterpartyRwa => c !== null);
                        if(parsedData.length !== parsed.length) {
                             throw new Error(`Invalid rows found. ${parsedData.length} of ${parsed.length} counterparty entries were valid. Please check file content and format.`);
                        }

                        const importAction = () => {
                             if (importMode === 'replace') {
                                setData(prev => ({ ...prev, counterpartyRwa: parsedData }));
                                setImportResult({ success: true, message: `✅ ${parsedData.length} counterparty entries imported. All previous data was replaced.` });
                            } else { // append/merge
                                const dataToImportByDate = new Map<string, CounterpartyRwa[]>();
                                parsedData.forEach(item => {
                                    const key = `${item.entity}|${item.date}`;
                                    if(!dataToImportByDate.has(key)) dataToImportByDate.set(key, []);
                                    dataToImportByDate.get(key)!.push(item);
                                });

                                let newData = [...data.counterpartyRwa];
                                // Filter out existing data for the entity/date pairs being imported
                                newData = newData.filter(item => !dataToImportByDate.has(`${item.entity}|${item.date}`));
                                
                                // Add the new data
                                newData.push(...parsedData);

                                setData(prev => ({ ...prev, counterpartyRwa: newData }));
                                setImportResult({ success: true, message: `✅ ${parsedData.length} counterparty entries have been merged into the dataset.` });
                            }
                        };

                        if (importMode === 'replace') {
                             setConfirmation({
                                title: "Confirm Data Replacement",
                                message: <p className="text-gray-700">Are you sure you want to replace all <strong>{data.counterpartyRwa.length}</strong> existing counterparty entries with the <strong>{parsedData.length}</strong> from the file?</p>,
                                onConfirm: () => { importAction(); setConfirmation(null); }
                            });
                        } else {
                            importAction();
                        }
                    }
                } catch (error) {
                    console.error("CSV Import Error:", error);
                    setImportResult({ success: false, message: `❌ Error importing file. ${(error as Error).message}`});
                }
            };
            reader.readAsText(file);
        }
        event.target.value = ''; // Reset file input to allow re-uploading the same file
    };

    const convertToCSV = (objArray: any[], headers: string[]) => {
        const csvRows = [];
        csvRows.push(headers.join(','));

        for (const row of objArray) {
            const values = headers.map(header => {
                const val = row[header as keyof typeof row] === null || row[header as keyof typeof row] === undefined ? '' : row[header as keyof typeof row];
                const escaped = ('' + val).replace(/"/g, '""');
                return `"${escaped}"`;
            });
            csvRows.push(values.join(','));
        }
        return csvRows.join('\n');
    };

    const downloadFile = (content: string, filename: string, type: string) => {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const downloadJson = () => {
        downloadFile(JSON.stringify(data, null, 2), 'regulatory-data.json', 'application/json');
    };
    
    const exportDeadlinesCSV = () => {
        const headers = ['id', 'endOfPeriod', 'dueDate', 'entity', 'controlNumber', 'name', 'frequency', 'ownerGroup', 'validator1', 'validator2', 'ownerApproved', 'validation1Approved', 'validation2Approved', 'signedOffWithException', 'lightFull', 'itemType', 'path', 'status', 'comments'];
        const csvString = convertToCSV(data.deadlines, headers);
        downloadFile(csvString, 'deadlines.csv', 'text/csv;charset=utf-8;');
    };
    
    const downloadTemplate = (headers: string[], filename: string) => {
        const csvContent = headers.join(';');
        downloadFile(csvContent, filename, 'text/csv;charset=utf--8;');
    };

    const exportDeadlineTemplate = () => {
        const headers = ['ID', 'End of Period', 'Due Date', 'Entity', 'Control Number', 'Title', 'Frequency', 'Control Owner Group', 'Validation 1', 'Validation 2', 'OwnerApproved', 'Validation1Approved', 'Validation2Approved', 'Signed off with exception', 'Light/Full', 'Item Type', 'Path'];
        downloadTemplate(headers, 'deadlines-template.csv');
    };

    const exportKpiCapitalCSV = () => {
        const headers = [
            'entity', 'date', 'cet1Capital', 'creditRWA', 'marketRWA', 'opRWA', 'otherRWA', 'tier1', 'exposure',
            'cet1_equity', 'cet1_pnl', 'cet1_shareBuyback', 'cet1_goodwillIntangibles', 'cet1_otherDeductions', 'cet1_toBeDefined', 'cet1_dividend',
        ];

        const flattenedData = data.kpisHistory.map(entry => {
            const flat: Record<string, any> = { ...entry };
            if (entry.cet1CapitalBreakdown) {
                Object.entries(entry.cet1CapitalBreakdown).forEach(([key, value]) => {
                    flat[`cet1_${key.toLowerCase()}`] = value;
                });
            }
            delete flat.cet1CapitalBreakdown;
            delete flat.liquidity;
            return flat;
        });

        const csvString = convertToCSV(flattenedData, headers);
        downloadFile(csvString, 'kpi-capital-history.csv', 'text/csv;charset=utf-8;');
    };
    
    const exportKpiCapitalTemplate = () => {
        const headers = [
            'entity', 'date', 'cet1Capital', 'creditRWA', 'marketRWA', 'opRWA', 'otherRWA', 'tier1', 'exposure',
            'cet1_equity', 'cet1_pnl', 'cet1_shareBuyback', 'cet1_goodwillIntangibles', 'cet1_otherDeductions', 'cet1_toBeDefined', 'cet1_dividend',
        ];
        downloadTemplate(headers, 'kpi-capital-template.csv');
    };

     const exportKpiLiquidityCSV = () => {
        const headers = [
            'entity', 'date', 'currency', 'hqla', 'netCashOutflows', 'asf', 'rsf',
            'hqla_centralBank', 'hqla_reverseRepo', 'hqla_sovereign', 'hqla_publicSector', 'hqla_other',
            'nco_in_bankAndFi', 'nco_in_retail', 'nco_in_corporate', 'nco_in_derivatives', 'nco_in_other',
            'nco_out_bankAndFi', 'nco_out_retail', 'nco_out_corporate', 'nco_out_derivatives', 'nco_out_other',
        ];

        const flattenedData: Record<string, any>[] = [];
        data.kpisHistory.forEach(entry => {
            if (entry.liquidity) {
                Object.entries(entry.liquidity).forEach(([currency, liqData]) => {
                    const row: Record<string, any> = {
                        entity: entry.entity,
                        date: entry.date,
                        currency,
                        ...liqData
                    };
                    if (liqData.hqlaBreakdown) {
                        Object.entries(liqData.hqlaBreakdown).forEach(([key, value]) => {
                            row[`hqla_${key}`] = value;
                        });
                    }
                     if (liqData.netCashOutflowsBreakdown) {
                        Object.entries(liqData.netCashOutflowsBreakdown.inflows).forEach(([key, value]) => { row[`nco_in_${key}`] = value; });
                        Object.entries(liqData.netCashOutflowsBreakdown.outflows).forEach(([key, value]) => { row[`nco_out_${key}`] = value; });
                    }
                    delete row.hqlaBreakdown;
                    delete row.netCashOutflowsBreakdown;
                    flattenedData.push(row);
                });
            }
        });

        const csvString = convertToCSV(flattenedData, headers);
        downloadFile(csvString, 'kpi-liquidity-history.csv', 'text/csv;charset=utf-8;');
    };
    
    const exportKpiLiquidityTemplate = () => {
        const headers = [
            'entity', 'date', 'currency', 'hqla', 'netCashOutflows', 'asf', 'rsf',
            'hqla_centralBank', 'hqla_reverseRepo', 'hqla_sovereign', 'hqla_publicSector', 'hqla_other',
            'nco_in_bankAndFi', 'nco_in_retail', 'nco_in_corporate', 'nco_in_derivatives', 'nco_in_other',
            'nco_out_bankAndFi', 'nco_out_retail', 'nco_out_corporate', 'nco_out_derivatives', 'nco_out_other',
        ];
        downloadTemplate(headers, 'kpi-liquidity-template.csv');
    };

    const exportCounterpartyRwaCSV = () => {
        const headers = ['entity', 'date', 'counterpartyName', 'industry', 'rwa'];
        const csvString = convertToCSV(data.counterpartyRwa, headers);
        downloadFile(csvString, 'counterparty-rwa.csv', 'text/csv;charset=utf-8;');
    };

    const exportCounterpartyRwaTemplate = () => {
        const headers = ['entity', 'date', 'counterpartyName', 'industry', 'rwa'];
        downloadTemplate(headers, 'counterparty-rwa-template.csv');
    };

    const handleResetData = () => {
        if (window.confirm("Are you sure you want to reset all data to the application defaults? All your changes, imports, and edits will be lost.")) {
            try {
                localStorage.removeItem(LOCAL_STORAGE_KEY);
                alert('✅ Data has been reset. The application will now reload.');
                window.location.reload();
            } catch (error) {
                console.error("Failed to reset data", error);
                alert("❌ Could not reset data. Please clear your browser's local storage manually.");
            }
        }
    };

    const RadioGroup: React.FC<{name: string, value: string, onChange: (value: 'replace' | 'append') => void}> = ({ name, value, onChange }) => (
        <div className="flex items-center gap-4 mb-2 text-brand-text-secondary">
            <label className="text-sm cursor-pointer flex items-center">
                <input type="radio" name={name} value="replace" checked={value === 'replace'} onChange={() => onChange('replace')} className="mr-2 accent-brand-primary" />
                Replace
            </label>
            <label className="text-sm cursor-pointer flex items-center">
                <input type="radio" name={name} value="append" checked={value === 'append'} onChange={() => onChange('append')} className="mr-2 accent-brand-primary" />
                Append
            </label>
        </div>
    );
    
    const kpiKeys: (keyof RiskAppetite[string])[] = ['cet1', 'lcr', 'nsfr', 'leverage'];

    const KpiInput: React.FC<{ 
		label: string; 
		path: string; 
		value: number | string; 
		onChange: (path: string, value: string) => void 
	}> = ({ label, path, value, onChange }) => {
		const [localValue, setLocalValue] = useState(String(value ?? ''));

		// Synchroniser quand la valeur externe change
		useEffect(() => {
			setLocalValue(String(value ?? ''));
		}, [value]);

		const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
			setLocalValue(e.target.value);
		};

		const handleBlur = () => {
			onChange(path, localValue);
		};

		return (
			<div>
				<label htmlFor={path} className="block text-sm font-medium text-brand-text-secondary mb-1">
					{label}
				</label>
				<input
					id={path}
					type="number"
					step="any"
					value={localValue}
					onChange={handleChange}
					onBlur={handleBlur}  // Sauvegarde seulement au blur
					className="block w-full p-2 border-2 border-gray-200 rounded-lg text-sm focus:border-brand-primary focus:ring-brand-primary"
				/>
			</div>
		);
	};

    return (
        <div className="p-5 md:p-8">
            <BackButton />
            <PageHeader icon="⚙️" title="Data Management" subtitle="Import, export, and manage application data" />
            
            <Modal isOpen={!!confirmation} onClose={() => setConfirmation(null)} title={confirmation?.title || ''}>
                <div className="text-brand-text-secondary">{confirmation?.message}</div>
                <div className="mt-6 flex justify-end gap-4">
                    <button onClick={() => setConfirmation(null)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg transition-colors">Cancel</button>
                    <button onClick={confirmation?.onConfirm} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">Confirm</button>
                </div>
            </Modal>
            
            {importResult && (
                <div className={`p-4 my-4 rounded-lg border-l-4 ${importResult.success ? 'bg-green-50 border-green-500 text-green-800' : 'bg-red-50 border-red-500 text-red-800'}`} role="alert">
                    {importResult.message}
                </div>
            )}
            
            <Card className="mb-8">
                <h2 className="text-xl font-bold text-brand-text-primary mb-4 pb-2 border-b-2 border-brand-accent">⚠️ Application State</h2>
                <InfoBox>
                    The application automatically saves all your changes to your browser's local storage. You can reset the application to its original state, but be aware that this action is irreversible.
                </InfoBox>
                <button
                    onClick={handleResetData}
                    className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                >
                    Reset to Default Data
                </button>
            </Card>

            <Card className="mb-8">
                <h2 className="text-xl font-bold text-brand-text-primary mb-4 pb-2 border-b-2 border-brand-accent">📤 Import & Export</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-12">
                    {/* Column 1: Imports */}
                    <div>
                        <h3 className="text-lg font-semibold text-brand-text-primary mb-3">Import Data</h3>
                        <div className="space-y-6">
                            <div>
                                <h4 className="font-semibold text-brand-text-primary mb-2">Master Data</h4>
                                <label className="block text-sm font-medium text-brand-text-secondary mb-2">From Master JSON file</label>
                                <InfoBox className="!my-2">Importing a JSON file will <strong>overwrite all existing data</strong>.</InfoBox>
                                <input type="file" accept=".json" onChange={handleJsonImport} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-primary/10 file:text-brand-primary hover:file:bg-brand-primary/20"/>
                            </div>
                            <hr />
                             <div>
                                <h4 className="font-semibold text-brand-text-primary mb-2">Capital Adequacy KPIs</h4>
                                <RadioGroup name="kpiCapitalMode" value={kpiCapitalImportMode} onChange={setKpiCapitalImportMode} />
                                <InfoBox className="!my-2"><strong>Replace</strong> overwrites all KPI history with capital data. <strong>Append</strong> adds new entries and updates existing ones for the same entity and date.</InfoBox>
                                <input type="file" accept=".csv,.txt" onChange={(e) => handleCsvImport(e, 'kpisCapital')} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-primary/10 file:text-brand-primary hover:file:bg-brand-primary/20" />
                            </div>
                             <div>
                                <h4 className="font-semibold text-brand-text-primary mb-2">Liquidity KPIs</h4>
                                <RadioGroup name="kpiLiquidityMode" value={kpiLiquidityImportMode} onChange={setKpiLiquidityImportMode} />
                                <InfoBox className="!my-2"><strong>Replace</strong> overwrites all KPI history with liquidity data. <strong>Append</strong> adds new entries and updates existing ones for the same entity and date.</InfoBox>
                                <input type="file" accept=".csv,.txt" onChange={(e) => handleCsvImport(e, 'kpisLiquidity')} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-primary/10 file:text-brand-primary hover:file:bg-brand-primary/20" />
                            </div>
                            <hr />
                            <div>
                                <h4 className="font-semibold text-brand-text-primary mb-2">Other Data</h4>
                                <label className="block text-sm font-medium text-brand-text-secondary mb-2">Deadlines from CSV/TXT file</label>
                                <RadioGroup name="deadlineMode" value={deadlineImportMode} onChange={setDeadlineImportMode} />
                                <input type="file" accept=".csv,.txt" onChange={(e) => handleCsvImport(e, 'deadlines')} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-primary/10 file:text-brand-primary hover:file:bg-brand-primary/20" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-brand-text-secondary mb-2">Counterparty RWA from CSV/TXT file</label>
                                <RadioGroup name="counterpartyMode" value={counterpartyImportMode} onChange={setCounterpartyImportMode} />
                                <input type="file" accept=".csv,.txt" onChange={(e) => handleCsvImport(e, 'counterpartyRwa')} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-primary/10 file:text-brand-primary hover:file:bg-brand-primary/20" />
                            </div>
                        </div>
                    </div>
                    {/* Column 2: Exports */}
                     <div>
                        <h3 className="text-lg font-semibold text-brand-text-primary mb-3">Export Data & Templates</h3>
                        <div className="space-y-3 mt-4">
                             <button onClick={downloadJson} className="w-full text-left bg-gray-100 hover:bg-gray-200 text-brand-text-primary font-bold py-3 px-4 rounded-lg transition-colors">💾 Download All Data (JSON)</button>
                             <hr className="my-4"/>
                             <button onClick={exportKpiCapitalCSV} className="w-full text-left bg-gray-100 hover:bg-gray-200 text-brand-text-primary font-bold py-3 px-4 rounded-lg transition-colors">📊 Export Capital KPIs (CSV)</button>
                             <button onClick={exportKpiCapitalTemplate} className="w-full text-left bg-gray-100 hover:bg-gray-200 text-brand-text-primary font-bold py-3 px-4 rounded-lg transition-colors">📊 Download Capital KPI Template (CSV)</button>
                             <button onClick={exportKpiLiquidityCSV} className="w-full text-left bg-gray-100 hover:bg-gray-200 text-brand-text-primary font-bold py-3 px-4 rounded-lg transition-colors">💧 Export Liquidity KPIs (CSV)</button>
                             <button onClick={exportKpiLiquidityTemplate} className="w-full text-left bg-gray-100 hover:bg-gray-200 text-brand-text-primary font-bold py-3 px-4 rounded-lg transition-colors">💧 Download Liquidity KPI Template (CSV)</button>
                             <hr className="my-4"/>
                             <button onClick={exportDeadlinesCSV} className="w-full text-left bg-gray-100 hover:bg-gray-200 text-brand-text-primary font-bold py-3 px-4 rounded-lg transition-colors">📄 Export Deadlines (CSV)</button>
                             <button onClick={exportDeadlineTemplate} className="w-full text-left bg-gray-100 hover:bg-gray-200 text-brand-text-primary font-bold py-3 px-4 rounded-lg transition-colors">📄 Download Deadline Template (CSV)</button>
                             <button onClick={exportCounterpartyRwaCSV} className="w-full text-left bg-gray-100 hover:bg-gray-200 text-brand-text-primary font-bold py-3 px-4 rounded-lg transition-colors">🏆 Export Counterparty RWA (CSV)</button>
                             <button onClick={exportCounterpartyRwaTemplate} className="w-full text-left bg-gray-100 hover:bg-gray-200 text-brand-text-primary font-bold py-3 px-4 rounded-lg transition-colors">🏆 Download Counterparty RWA Template (CSV)</button>
                        </div>
                    </div>
                </div>
            </Card>

            <Card className="mb-8">
                <h2 className="text-xl font-bold text-brand-text-primary mb-4 pb-2 border-b-2 border-brand-accent">📝 KPI Editor</h2>
                <InfoBox>Select an entity and date to edit, or create a new entry. Liquidity values are edited for the 'TOT' currency aggregate only.</InfoBox>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 items-end">
                    {isCreating ? (
                         <>
                            <Select label="Entity" value={editableKpi?.entity || ''} onChange={e => handleKpiChange('entity', e.target.value)}>
                                <option value="">Select an Entity</option>
                                {allEntities.map(e => <option key={e} value={e}>{e}</option>)}
                            </Select>
                            <div>
                                <label htmlFor="new-kpi-date" className="block text-sm font-medium text-brand-text-secondary mb-1">New Date</label>
                                <input id="new-kpi-date" type="date" value={newKpiDate} onChange={e => setNewKpiDate(e.target.value)} className="block w-full p-3 border-2 border-gray-200 rounded-lg text-sm" required />
                            </div>
                         </>
                    ) : (
                        <>
                            <Select label="Entity" value={selectedEntity} onChange={e => { setSelectedEntity(e.target.value); setIsCreating(false); }}>
                                <option value="">Select an Entity</option>
                                {allEntities.map(e => <option key={e} value={e}>{e}</option>)}
                            </Select>
                            <Select label="Date" value={selectedDate} onChange={e => { setSelectedDate(e.target.value); setIsCreating(false); }} disabled={!selectedEntity}>
                                <option value="">Select a Date</option>
                                {availableDatesForEntity.map(d => <option key={d} value={d}>{formatDate(d)} ({d})</option>)}
                            </Select>
                        </>
                    )}
                     <div className="flex gap-2">
                        <button onClick={() => { setIsCreating(true); setSelectedEntity(''); setSelectedDate(''); setEditableKpi(createBlankKpiEntry()); }} className="w-full bg-brand-secondary hover:bg-brand-secondary-dark text-white font-bold py-3 px-4 rounded-lg transition-colors">
                            + Create New Entry
                        </button>
                         {isCreating && (
                             <button onClick={() => { setIsCreating(false); setEditableKpi(null); }} className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 px-4 rounded-lg transition-colors">
                                Cancel
                            </button>
                         )}
                    </div>
                </div>

                {editableKpi && (
                    <form onSubmit={handleSaveKpi}>
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-lg font-semibold text-brand-text-primary mb-3 border-b pb-2">Core Ratios</h3>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <KpiInput label="CET1 Capital" path="cet1Capital" value={editableKpi.cet1Capital} onChange={handleKpiChange} />
                                    <KpiInput label="Credit RWA" path="creditRWA" value={editableKpi.creditRWA} onChange={handleKpiChange} />
                                    <KpiInput label="Market RWA" path="marketRWA" value={editableKpi.marketRWA} onChange={handleKpiChange} />
                                    <KpiInput label="Operational RWA" path="opRWA" value={editableKpi.opRWA} onChange={handleKpiChange} />
                                    <KpiInput label="Other RWA" path="otherRWA" value={editableKpi.otherRWA} onChange={handleKpiChange} />
                                    <KpiInput label="HQLA (TOT)" path="liquidity.TOT.hqla" value={editableKpi.liquidity?.TOT?.hqla ?? ''} onChange={handleKpiChange} />
                                    <KpiInput label="Net Cash Outflows (TOT)" path="liquidity.TOT.netCashOutflows" value={editableKpi.liquidity?.TOT?.netCashOutflows ?? ''} onChange={handleKpiChange} />
                                    <KpiInput label="ASF (TOT)" path="liquidity.TOT.asf" value={editableKpi.liquidity?.TOT?.asf ?? ''} onChange={handleKpiChange} />
                                    <KpiInput label="RSF (TOT)" path="liquidity.TOT.rsf" value={editableKpi.liquidity?.TOT?.rsf ?? ''} onChange={handleKpiChange} />
                                    <KpiInput label="Tier 1" path="tier1" value={editableKpi.tier1} onChange={handleKpiChange} />
                                    <KpiInput label="Exposure" path="exposure" value={editableKpi.exposure} onChange={handleKpiChange} />
                                </div>
                            </div>
                            
                            <div>
                                <h3 className="text-lg font-semibold text-brand-text-primary mb-3 border-b pb-2 mt-4">CET1 Capital Breakdown</h3>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <KpiInput label="Equity" path="cet1CapitalBreakdown.equity" value={editableKpi.cet1CapitalBreakdown?.equity ?? ''} onChange={handleKpiChange} />
                                    <KpiInput label="PNL" path="cet1CapitalBreakdown.pnl" value={editableKpi.cet1CapitalBreakdown?.pnl ?? ''} onChange={handleKpiChange} />
                                    <KpiInput label="Share Buyback" path="cet1CapitalBreakdown.shareBuyback" value={editableKpi.cet1CapitalBreakdown?.shareBuyback ?? ''} onChange={handleKpiChange} />
                                    <KpiInput label="Goodwill/Intangibles" path="cet1CapitalBreakdown.goodwillIntangibles" value={editableKpi.cet1CapitalBreakdown?.goodwillIntangibles ?? ''} onChange={handleKpiChange} />
                                    <KpiInput label="Other Deductions" path="cet1CapitalBreakdown.otherDeductions" value={editableKpi.cet1CapitalBreakdown?.otherDeductions ?? ''} onChange={handleKpiChange} />
                                    <KpiInput label="To Be Defined" path="cet1CapitalBreakdown.toBeDefined" value={editableKpi.cet1CapitalBreakdown?.toBeDefined ?? ''} onChange={handleKpiChange} />
                                    <KpiInput label="Dividend" path="cet1CapitalBreakdown.dividend" value={editableKpi.cet1CapitalBreakdown?.dividend ?? ''} onChange={handleKpiChange} />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-lg font-semibold text-brand-text-primary mb-3 border-b pb-2 mt-4">HQLA Breakdown (TOT)</h3>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <KpiInput label="Central Bank" path="liquidity.TOT.hqlaBreakdown.centralBank" value={editableKpi.liquidity?.TOT?.hqlaBreakdown?.centralBank ?? ''} onChange={handleKpiChange} />
                                    <KpiInput label="Reverse Repo" path="liquidity.TOT.hqlaBreakdown.reverseRepo" value={editableKpi.liquidity?.TOT?.hqlaBreakdown?.reverseRepo ?? ''} onChange={handleKpiChange} />
                                    <KpiInput label="Sovereign" path="liquidity.TOT.hqlaBreakdown.sovereign" value={editableKpi.liquidity?.TOT?.hqlaBreakdown?.sovereign ?? ''} onChange={handleKpiChange} />
                                    <KpiInput label="Public Sector" path="liquidity.TOT.hqlaBreakdown.publicSector" value={editableKpi.liquidity?.TOT?.hqlaBreakdown?.publicSector ?? ''} onChange={handleKpiChange} />
                                    <KpiInput label="Other" path="liquidity.TOT.hqlaBreakdown.other" value={editableKpi.liquidity?.TOT?.hqlaBreakdown?.other ?? ''} onChange={handleKpiChange} />
                                </div>
                            </div>
                            
                            <div>
                                <h3 className="text-lg font-semibold text-brand-text-primary mb-3 border-b pb-2 mt-4">Net Cash Outflows Breakdown (TOT)</h3>
                                <h4 className="font-semibold text-brand-text-secondary mt-4 mb-2">Inflows</h4>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <KpiInput label="Bank and FI" path="liquidity.TOT.netCashOutflowsBreakdown.inflows.bankAndFi" value={editableKpi.liquidity?.TOT?.netCashOutflowsBreakdown?.inflows.bankAndFi ?? ''} onChange={handleKpiChange} />
                                    <KpiInput label="Retail" path="liquidity.TOT.netCashOutflowsBreakdown.inflows.retail" value={editableKpi.liquidity?.TOT?.netCashOutflowsBreakdown?.inflows.retail ?? ''} onChange={handleKpiChange} />
                                    <KpiInput label="Corporate" path="liquidity.TOT.netCashOutflowsBreakdown.inflows.corporate" value={editableKpi.liquidity?.TOT?.netCashOutflowsBreakdown?.inflows.corporate ?? ''} onChange={handleKpiChange} />
                                    <KpiInput label="Derivatives" path="liquidity.TOT.netCashOutflowsBreakdown.inflows.derivatives" value={editableKpi.liquidity?.TOT?.netCashOutflowsBreakdown?.inflows.derivatives ?? ''} onChange={handleKpiChange} />
                                    <KpiInput label="Other" path="liquidity.TOT.netCashOutflowsBreakdown.inflows.other" value={editableKpi.liquidity?.TOT?.netCashOutflowsBreakdown?.inflows.other ?? ''} onChange={handleKpiChange} />
                                </div>
                                <h4 className="font-semibold text-brand-text-secondary mt-6 mb-2">Outflows</h4>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <KpiInput label="Bank and FI" path="liquidity.TOT.netCashOutflowsBreakdown.outflows.bankAndFi" value={editableKpi.liquidity?.TOT?.netCashOutflowsBreakdown?.outflows.bankAndFi ?? ''} onChange={handleKpiChange} />
                                    <KpiInput label="Retail" path="liquidity.TOT.netCashOutflowsBreakdown.outflows.retail" value={editableKpi.liquidity?.TOT?.netCashOutflowsBreakdown?.outflows.retail ?? ''} onChange={handleKpiChange} />
                                    <KpiInput label="Corporate" path="liquidity.TOT.netCashOutflowsBreakdown.outflows.corporate" value={editableKpi.liquidity?.TOT?.netCashOutflowsBreakdown?.outflows.corporate ?? ''} onChange={handleKpiChange} />
                                    <KpiInput label="Derivatives" path="liquidity.TOT.netCashOutflowsBreakdown.outflows.derivatives" value={editableKpi.liquidity?.TOT?.netCashOutflowsBreakdown?.outflows.derivatives ?? ''} onChange={handleKpiChange} />
                                    <KpiInput label="Other" path="liquidity.TOT.netCashOutflowsBreakdown.outflows.other" value={editableKpi.liquidity?.TOT?.netCashOutflowsBreakdown?.outflows.other ?? ''} onChange={handleKpiChange} />
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 flex justify-end gap-4">
                            {!isCreating && (
                                <button
                                    type="button"
                                    onClick={handleDeleteKpi}
                                    className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                                >
                                    Delete Entry
                                </button>
                            )}
                            <button
                                type="submit"
                                className="bg-brand-primary hover:bg-brand-primary-dark text-white font-bold py-3 px-6 rounded-lg transition-colors"
                            >
                                {isCreating ? 'Create Entry' : 'Save Changes'}
                            </button>
                        </div>
                    </form>
                )}
            </Card>

            <Card className="mb-8">
                <h2 className="text-xl font-bold text-brand-text-primary mb-4 pb-2 border-b-2 border-brand-accent">🎯 Risk Appetite Management</h2>
                <InfoBox>Set Red and Amber thresholds for each entity. Values should be percentages (e.g., 8 for 8%).</InfoBox>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                         <thead className="text-left text-xs text-brand-text-primary uppercase bg-gray-100">
                             <tr>
                                 <th className="px-4 py-3">Entity</th>
                                 {kpiKeys.map(kpi => (
                                     <th key={kpi} colSpan={2} className="px-4 py-3 text-center border-l">{kpi.toUpperCase()} Thresholds</th>
                                 ))}
                             </tr>
                             <tr>
                                 <th className="px-4 py-2 bg-gray-100"></th>
                                 {kpiKeys.map(kpi => (
                                     <React.Fragment key={kpi}>
                                         <td className="px-4 py-2 bg-gray-50 text-center font-semibold text-red-600 border-l">Red</td>
                                         <td className="px-4 py-2 bg-gray-50 text-center font-semibold text-yellow-600">Amber</td>
                                     </React.Fragment>
                                 ))}
                             </tr>
                         </thead>
                        <tbody>
                             {allEntities.map(entity => (
                                <tr key={entity} className="border-b">
                                     <td className="px-4 py-3 font-bold text-brand-text-primary">{entity}</td>
                                    {kpiKeys.map(kpi => (
                                        <React.Fragment key={`${entity}-${kpi}`}>
                                             <td className="px-2 py-2 border-l">
                                                 <input 
                                                     type="number" 
                                                     step="any" 
                                                     value={appetiteData[entity]?.[kpi]?.red || ''} 
                                                     onChange={(e) => handleAppetiteChange(entity, kpi, 'red', e.target.value)}
                                                     className="w-full p-2 border-2 border-gray-200 rounded-lg text-sm"
                                                 />
                                            </td>
                                            <td className="px-2 py-2">
                                                 <input 
                                                     type="number" 
                                                     step="any" 
                                                     value={appetiteData[entity]?.[kpi]?.amber || ''} 
                                                     onChange={(e) => handleAppetiteChange(entity, kpi, 'amber', e.target.value)}
                                                     className="w-full p-2 border-2 border-gray-200 rounded-lg text-sm"
                                                 />
                                            </td>
                                        </React.Fragment>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="mt-6 text-right">
                    <button onClick={handleSaveAppetite} className="bg-brand-primary hover:bg-brand-primary-dark text-white font-bold py-2 px-6 rounded-lg transition-colors">
                        Save Thresholds
                    </button>
                </div>
            </Card>

            <Card>
                <h2 className="text-xl font-bold text-brand-text-primary mb-4 pb-2 border-b-2 border-brand-accent">💾 JSON Data Editor</h2>
                <InfoBox>
                    This is an advanced feature. Editing this JSON directly can break the application if the structure is not respected.
                </InfoBox>
                {jsonError && <p className="text-red-600 bg-red-100 p-3 rounded-md my-4">{jsonError}</p>}
                <textarea value={textData} onChange={handleTextChange} className={`w-full h-96 p-3 font-mono text-xs bg-gray-50 border-2 rounded-lg ${jsonError ? 'border-red-500' : 'border-gray-200 focus:border-brand-primary focus:ring-brand-primary'}`} />
                <div className="mt-4">
                    <button onClick={handleUpdateData} disabled={!!jsonError} className="bg-brand-primary hover:bg-brand-primary-dark text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed">
                        Save JSON
                    </button>
                </div>
            </Card>
        </div>
    );
};