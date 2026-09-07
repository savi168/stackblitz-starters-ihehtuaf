/**
 * Document library client: files stored inside the RegReport database and
 * streamed by /api/documents — the list carries metadata only.
 */

export interface DocMeta {
  id: number;
  folder: string;
  title: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  entity?: string | null;
  date?: string | null;
  kind?: string | null;
  notes?: string | null;
  uploadedBy: string;
  uploadedAt: string;
}

export const DOC_KINDS: Array<[string, string]> = [
  ['workingPaper', 'Working paper'],
  ['casabis', 'CASABIS'],
  ['lcr', 'LCR_G'],
  ['nsfr', 'NSFR_G'],
  ['other', 'Other'],
];
export const kindLabel = (k?: string | null): string =>
  DOC_KINDS.find(([key]) => key === k)?.[1] ?? (k || '—');

export const fmtSize = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB`
  : `${bytes} B`;

const fail = async (res: Response): Promise<never> => {
  const body = await res.text().catch(() => '');
  throw new Error(`${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 300)}` : ''}`);
};

export const listDocuments = async (apiBaseUrl: string): Promise<DocMeta[]> => {
  const res = await fetch(`${apiBaseUrl}/documents`, { credentials: 'include' });
  if (!res.ok) return fail(res);
  const out = await res.json();
  return Array.isArray(out) ? out : [];
};

export const uploadDocument = async (
  apiBaseUrl: string, file: File,
  meta: { folder?: string; title?: string; entity?: string; date?: string; kind?: string; notes?: string }
): Promise<void> => {
  const form = new FormData();
  form.append('file', file);
  for (const [k, v] of Object.entries(meta)) if (v) form.append(k, v);
  const res = await fetch(`${apiBaseUrl}/documents`, { method: 'POST', credentials: 'include', body: form });
  if (!res.ok) return fail(res);
};

/** Metadata-only update: move to another folder, rename, retag. */
export const updateDocument = async (
  apiBaseUrl: string, id: number,
  meta: { folder?: string; title?: string; entity?: string; date?: string; kind?: string; notes?: string }
): Promise<void> => {
  const res = await fetch(`${apiBaseUrl}/documents/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(meta),
  });
  if (!res.ok && res.status !== 204) return fail(res);
};

export const deleteDocument = async (apiBaseUrl: string, id: number): Promise<void> => {
  const res = await fetch(`${apiBaseUrl}/documents/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!res.ok && res.status !== 204) return fail(res);
};

/** Downloads through fetch (Windows-auth friendly in dev cross-origin too). */
export const downloadDocument = async (apiBaseUrl: string, doc: DocMeta): Promise<void> => {
  const res = await fetch(`${apiBaseUrl}/documents/${doc.id}/download`, { credentials: 'include' });
  if (!res.ok) return fail(res);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = doc.fileName || doc.title;
  a.click();
  URL.revokeObjectURL(url);
};
