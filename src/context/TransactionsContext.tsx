import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiTransactions, apiAdviseFiles } from '../api';

export type TxStatus = 'matched' | 'manual_review' | 'excluded' | 'duplicate';
export type AdviseStatus = 'pending' | 'uploaded';

export interface Transaction {
  id: string;
  date: string;
  customer: string;
  bank: string;
  account: string;
  company: string;
  amount: number;
  refNo: string;
  narration: string;
  kam: string;
  rh: string;
  status: TxStatus;
  adviseStatus: AdviseStatus;
  adviseFile?: string;
  createdAt: string;
  excludeReason?: string;
  comment?: string;
  fuzzyHint?: string;
}

interface TxCtx {
  transactions: Transaction[];
  loading: boolean;
  addTransactions: (txs: Transaction[]) => Promise<void>;
  replaceByBankMonth: (bank: string, months: string[], txs: Transaction[], company: string) => Promise<void>;
  clearByBankMonth: (bank: string, month: string, company?: string, date?: string) => Promise<void>;
  assignTransaction: (id: string, customer: string, kam: string, rh: string) => void;
  reassignTransaction: (id: string, customer: string, kam: string, rh: string) => void;
  bulkAssign: (ids: string[], customer: string, kam: string, rh: string) => void;
  rejectTransaction: (id: string, reason: string) => void;
  deleteTransaction: (id: string) => void;
  uploadAdvise: (id: string, fileName: string, fileData: string) => Promise<void>;
  bulkUploadAdvise: (ids: string[], fileName: string, fileData: string) => Promise<void>;
  updateTransaction: (id: string, updates: Partial<Transaction>) => void;
  reenrichTransactions: (lookup: (name: string) => { kam: string; rh: string } | null) => void;
}

const TransactionsContext = createContext<TxCtx>({} as TxCtx);

function toApiTx(t: Transaction) {
  return {
    id: t.id, date: t.date, customer: t.customer, bank: t.bank, account: t.account,
    company: t.company, amount: t.amount, ref_no: t.refNo, narration: t.narration,
    kam: t.kam, rh: t.rh, status: t.status, advise_status: t.adviseStatus,
    advise_file: t.adviseFile, created_at: t.createdAt,
    exclude_reason: t.excludeReason, comment: t.comment, fuzzy_hint: t.fuzzyHint,
  };
}

function fromApiTx(r: Record<string, unknown>): Transaction {
  return {
    id: r.id as string, date: r.date as string, customer: r.customer as string,
    bank: r.bank as string, account: r.account as string, company: r.company as string,
    amount: Number(r.amount), refNo: (r.ref_no as string) || '',
    narration: (r.narration as string) || '', kam: (r.kam as string) || '',
    rh: (r.rh as string) || '', status: (r.status as TxStatus) || 'manual_review',
    adviseStatus: (r.advise_status as AdviseStatus) || 'pending',
    adviseFile: r.advise_file as string | undefined,
    createdAt: r.created_at as string,
    excludeReason: r.exclude_reason as string | undefined,
    comment: r.comment as string | undefined, fuzzyHint: r.fuzzy_hint as string | undefined,
  };
}

