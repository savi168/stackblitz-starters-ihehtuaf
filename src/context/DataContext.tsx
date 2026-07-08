import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { CentralData, CalculatedKpis } from '../types';
import { centralData as initialData } from '../constants';
import { calculateKpis } from '../utils';
import { dataRepository } from '../services/dataRepository';

// Re-exported for backwards compatibility (some modules import it from here).
export { LOCAL_STORAGE_KEY } from '../services/dataRepository';

// --- DATA CONTEXT ---
export const DataContext = React.createContext<{
    data: CentralData;
    setData: React.Dispatch<React.SetStateAction<CentralData>>;
    allEntities: string[];
    allDates: string[];
    getKpisForDate: (entity: string, date: string, currency?: string) => CalculatedKpis | null;
    isLoading: boolean;
    loadError: string | null;
    /** 'local' (browser storage) or 'api' (REST backend). */
    mode: 'local' | 'api';
    /** Base URL of the REST API when in 'api' mode. */
    apiBaseUrl?: string;
    /** Re-fetch the central data from the configured source (reboot/reconnect). */
    reload: () => Promise<void>;
    /** Timestamp (ms) of the last successful load from the source. */
    lastSyncedAt: number | null;
}>({
    data: initialData,
    setData: () => {},
    allEntities: [],
    allDates: [],
    getKpisForDate: () => null,
    isLoading: true,
    loadError: null,
    mode: dataRepository.mode,
    apiBaseUrl: dataRepository.baseUrl,
    reload: async () => {},
    lastSyncedAt: null,
});

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [data, setData] = useState<CentralData>(initialData);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
    // Skip persisting the data that was just loaded (only persist real edits).
    const skipNextSave = useRef(true);

    // Data saved before newer tables existed lacks their arrays — default them
    // so every consumer (cockpit, workbench) sees consistent lists.
    const normalize = (d: CentralData): CentralData => ({
        ...d,
        capitalReports: d.capitalReports ?? [],
        lcrReports: d.lcrReports ?? [],
        nsfrReports: d.nsfrReports ?? [],
    });

    // Initial load from the configured repository (localStorage or API).
    useEffect(() => {
        let cancelled = false;
        dataRepository.load()
            .then(loaded => { if (!cancelled) { setData(normalize(loaded)); setLastSyncedAt(Date.now()); } })
            .catch(err => {
                if (!cancelled) {
                    console.error('Failed to load data', err);
                    setLoadError(err instanceof Error ? err.message : String(err));
                }
            })
            .finally(() => { if (!cancelled) setIsLoading(false); });
        return () => { cancelled = true; };
    }, []);

    // Re-fetch from the source on demand (cockpit "reboot"/reconnect). Does not
    // persist — the next render's save is suppressed so a reload can't echo back.
    const reload = useCallback(async () => {
        setLoadError(null);
        try {
            const loaded = await dataRepository.load();
            skipNextSave.current = true;
            setData(normalize(loaded));
            setLastSyncedAt(Date.now());
        } catch (err) {
            console.error('Failed to reload data', err);
            setLoadError(err instanceof Error ? err.message : String(err));
            throw err;
        }
    }, []);

    // Debounced persistence of user edits.
    useEffect(() => {
        if (isLoading) return;
        if (skipNextSave.current) { skipNextSave.current = false; return; }
        const handle = setTimeout(() => {
            dataRepository.save(data).catch(err => console.error('Failed to save data', err));
        }, 400);
        return () => clearTimeout(handle);
    }, [data, isLoading]);

    const allEntities = useMemo(() => Array.from(new Set(data.kpisHistory.map(k => k.entity))).sort(), [data.kpisHistory]);
    const allDates = useMemo(() => Array.from(new Set(data.kpisHistory.map(k => k.date))).sort((a, b) => new Date(b).getTime() - new Date(a).getTime()), [data.kpisHistory]);

    const getKpisForDate = useCallback((entity: string, date: string, currency: string = "TOT"): CalculatedKpis | null => {
        const entry = data.kpisHistory.find(k => k.entity === entity && k.date === date);
        return entry ? calculateKpis(entry, currency) : null;
    }, [data.kpisHistory]);

    const value = useMemo(() => ({
        data,
        setData,
        allEntities,
        allDates,
        getKpisForDate,
        isLoading,
        loadError,
        mode: dataRepository.mode,
        apiBaseUrl: dataRepository.baseUrl,
        reload,
        lastSyncedAt,
    }), [data, allEntities, allDates, getKpisForDate, isLoading, loadError, reload, lastSyncedAt]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-brand-bg-body text-brand-text-secondary">
                <span className="animate-pulse text-lg">Loading data…</span>
            </div>
        );
    }

    return (
        <DataContext.Provider value={value}>
            {loadError && (
                <div className="bg-status-red/10 border-b border-status-red/40 text-status-red text-sm px-6 py-2 text-center">
                    Could not reach the backend ({loadError}). Showing local seed data.
                </div>
            )}
            {children}
        </DataContext.Provider>
    );
};

export const useData = () => React.useContext(DataContext);
