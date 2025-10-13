import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { CentralData, CalculatedKpis } from '../types';
import { centralData as initialData } from '../constants';
import { calculateKpis } from '../utils';

export const LOCAL_STORAGE_KEY = 'regReportData';

// --- DATA CONTEXT ---
export const DataContext = React.createContext<{
    data: CentralData;
    setData: React.Dispatch<React.SetStateAction<CentralData>>;
    allEntities: string[];
    allDates: string[];
    getKpisForDate: (entity: string, date: string, currency?: string) => CalculatedKpis | null;
}>({
    data: initialData,
    setData: () => {},
    allEntities: [],
    allDates: [],
    getKpisForDate: () => null,
});

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [data, setData] = useState<CentralData>(() => {
        try {
            const storedData = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (storedData) {
                return JSON.parse(storedData);
            }
        } catch (error) {
            console.error("Failed to parse data from localStorage", error);
        }
        return initialData;
    });

    useEffect(() => {
        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error("Failed to save data to localStorage", error);
        }
    }, [data]);

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
        getKpisForDate
    }), [data, allEntities, allDates, getKpisForDate]);

    return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = () => React.useContext(DataContext);