export function TransactionsProvider({ children }: { children: React.ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const PAGE = 500;
    async function loadAll() {
      setLoading(true);
      // Try progressive loading first; fall back to full load if /page endpoint not available
      const pageResult = await apiTransactions.getPage(0, PAGE).catch(() => null);
      if (cancelled) return;

      if (!pageResult) {
        // Fallback: server needs restart to have /page endpoint
        const rows = await apiTransactions.getAll().catch(err => { console.error(err); return null; });
        if (cancelled || !rows) return;
        setTransactions(rows.map(r => fromApiTx(r as unknown as Record<string, unknown>)));
        setLoading(false);
        return;
      }

      setTransactions(pageResult.rows.map(r => fromApiTx(r as unknown as Record<string, unknown>)));
      setLoading(false);

      let offset = PAGE;
      while (offset < pageResult.total) {
        if (cancelled) return;
        const page = await apiTransactions.getPage(offset, PAGE).catch(() => null);
        if (cancelled || !page) return;
        setTransactions(prev => [...prev, ...page.rows.map(r => fromApiTx(r as unknown as Record<string, unknown>))]);
        offset += PAGE;
      }
    }
    loadAll();
    return () => { cancelled = true; };
  }, []);

  async function addTransactions(txs: Transaction[]) {
    const dedupeKey = (t: Transaction) =>
      t.refNo?.trim() ? t.refNo.trim() : `${t.date}|${t.amount}|${t.narration.slice(0, 40)}`;
    const existingKeys = new Set(transactions.map(dedupeKey));
    const fresh = txs.filter(t => !existingKeys.has(dedupeKey(t)));
    if (fresh.length === 0) return;
    await apiTransactions.bulkImport(fresh.map(toApiTx) as never);
    setTransactions(prev => [...prev, ...fresh]);
  }

  async function replaceByBankMonth(bank: string, months: string[], txs: Transaction[], company: string) {
    const monthSet = new Set(months);
    const dedupeKey = (t: Transaction) =>
      t.refNo?.trim() ? t.refNo.trim() : `${t.date}|${t.amount}|${t.narration.slice(0, 40)}`;
    const seen = new Set<string>();
    const dedupedTxs = txs.filter(t => {
      const k = dedupeKey(t);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    // Clear old for this bank+company+month only — never touch other companies
    for (const month of months) {
      await apiTransactions.clearByBankMonth(bank, month, company);
    }
    if (dedupedTxs.length > 0) {
      await apiTransactions.bulkImport(dedupedTxs.map(toApiTx) as never);
    }
    setTransactions(prev => {
      const kept = prev.filter(t => !(t.bank === bank && t.company === company && monthSet.has(t.date.slice(0, 7))));
      return [...kept, ...dedupedTxs];
    });
  }

  async function clearByBankMonth(bank: string, month: string, company?: string, date?: string) {
    await apiTransactions.clearByBankMonth(bank, month, company, date);
    setTransactions(prev => prev.filter(t => !(
      t.bank === bank &&
      t.date.slice(0, 7) === month &&
      (!company || t.company === company) &&
      (!date || t.date === date)
    )));
  }

  function assignTransaction(id: string, customer: string, kam: string, rh: string) {
    setTransactions(prev => prev.map(t =>
      t.id === id ? { ...t, status: 'matched', customer, kam, rh, adviseStatus: 'pending' } : t
    ));
    apiTransactions.update(id, { customer, kam, rh, status: 'matched', advise_status: 'pending' } as never).catch(console.error);
  }

  function bulkAssign(ids: string[], customer: string, kam: string, rh: string) {
    const idSet = new Set(ids);
    setTransactions(prev => prev.map(t =>
      idSet.has(t.id) ? { ...t, status: 'matched' as TxStatus, customer, kam, rh, adviseStatus: 'pending' } : t
    ));
    Promise.all(ids.map(id => apiTransactions.update(id, { customer, kam, rh, status: 'matched', advise_status: 'pending' } as never))).catch(console.error);
  }

  function rejectTransaction(id: string, reason: string) {
    setTransactions(prev => prev.map(t =>
      t.id === id ? { ...t, status: 'excluded', excludeReason: reason } : t
    ));
    apiTransactions.update(id, { status: 'excluded', exclude_reason: reason } as never).catch(console.error);
  }

  function deleteTransaction(id: string) {
    setTransactions(prev => prev.filter(t => t.id !== id));
    apiTransactions.delete(id).catch(console.error);
  }

  function reassignTransaction(id: string, customer: string, kam: string, rh: string) {
    setTransactions(prev => prev.map(t =>
      t.id === id ? { ...t, status: 'matched', customer, kam, rh } : t
    ));
    apiTransactions.update(id, { customer, kam, rh, status: 'matched' } as never).catch(console.error);
  }

  async function uploadAdvise(id: string, fileName: string, fileData: string) {
    await apiAdviseFiles.upload({ tx_id: id, file_name: fileName, file_data: fileData });
    setTransactions(prev => prev.map(t =>
      t.id === id ? { ...t, adviseStatus: 'uploaded', adviseFile: fileName } : t
    ));
  }

  async function bulkUploadAdvise(ids: string[], fileName: string, fileData: string) {
    await apiAdviseFiles.bulkUpload({ tx_ids: ids, file_name: fileName, file_data: fileData });
    const idSet = new Set(ids);
    setTransactions(prev => prev.map(t =>
      idSet.has(t.id) ? { ...t, adviseStatus: 'uploaded', adviseFile: fileName } : t
    ));
  }

  function updateTransaction(id: string, updates: Partial<Transaction>) {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    const current = transactions.find(t => t.id === id);
    if (current) {
      apiTransactions.update(id, toApiTx({ ...current, ...updates }) as never).catch(console.error);
    }
  }

  function reenrichTransactions(lookup: (name: string) => { kam: string; rh: string } | null) {
    const dbUpdates: Array<{ id: string; kam: string; rh: string }> = [];
    const next = transactions.map(t => {
      if (t.status !== 'matched') return t;
      const found = lookup(t.customer);
      if (!found || (t.kam === found.kam && t.rh === found.rh)) return t;
      dbUpdates.push({ id: t.id, kam: found.kam, rh: found.rh });
      return { ...t, kam: found.kam, rh: found.rh };
    });
    setTransactions(next);
    Promise.all(dbUpdates.map(u => apiTransactions.update(u.id, { kam: u.kam, rh: u.rh } as never))).catch(console.error);
  }

  return (
    <TransactionsContext.Provider value={{ transactions, loading, addTransactions, replaceByBankMonth, clearByBankMonth, assignTransaction, reassignTransaction, bulkAssign, rejectTransaction, deleteTransaction, uploadAdvise, bulkUploadAdvise, updateTransaction, reenrichTransactions }}>
      {children}
    </TransactionsContext.Provider>
  );
}

export function useTransactions() { return useContext(TransactionsContext); }
