import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiRecycleBin } from '../api';
import type { Transaction } from './TransactionsContext';
import type { Rule, ExcludePattern } from '../data/rules';
import type { Customer } from '../data/customers';

export type BinItemType = 'transaction' | 'rule' | 'exclude_pattern' | 'customer';

export interface BinItem {
  binId: string;
  type: BinItemType;
  payload: Transaction | Rule | ExcludePattern | Customer;
  deletedAt: string;
  deletedBy: string;
  reason?: string;
}

interface RecycleBinCtx {
  binItems: BinItem[];
  sendToRecycleBin: (type: BinItemType, payload: BinItem['payload'], deletedBy: string, reason?: string) => Promise<void>;
  removeFromBin: (binId: string) => Promise<void>;
  clearBin: () => Promise<void>;
}

const RecycleBinContext = createContext<RecycleBinCtx>({} as RecycleBinCtx);

function dbToBin(row: { bin_id: string; type: string; payload: unknown; deleted_at: string; deleted_by: string; reason?: string }): BinItem {
  return { binId: row.bin_id, type: row.type as BinItemType, payload: row.payload as BinItem['payload'], deletedAt: row.deleted_at, deletedBy: row.deleted_by, reason: row.reason };
}

export function RecycleBinProvider({ children }: { children: React.ReactNode }) {
  const [binItems, setBinItems] = useState<BinItem[]>([]);

  useEffect(() => {
    apiRecycleBin.getAll().then(rows => setBinItems(rows.map(dbToBin)));
  }, []);

  async function sendToRecycleBin(type: BinItemType, payload: BinItem['payload'], deletedBy: string, reason?: string) {
    const item: BinItem = {
      binId: `bin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      payload,
      deletedAt: new Date().toISOString(),
      deletedBy,
      reason,
    };
    await apiRecycleBin.add({ bin_id: item.binId, type: item.type, payload: item.payload, deleted_at: item.deletedAt, deleted_by: item.deletedBy, reason: item.reason });
    setBinItems(prev => [item, ...prev]);
  }

  async function removeFromBin(binId: string) {
    await apiRecycleBin.delete(binId);
    setBinItems(prev => prev.filter(i => i.binId !== binId));
  }

  async function clearBin() {
    await apiRecycleBin.clear();
    setBinItems([]);
  }

  return (
    <RecycleBinContext.Provider value={{ binItems, sendToRecycleBin, removeFromBin, clearBin }}>
      {children}
    </RecycleBinContext.Provider>
  );
}

export function useRecycleBin() { return useContext(RecycleBinContext); }
