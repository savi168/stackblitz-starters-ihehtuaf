/**
 * Single source of truth for the application version.
 * scripts/release.ps1 reads it as its default -Version and stamps the API
 * assembly with the same number (dotnet publish /p:Version=…), so the header
 * badge, VERSION.txt, the zip name and GET /api/meta all agree.
 * Bump it when cutting a release.
 */
export const APP_VERSION = '3.2.0';

export interface ApiMeta {
  version: string;
  environment: string;        // raw ASP.NET environment name
  environmentLabel: string;   // PROD | TEST | DEV (or App:EnvironmentLabel)
  migrations: Array<{ name: string; appliedAt: string }>;
}

export const fetchMeta = async (apiBaseUrl: string): Promise<ApiMeta | null> => {
  try {
    const res = await fetch(`${apiBaseUrl}/meta`, { credentials: 'include' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
};
