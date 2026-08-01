// Frontend API client — all functions use the same camelCase shapes as the app's data layer.
// Conversion to/from snake_case happens here so the rest of the app never sees the DB format.

import type { Rule, ExcludePattern, CompanyScopedExclude } from '../data/rules';
import type { Customer } from '../data/customers';
export type { Rule, ExcludePattern, CompanyScopedExclude, Customer };

const BASE = '/api';

export function getToken(): string | null { return localStorage.getItem('delta_token'); }
export function setToken(t: string): void { localStorage.setItem('delta_token', t); }
export function clearToken(): void { localStorage.removeItem('delta_token'); }

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    if (token) {
      // Token existed but was rejected — expired or invalid, force re-login
      clearToken();
      localStorage.removeItem('delta_user');
      window.location.href = '/';
    }
    throw new Error('Unauthorized');
  }
  if (!res.ok) throw new Error(`API ${method} ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

const get = <T>(path: string) => req<T>('GET', path);
const post = <T>(path: string, body: unknown) => req<T>('POST', path, body);
const put = <T>(path: string, body: unknown) => req<T>('PUT', path, body);
const patch = <T>(path: string, body: unknown) => req<T>('PATCH', path, body);
const del = <T>(path: string) => req<T>('DELETE', path);

// ---- Rule conversion ----
interface DbRule {
  id: string; customer: string; keywords: string[]; compound_rules: { allOf: string[] }[];
  exclude_keywords: string[]; note?: string; source: string; created_at: string;
}
function ruleToDb(r: Rule): DbRule {
  return {
    id: r.id, customer: r.customer, keywords: r.keywords,
    compound_rules: r.compoundRules ?? [],
    exclude_keywords: r.excludeKeywords ?? [],
    note: r.note, source: r.source, created_at: r.createdAt,
  };
}
function ruleFromDb(r: DbRule): Rule {
  return {
    id: r.id, customer: r.customer, keywords: r.keywords,
    compoundRules: r.compound_rules,
    excludeKeywords: r.exclude_keywords,
    note: r.note, source: r.source as Rule['source'], createdAt: r.created_at,
  };
}

// ---- Customer conversion ----
interface DbCustomer {
  id: string; name: string; kam: string; rh: string; to_pay_flag: boolean; active: boolean;
}
function customerFromDb(c: DbCustomer): Customer {
  return { id: c.id, name: c.name, kam: c.kam, rh: c.rh, toPayFlag: c.to_pay_flag, active: c.active };
}
function customerToDb(c: Customer): DbCustomer {
  return { id: c.id, name: c.name, kam: c.kam, rh: c.rh, to_pay_flag: c.toPayFlag, active: c.active };
}

// ---- Rules API ----
export const apiRules = {
  getAll: () => get<DbRule[]>('/rules').then(rows => rows.map(ruleFromDb)),
  create: (rule: Rule) => post<DbRule>('/rules', ruleToDb(rule)).then(ruleFromDb),
  // update: safe single-row patch — never touches other rules
  update: (id: string, rule: Rule) => put<void>(`/rules/${id}`, ruleToDb(rule)),
  // bulkReplace: kept for restore scripts only — DO NOT call from UI code
  bulkReplace: (rules: Rule[]) => put<void>('/rules/bulk', rules.map(ruleToDb)),
  delete: (id: string) => del<void>(`/rules/${id}`),
};

// ---- Exclude Patterns API ----
export const apiExcludePatterns = {
  getAll: () => get<ExcludePattern[]>('/exclude-patterns'),
  bulkReplace: (patterns: ExcludePattern[]) => put<void>('/exclude-patterns/bulk', patterns),
};

// ---- Company-Scoped Excludes API ----
export const apiCSE = {
  getAll: () => get<CompanyScopedExclude[]>('/cse'),
  create: (cse: CompanyScopedExclude) => post<CompanyScopedExclude>('/cse', cse),
  update: (id: string, cse: Partial<CompanyScopedExclude>) => put<CompanyScopedExclude>(`/cse/${id}`, cse),
  delete: (id: string) => del<void>(`/cse/${id}`),
};

// ---- Customers API ----
export const apiCustomers = {
  getAll: () => get<DbCustomer[]>('/customers').then(rows => rows.map(customerFromDb)),
  create: (c: Customer) => post<DbCustomer>('/customers', customerToDb(c)).then(customerFromDb),
  bulkReplace: (customers: Customer[]) => put<void>('/customers/bulk', customers.map(customerToDb)),
  delete: (id: string) => del<void>(`/customers/${id}`),
};

// ---- Transactions API ----
export interface DbTransaction {
  id: string; date: string; customer: string; bank: string; account: string; company: string;
  amount: number; ref_no: string; narration: string; kam: string; rh: string;
  status: string; advise_status: string; advise_file?: string; advise_data?: string;
  created_at: string; exclude_reason?: string; comment?: string; fuzzy_hint?: string;
}
export const apiTransactions = {
  getAll: (params?: { bank?: string; company?: string; month?: string }) => {
    const qs = params ? new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v)) as Record<string, string>).toString() : '';
    return get<DbTransaction[]>(`/transactions${qs ? `?${qs}` : ''}`);
  },
  getPage: (offset: number, limit: number, params?: { bank?: string; company?: string; month?: string }) => {
    const p: Record<string, string> = { offset: String(offset), limit: String(limit) };
    if (params?.bank)    p.bank    = params.bank;
    if (params?.company) p.company = params.company;
    if (params?.month)   p.month   = params.month;
    return get<{ rows: DbTransaction[]; total: number }>(`/transactions/page?${new URLSearchParams(p).toString()}`);
  },
  bulkImport: (txns: DbTransaction[]) => post<void>('/transactions/bulk', txns),
  update: (id: string, data: Partial<DbTransaction>) => patch<DbTransaction>(`/transactions/${id}`, data),
  delete: (id: string) => del<void>(`/transactions/${id}`),
  fixKamRh: () => post<{ updated: number }>('/transactions/fix-kam-rh', {}),
  kamRhDiagnostic: () => get<{
    notInMaster: { customer: string; txn_count: string }[];
    masterBlank: { name: string; kam: string; rh: string; txn_count: string }[];
    fixedCount: number;
  }>('/transactions/kam-rh-diagnostic'),
  clearByBankMonth: (bank: string, month: string, company?: string, date?: string) => {
    const params: Record<string, string> = { bank, month };
    if (company) params.company = company;
    if (date)    params.date    = date;
    return del<void>(`/transactions/clear/by-bank-month?${new URLSearchParams(params).toString()}`);
  },
};

// ---- Users API ----
export interface DbUser {
  id: string; name: string; email: string; role: string; kam_name?: string | null; rh_name?: string | null; active?: boolean;
}
export const apiUsers = {
  getAll: () => get<DbUser[]>('/users'),
  create: (u: DbUser) => post<DbUser>('/users', u),
  update: (id: string, u: Partial<DbUser>) => put<DbUser>(`/users/${id}`, u),
  delete: (id: string) => del<void>(`/users/${id}`),
};

// ---- Targets API ----
export interface DbTargetRow { customer: string; p1: number; p2: number; p3: number; total_amount: number; }
export interface DbTargetMeta { kam_name: string; month_year: string; uploaded_at: string; uploaded_by: string; row_count: number; file_base64?: string; }
export const apiTargets = {
  getRows: (kam: string, month: string) => get<DbTargetRow[]>(`/targets/rows?kam=${encodeURIComponent(kam)}&month=${encodeURIComponent(month)}`),
  getMeta: (kam: string, month: string) => get<DbTargetMeta | null>(`/targets/meta?kam=${encodeURIComponent(kam)}&month=${encodeURIComponent(month)}`),
  getAvailable: () => get<DbTargetMeta[]>('/targets/available'),
  upload: (payload: { kam_name: string; month_year: string; rows: DbTargetRow[]; uploaded_by: string; file_base64?: string }) =>
    post<void>('/targets/upload', payload),
  delete: (kam: string, month: string) => del<void>(`/targets?kam=${encodeURIComponent(kam)}&month=${encodeURIComponent(month)}`),
};

// ---- Advise Files API ----
export interface DbAdviseFile { tx_id: string; file_name: string; file_data: string; uploaded_at: string; }
export const apiAdviseFiles = {
  get: (txId: string) => get<DbAdviseFile>(`/advise-files/${txId}`),
  upload: (payload: { tx_id: string; file_name: string; file_data: string }) =>
    post<{ success: boolean }>('/advise-files', payload),
  bulkUpload: (payload: { tx_ids: string[]; file_name: string; file_data: string }) =>
    post<{ success: boolean; count: number }>('/advise-files/bulk', payload),
};

// ---- History API ----
export interface DbHistoryEntry { id: string; timestamp: string; user_name: string; action: string; details: string; }
export const apiHistory = {
  getAll: (limit?: number) => get<DbHistoryEntry[]>(`/history${limit ? `?limit=${limit}` : ''}`),
  clear: () => del<void>('/history'),
};

// ---- Recycle Bin API ----
export interface DbBinItem { bin_id: string; type: string; payload: unknown; deleted_at: string; deleted_by: string; reason?: string; }
export const apiRecycleBin = {
  getAll: () => get<DbBinItem[]>('/recycle-bin'),
  add: (item: DbBinItem) => post<void>('/recycle-bin', item),
  delete: (binId: string) => del<void>(`/recycle-bin/${binId}`),
  clear: () => del<void>('/recycle-bin/clear'),
};

// ---- Bank Accounts API ----
export const apiBankAccounts = {
  getAll: () => get<Record<string, string>>('/bank-accounts'),
  save: (map: Record<string, string>) => put<void>('/bank-accounts', map),
};

// ---- Column Overrides API ----
export const apiColumnOverrides = {
  getAll: () => get<Record<string, Record<string, string>>>('/column-overrides'),
  save: (map: Record<string, Record<string, string>>) => put<void>('/column-overrides', map),
};

// ---- Settings API ----
export const apiSettings = {
  getAll: () => get<Record<string, string>>('/settings'),
  save: (map: Record<string, string>) => put<void>('/settings', map),
};

// ---- Auth API ----
type AuthUserPayload = { token: string; user: { id: string; name: string; email: string; role: string; kam_name?: string; rh_name?: string } };

export const apiAuth = {
  login: (email: string, password: string) =>
    fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(async res => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      return data as AuthUserPayload;
    }),

  // No password required — issues JWT for a non-admin user by id
  selectUser: (userId: string) =>
    fetch(`${BASE}/auth/select-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    }).then(async res => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to select user');
      return data as AuthUserPayload;
    }),

  // Public — no auth needed; returns non-admin users for the name picker
  getPublicUsers: () =>
    fetch(`${BASE}/auth/users`).then(async res => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load users');
      return data as { id: string; name: string; role: string; kam_name?: string; rh_name?: string }[];
    }),

  changePassword: (userId: string, currentPassword: string, newPassword: string) =>
    req<{ success: boolean }>('POST', '/auth/change-password', { userId, currentPassword, newPassword }),
};
