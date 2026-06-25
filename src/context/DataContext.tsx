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
}>({
    data: initialData,
    setData: () => {},
    allEntities: [],
    allDates: [],
    getKpisForDate: () => null,
    isLoading: true,
    loadError: null,
    mode: dataRepository.mode,
});

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [data, setData] = useState<CentralData>(initialData);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    // Skip persisting the data that was just loaded (only persist real edits).
    const skipNextSave = useRef(true);

    // Initial load from the configured repository (localStorage or API).
    useEffect(() => {
        let cancelled = false;
        dataRepository.load()
            .then(loaded => { if (!cancelled) setData(loaded); })
            .catch(err => {
                if (!cancelled) {
                    console.error('Failed to load data', err);
                    setLoadError(err instanceof Error ? err.message : String(err));
                }
            })
            .finally(() => { if (!cancelled) setIsLoading(false); });
        return () => { cancelled = true; };
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
    }), [data, allEntities, allDates, getKpisForDate, isLoading, loadError]);

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
