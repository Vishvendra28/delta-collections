import React, { createContext, useContext, useState, useCallback } from 'react';
import { apiTargets } from '../api';
import type { DbTargetRow, DbTargetMeta } from '../api';

export interface TargetRow {
  customer: string;
  p1: number;
  p2: number;
  p3: number;
  totalAmount: number;
}

export interface TargetMeta {
  uploadedAt: string;
  uploadedBy: string;
  monthYear: string;
  kamName: string;
  rowCount: number;
}

interface TargetCtx {
  version: number;
  uploadTarget: (kamName: string, monthYear: string, rows: TargetRow[], fileBase64: string, uploadedBy: string) => Promise<void>;
  uploadMasterTarget: (monthYear: string, kamRowsMap: Record<string, TargetRow[]>, fileBase64: string, uploadedBy: string) => Promise<void>;
  deleteTarget: (kamName: string, monthYear: string) => Promise<void>;
  getTargetRows: (kamName: string, monthYear: string) => TargetRow[];
  getTargetMeta: (kamName: string, monthYear: string) => TargetMeta | null;
  getTargetFile: (kamName: string, monthYear: string) => string | null;
  prefetchTarget: (kamName: string, monthYear: string) => Promise<void>;
}

const TargetContext = createContext<TargetCtx>({} as TargetCtx);

type CacheKey = string;
const rowCache = new Map<CacheKey, TargetRow[]>();
const metaCache = new Map<CacheKey, TargetMeta | null>();
const fileCache = new Map<CacheKey, string | null>();

function cacheKey(kam: string, month: string) { return `${kam}::${month}`; }

function dbRowToRow(r: DbTargetRow): TargetRow {
  return { customer: r.customer, p1: Number(r.p1), p2: Number(r.p2), p3: Number(r.p3), totalAmount: Number(r.total_amount) };
}

function dbMetaToMeta(m: DbTargetMeta): TargetMeta {
  return { uploadedAt: m.uploaded_at, uploadedBy: m.uploaded_by, monthYear: m.month_year, kamName: m.kam_name, rowCount: m.row_count };
}

export function TargetProvider({ children }: { children: React.ReactNode }) {
  const [version, setVersion] = useState(0);

  const prefetchTarget = useCallback(async (kamName: string, monthYear: string) => {
    const key = cacheKey(kamName, monthYear);
    if (metaCache.has(key)) return; // already loaded
    const [rows, meta] = await Promise.all([
      apiTargets.getRows(kamName, monthYear),
      apiTargets.getMeta(kamName, monthYear),
    ]);
    rowCache.set(key, rows.map(dbRowToRow));
    metaCache.set(key, meta ? dbMetaToMeta(meta) : null);
    fileCache.set(key, meta?.file_base64 ?? null);
    setVersion(v => v + 1); // trigger re-render
  }, []);

  async function uploadTarget(kamName: string, monthYear: string, rows: TargetRow[], fileBase64: string, uploadedBy: string) {
    await apiTargets.upload({
      kam_name: kamName,
      month_year: monthYear,
      rows: rows.map(r => ({ customer: r.customer, p1: r.p1, p2: r.p2, p3: r.p3, total_amount: r.totalAmount })),
      uploaded_by: uploadedBy,
      file_base64: fileBase64,
    });
    const key = cacheKey(kamName, monthYear);
    rowCache.set(key, rows);
    const meta: TargetMeta = { uploadedAt: new Date().toISOString(), uploadedBy, monthYear, kamName, rowCount: rows.length };
    metaCache.set(key, meta);
    fileCache.set(key, fileBase64);
    setVersion(v => v + 1);
  }

  async function uploadMasterTarget(monthYear: string, kamRowsMap: Record<string, TargetRow[]>, fileBase64: string, uploadedBy: string) {
    for (const [kamName, rows] of Object.entries(kamRowsMap)) {
      if (rows.length === 0) continue;
      await apiTargets.upload({
        kam_name: kamName,
        month_year: monthYear,
        rows: rows.map(r => ({ customer: r.customer, p1: r.p1, p2: r.p2, p3: r.p3, total_amount: r.totalAmount })),
        uploaded_by: uploadedBy,
        file_base64: fileBase64,
      });
      const key = cacheKey(kamName, monthYear);
      rowCache.set(key, rows);
      const meta: TargetMeta = { uploadedAt: new Date().toISOString(), uploadedBy, monthYear, kamName, rowCount: rows.length };
      metaCache.set(key, meta);
      fileCache.set(key, fileBase64);
    }
    setVersion(v => v + 1);
  }

  async function deleteTarget(kamName: string, monthYear: string) {
    await apiTargets.delete(kamName, monthYear);
    const key = cacheKey(kamName, monthYear);
    rowCache.delete(key);
    metaCache.set(key, null);
    fileCache.delete(key);
    setVersion(v => v + 1);
  }

  function getTargetRows(kamName: string, monthYear: string): TargetRow[] {
    const key = cacheKey(kamName, monthYear);
    if (!rowCache.has(key)) {
      // Trigger async fetch — return empty for now, re-render when done
      prefetchTarget(kamName, monthYear);
      return [];
    }
    return rowCache.get(key) ?? [];
  }

  function getTargetMeta(kamName: string, monthYear: string): TargetMeta | null {
    const key = cacheKey(kamName, monthYear);
    if (!metaCache.has(key)) {
      prefetchTarget(kamName, monthYear);
      return null;
    }
    return metaCache.get(key) ?? null;
  }

  function getTargetFile(kamName: string, monthYear: string): string | null {
    const key = cacheKey(kamName, monthYear);
    if (!fileCache.has(key)) {
      prefetchTarget(kamName, monthYear);
      return null;
    }
    return fileCache.get(key) ?? null;
  }

  return (
    <TargetContext.Provider value={{ version, uploadTarget, uploadMasterTarget, deleteTarget, getTargetRows, getTargetMeta, getTargetFile, prefetchTarget }}>
      {children}
    </TargetContext.Provider>
  );
}

export function useTarget() { return useContext(TargetContext); }
