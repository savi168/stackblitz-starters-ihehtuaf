import { CentralData } from '../types';
import { centralData as seedData } from '../constants';

/**
 * Abstraction over where the application's central data lives.
 *
 * Two implementations are provided:
 *  - LocalStorageRepository: the default, fully client-side mode (no backend).
 *  - ApiRepository: talks to a REST backend (e.g. the .NET + SQL Server API
 *    described in docs/BACKEND.md) when VITE_API_BASE_URL is configured.
 *
 * Swapping between them requires no changes in the React components — only the
 * VITE_API_BASE_URL environment variable. See docs/BACKEND.md for wiring.
 */
export interface DataRepository {
  readonly mode: 'local' | 'api';
  /** Base URL of the REST API when in 'api' mode (undefined in 'local' mode). */
  readonly baseUrl?: string;
  /** Load the full central data document. */
  load(): Promise<CentralData>;
  /** Persist the full central data document. */
  save(data: CentralData): Promise<void>;
}

export const LOCAL_STORAGE_KEY = 'regReportData';

class LocalStorageRepository implements DataRepository {
  readonly mode = 'local' as const;

  async load(): Promise<CentralData> {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) return JSON.parse(stored) as CentralData;
    } catch (error) {
      console.error('Failed to read data from localStorage', error);
    }
    return seedData;
  }

  async save(data: CentralData): Promise<void> {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save data to localStorage', error);
    }
  }
}

class ApiRepository implements DataRepository {
  readonly mode = 'api' as const;
  readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private headers(): HeadersInit {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    // If you use a bearer token (e.g. Entra ID / JWT), inject it here:
    // const token = sessionStorage.getItem('access_token');
    // if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  async load(): Promise<CentralData> {
    const res = await fetch(`${this.baseUrl}/data`, { headers: this.headers() });
    if (!res.ok) throw new Error(`GET /data failed: ${res.status} ${res.statusText}`);
    return (await res.json()) as CentralData;
  }

  async save(data: CentralData): Promise<void> {
    const res = await fetch(`${this.baseUrl}/data`, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`PUT /data failed: ${res.status} ${res.statusText}`);
  }
}

/**
 * Selects the repository implementation at startup. Set VITE_API_BASE_URL in a
 * .env file (see .env.example) to switch the whole app to the REST backend.
 */
export const dataRepository: DataRepository = (() => {
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (baseUrl) {
    return new ApiRepository(baseUrl.replace(/\/+$/, ''));
  }
  return new LocalStorageRepository();
})();
