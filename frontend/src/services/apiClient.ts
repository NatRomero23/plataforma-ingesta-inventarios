// Cliente de la API de la plataforma. El token JWT se guarda en localStorage.
// La credencial de Red Vidar NUNCA vive aquí (Principio V, FR-030).

const TOKEN_KEY = 'auth_token';
const ROLE_KEY = 'auth_role';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function getRole(): string | null {
  return localStorage.getItem(ROLE_KEY);
}
export function isPrivileged(): boolean {
  const role = getRole();
  return role === 'ADMIN' || role === 'COORDINATOR';
}
export function setSession(token: string, role: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ROLE_KEY, role);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface ValidationSummary {
  loadId: string;
  status: string;
  totalRows: number;
  validRows: number;
  rejectedRows: number;
  rowErrors: Array<{ rowNumber: number; reason: string }>;
  unmappedPharmacies: Array<{ chainPharmacyCode: string; rowCount: number }>;
}

export interface LoadSummary {
  loadId: string;
  origin: string;
  status: string;
  totalRows: number;
  validRows: number;
  rejectedRows: number;
  createdAt: string;
}

export async function login(email: string, password: string): Promise<{ token: string; role: string }> {
  const res = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('login');
  return res.json();
}

export async function downloadTemplate(): Promise<void> {
  const res = await fetch('/api/v1/inventory/template', { headers: authHeaders() });
  if (!res.ok) throw new Error('template');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plantilla-inventario.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

export async function uploadInventory(file: File): Promise<ValidationSummary> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/v1/inventory/portal-uploads', {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.message ?? 'upload');
  return body;
}

export async function confirmLoad(loadId: string): Promise<void> {
  const res = await fetch(`/api/v1/loads/${loadId}/confirm`, { method: 'POST', headers: authHeaders() });
  const body = await res.json();
  if (!res.ok) throw new Error(body.message ?? 'confirm');
}

export async function listMyLoads(): Promise<LoadSummary[]> {
  const res = await fetch('/api/v1/loads', { headers: authHeaders() });
  if (!res.ok) throw new Error('loads');
  return res.json();
}

export interface LoadFilters {
  chainId?: string;
  pharmacyCode?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface LoadDetail {
  loadId: string;
  chainId: string;
  origin: string;
  status: string;
  totalRows: number;
  validRows: number;
  rejectedRows: number;
  unmappedPharmacyCount: number;
  sourceLabel: string | null;
  originalFilename: string | null;
  uploadedBy: string | null;
  createdAt: string;
  rejectedDetail: Array<{ rowNumber: number; reason: string | null }>;
  attempts: Array<{
    attemptNumber: number;
    startedAt: string;
    finishedAt: string | null;
    httpStatus: number | null;
    webhookEventId: string | null;
    errorReason: string | null;
  }>;
  redVidarResult: {
    webhookEventId: string;
    entriesInserted: number | null;
    medicationsInserted: number | null;
    medicationsUpdated: number | null;
    unknownPharmacyCodes: string[];
  } | null;
}

export async function listLoads(filters: LoadFilters): Promise<LoadSummary[]> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  const res = await fetch(`/api/v1/loads?${params.toString()}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('loads');
  return res.json();
}

export async function getLoadDetail(loadId: string): Promise<LoadDetail> {
  const res = await fetch(`/api/v1/loads/${loadId}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('detail');
  return res.json();
}

export async function downloadOriginal(loadId: string, filename: string | null): Promise<void> {
  const res = await fetch(`/api/v1/loads/${loadId}/original`, { headers: authHeaders() });
  if (!res.ok) throw new Error('original');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `carga-${loadId}`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Administración (US5) ----------
async function jsonRequest<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { ...authHeaders(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error((data && data.message) || 'error');
  return data as T;
}

export interface Chain {
  id: string;
  name: string;
}
export interface Pharmacy {
  id: string;
  chainInternalCode: string;
  redVidarPharmacyCode: string | null;
  name: string;
}
export interface ApiKeyInfo {
  id: string;
  prefix: string;
  last4: string;
  status: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface PharmacyActivity {
  pharmacyId: string;
  name: string;
  chainInternalCode: string;
  redVidarPharmacyCode: string | null;
  lastSuccessfulLoadAt: string | null;
}

export async function listPharmacyActivity(chainId?: string): Promise<PharmacyActivity[]> {
  const qs = chainId ? `?chainId=${encodeURIComponent(chainId)}` : '';
  const res = await fetch(`/api/v1/pharmacies/activity${qs}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('activity');
  return res.json();
}

export const admin = {
  listChains: () => jsonRequest<Chain[]>('/api/v1/chains', 'GET'),
  createChain: (name: string) => jsonRequest<Chain>('/api/v1/chains', 'POST', { name }),
  listPharmacies: (chainId: string) => jsonRequest<Pharmacy[]>(`/api/v1/chains/${chainId}/pharmacies`, 'GET'),
  createPharmacy: (chainId: string, data: { chainInternalCode: string; redVidarPharmacyCode: string | null; name: string }) =>
    jsonRequest<Pharmacy>(`/api/v1/chains/${chainId}/pharmacies`, 'POST', data),
  createUser: (data: { email: string; password: string; role: string; chainId: string | null }) =>
    jsonRequest<unknown>('/api/v1/users', 'POST', data),
  listApiKeys: (chainId: string) => jsonRequest<ApiKeyInfo[]>(`/api/v1/chains/${chainId}/api-keys`, 'GET'),
  generateApiKey: (chainId: string) =>
    jsonRequest<{ apiKey: string; last4: string }>(`/api/v1/chains/${chainId}/api-keys`, 'POST'),
  revokeApiKey: (apiKeyId: string) => jsonRequest<null>(`/api/v1/api-keys/${apiKeyId}/revoke`, 'POST'),
};
