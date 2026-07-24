import React, { useState, useMemo } from 'react';
import { useRecycleBin, type BinItem, type BinItemType } from '../context/RecycleBinContext';
import { useTransactions } from '../context/TransactionsContext';
import { useRules } from '../context/RulesContext';
import { useCustomers } from '../context/CustomersContext';
import { useAuth } from '../context/AuthContext';
import { formatCr, formatDate } from '../utils/formatters';
import type { Transaction } from '../context/TransactionsContext';
import type { Rule, ExcludePattern } from '../data/rules';
import type { Customer } from '../data/customers';

const TYPE_LABELS: Record<BinItemType, string> = {
  transaction:     'Transaction',
  rule:            'Rule',
  exclude_pattern: 'Exclude Pattern',
  customer:        'Customer',
};

const TYPE_COLORS: Record<BinItemType, { bg: string; color: string }> = {
  transaction:     { bg: '#fee2e2', color: '#991b1b' },
  rule:            { bg: '#dbeafe', color: '#1e40af' },
  exclude_pattern: { bg: '#fef9c3', color: '#92400e' },
  customer:        { bg: '#d1fae5', color: '#065f46' },
};

function itemLabel(item: BinItem): string {
  switch (item.type) {
    case 'transaction': {
      const t = item.payload as Transaction;
      return `${t.customer || 'Unassigned'} — ${formatCr(t.amount)} — ${formatDate(t.date)}`;
    }
    case 'rule':            return (item.payload as Rule).customer;
    case 'exclude_pattern': return (item.payload as ExcludePattern).pattern;
    case 'customer':        return (item.payload as Customer).name;
  }
}

function itemMeta(item: BinItem): string {
  switch (item.type) {
    case 'transaction': {
      const t = item.payload as Transaction;
      return `${t.bank} · ${t.narration.slice(0, 60)}${t.narration.length > 60 ? '…' : ''}`;
    }
    case 'rule': {
      const r = item.payload as Rule;
      return `Keywords: ${r.keywords.join(', ')}${r.compoundRules?.length ? ` + ${r.compoundRules.length} compound rule(s)` : ''}`;
    }
    case 'exclude_pattern': return (item.payload as ExcludePattern).reason;
    case 'customer': {
      const c = item.payload as Customer;
      return `KAM: ${c.kam} · RH: ${c.rh}`;
    }
  }
}

const TABS: Array<{ key: BinItemType | 'all'; label: string }> = [
  { key: 'all',            label: 'All' },
  { key: 'transaction',    label: 'Transactions' },
  { key: 'rule',           label: 'Rules' },
  { key: 'exclude_pattern', label: 'Exclude Patterns' },
  { key: 'customer',       label: 'Customers' },
];

export function RecycleBin() {
  const { binItems, sendToRecycleBin: _send, removeFromBin, clearBin } = useRecycleBin();
  const { transactions, addTransactions, updateTransaction, reenrichTransactions } = useTransactions();
  const { addRule, addExcludePattern } = useRules();
  const { addCustomer, lookupKamRh } = useCustomers();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<BinItemType | 'all'>('all');
  const [confirmClear, setConfirmClear] = useState(false);

  const displayed = useMemo(() =>
    activeTab === 'all' ? binItems : binItems.filter(i => i.type === activeTab),
    [binItems, activeTab]
  );

  const counts: Record<BinItemType | 'all', number> = useMemo(() => ({
    all:             binItems.length,
    transaction:     binItems.filter(i => i.type === 'transaction').length,
    rule:            binItems.filter(i => i.type === 'rule').length,
    exclude_pattern: binItems.filter(i => i.type === 'exclude_pattern').length,
    customer:        binItems.filter(i => i.type === 'customer').length,
  }), [binItems]);

  function restore(item: BinItem) {
    switch (item.type) {
      case 'transaction': {
        const t = item.payload as Transaction;
        const existing = transactions.find(tx => tx.id === t.id);
        if (existing) {
          // Was rejected (excluded) — move back to manual_review
          updateTransaction(t.id, { status: 'manual_review', excludeReason: undefined });
        } else {
          // Was hard-deleted — re-add with original status
          addTransactions([t]);
        }
        break;
      }
      case 'rule': {
        const r = item.payload as Rule;
        addRule({ customer: r.customer, keywords: r.keywords, compoundRules: r.compoundRules, excludeKeywords: r.excludeKeywords, note: r.note, source: r.source });
        break;
      }
      case 'exclude_pattern': {
        const ep = item.payload as ExcludePattern;
        addExcludePattern(ep);
        break;
      }
      case 'customer': {
        const c = item.payload as Customer;
        addCustomer({ name: c.name, kam: c.kam, rh: c.rh, toPayFlag: c.toPayFlag, active: c.active });
        reenrichTransactions(lookupKamRh);
        break;
      }
    }
    removeFromBin(item.binId);
  }

  function permanentDelete(binId: string) {
    removeFromBin(binId);
  }

  function timeSince(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (days > 0)  return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (mins > 0)  return `${mins}m ago`;
    return 'just now';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 2 }}>
            {binItems.length} item{binItems.length !== 1 ? 's' : ''} in Recycle Bin
          </div>
        </div>
        {binItems.length > 0 && (
          <button className="btn btn-danger" style={{ fontSize: 12, padding: '5px 14px' }}
            onClick={() => setConfirmClear(true)}>
            Empty Recycle Bin
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', width: 'fit-content' }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '9px 18px', border: 'none',
              background: activeTab === tab.key ? 'var(--brand)' : 'var(--surface)',
              color: activeTab === tab.key ? '#fff' : 'var(--text2)',
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}>
            {tab.label}
            {counts[tab.key] > 0 && (
              <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.85 }}>({counts[tab.key]})</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {binItems.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text3)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗑</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Recycle Bin is empty</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Deleted transactions, rules, patterns and customers will appear here</div>
          </div>
        ) : displayed.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
            <div style={{ fontSize: 13 }}>No {TYPE_LABELS[activeTab as BinItemType]} items in bin</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Type</th>
                  <th>Item</th>
                  <th>Details</th>
                  <th>Reason</th>
                  <th>Deleted By</th>
                  <th>When</th>
                  <th style={{ minWidth: 160 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(item => {
                  const col = TYPE_COLORS[item.type];
                  return (
                    <tr key={item.binId}>
                      <td>
                        <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700, background: col.bg, color: col.color }}>
                          {TYPE_LABELS[item.type]}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, fontSize: 13, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {itemLabel(item)}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text2)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {itemMeta(item)}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text3)' }}>{item.reason || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text2)' }}>{item.deletedBy}</td>
                      <td style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{timeSince(item.deletedAt)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-primary" style={{ padding: '3px 10px', fontSize: 11 }}
                            onClick={() => restore(item)}>
                            Restore
                          </button>
                          <button className="btn btn-danger" style={{ padding: '3px 8px', fontSize: 11 }}
                            onClick={() => permanentDelete(item.binId)}>
                            Delete Forever
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirm Empty Modal */}
      {confirmClear && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setConfirmClear(false); }}>
          <div className="card" style={{ padding: 28, width: 400 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: 'var(--danger, #dc2626)' }}>Empty Recycle Bin?</h3>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.6 }}>
              This will permanently delete all {binItems.length} item{binItems.length !== 1 ? 's' : ''} in the bin. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmClear(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => { clearBin(); setConfirmClear(false); }}>Yes, Empty All</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
