import React, { useState, useEffect } from 'react';
import { useHistory } from '../context/HistoryContext';

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  import:          { label: 'Import',          color: 'badge-blue' },
  assign:          { label: 'Assigned',         color: 'badge-green' },
  reject:          { label: 'Rejected',         color: 'badge-red' },
  rule_added:      { label: 'Rule Added',        color: 'badge-blue' },
  rule_edited:     { label: 'Rule Edited',       color: 'badge-gray' },
  advise_uploaded: { label: 'Advise Uploaded',   color: 'badge-green' },
  login:           { label: 'Login',             color: 'badge-gray' },
  other:           { label: 'Other',             color: 'badge-gray' },
};

export function History() {
  const { entries, refresh } = useHistory();
  const [filterAction, setFilterAction] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Auto-refresh every 30 s while this page is open, and once on mount
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  const visible = entries.filter(e =>
    (!filterAction || e.action === filterAction) &&
    (!filterUser || e.user.toLowerCase().includes(filterUser.toLowerCase()))
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)} style={{ minWidth: 150 }}>
          <option value="">All Actions</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input placeholder="Filter by user..." value={filterUser} onChange={e => setFilterUser(e.target.value)} style={{ minWidth: 160 }} />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>{visible.length} entries</span>
        <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(e => {
                const meta = ACTION_LABELS[e.action] || ACTION_LABELS.other;
                return (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text2)' }}>
                      {new Date(e.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ fontWeight: 500 }}>{e.user}</td>
                    <td><span className={`badge ${meta.color}`}>{meta.label}</span></td>
                    <td style={{ color: 'var(--text2)', fontSize: 13 }}>{e.details}</td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>No history entries</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
