import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiHistory } from '../api';

export interface HistoryEntry {
  id: string;
  timestamp: string;
  user: string;
  action: 'import' | 'assign' | 'reject' | 'rule_added' | 'rule_edited' | 'advise_uploaded' | 'login' | 'other';
  details: string;
}

interface HistoryCtx {
  entries: HistoryEntry[];
  refresh: () => Promise<void>;
}

const HistoryContext = createContext<HistoryCtx>({} as HistoryCtx);

function dbToEntry(row: { id: string; timestamp: string; user_name: string; action: string; details: string }): HistoryEntry {
  return { id: row.id, timestamp: row.timestamp, user: row.user_name, action: row.action as HistoryEntry['action'], details: row.details };
}

export function HistoryProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  async function refresh() {
    const rows = await apiHistory.getAll();
    setEntries(rows.map(dbToEntry));
  }

  useEffect(() => { refresh(); }, []);

  return (
    <HistoryContext.Provider value={{ entries, refresh }}>
      {children}
    </HistoryContext.Provider>
  );
}

export function useHistory() { return useContext(HistoryContext); }
