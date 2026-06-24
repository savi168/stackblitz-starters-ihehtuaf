/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the REST backend (e.g. https://localhost:7042/api).
   * When empty/undefined, the app runs fully client-side using localStorage.
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
