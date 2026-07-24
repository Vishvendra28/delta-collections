import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useTransactions } from '../context/TransactionsContext';
import { useRules } from '../context/RulesContext';
import { useAuth } from '../context/AuthContext';
import { useCustomers } from '../context/CustomersContext';
import { useRecycleBin } from '../context/RecycleBinContext';
import { formatCr, formatDate } from '../utils/formatters';
import * as XLSX from 'xlsx';

const REJECT_REASONS = ['Internal Transfer', 'Bank Charges', 'Duplicate', 'Not a Collection', 'Other'];

// ── Searchable customer dropdown ───────────────────────────────────────────────
function CustomerSearch({
  value,
  onChange,
  customers,
}: {
  value: string;
  onChange: (name: string) => void;
  customers: Array<{ id: string; name: string }>;
}) {
  const [query, setQuery]   = useState('');
  const [open, setOpen]     = useState(false);
  const wrapRef             = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const options = useMemo(() =>
    customers.filter(c => c.name.toLowerCase().includes(query.toLowerCase())),
    [customers, query]
  );

  function select(name: string) {
    onChange(name);
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', minWidth: 200 }}>
      <input
        value={open ? query : value || ''}
        placeholder={value || 'Search customer…'}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setQuery(''); setOpen(true); }}
        style={{ width: '100%', fontSize: 12 }}
      />
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          maxHeight: 220, overflowY: 'auto', marginTop: 2,
        }}>
          {options.length === 0
            ? <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text3)' }}>No match</div>
            : options.map(c => (
              <div key={c.id} onMouseDown={() => select(c.name)}
                style={{ padding: '8px 14px', fontSize: 12, cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                {c.name}
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function ManualReview() {
  const { transactions, assignTransaction, bulkAssign, rejectTransaction } = useTransactions();
  const { addRule, addExcludePattern } = useRules();
  const { user } = useAuth();
  const { customers } = useCustomers();
  const { sendToRecycleBin } = useRecycleBin();

  const [assignMap,      setAssignMap]      = useState<Record<string, string>>({});
  const [rejectMap,      setRejectMap]      = useState<Record<string, string>>({});
  const [saveRuleId,     setSaveRuleId]     = useState<string | null>(null);
  const [ruleKeyword,    setRuleKeyword]    = useState('');
  const [excludeRejectId, setExcludeRejectId] = useState<string | null>(null);
  const [excludeKeyword, setExcludeKeyword] = useState('');
  const [bulkCount,      setBulkCount]      = useState(0);

  const [showRejectAll,      setShowRejectAll]      = useState(false);
  const [rejectAllReason,    setRejectAllReason]    = useState('');
  const [rejectAllKeyword,   setRejectAllKeyword]   = useState('');
  const [rejectAllAddExclude, setRejectAllAddExclude] = useState(false);

  const [fMonth,    setFMonth]    = useState('');
  const [fBank,     setFBank]     = useState('');
  const [fCompany,  setFCompany]  = useState('');
  const [fDate,     setFDate]     = useState('');
  const [fCustomer, setFCustomer] = useState('');

  const [showCount,    setShowCount]    = useState(60);
  const sentinelRef = useRef<HTMLTableRowElement>(null);
  const [showExport,   setShowExport]   = useState(false);
  const [expMonth,     setExpMonth]     = useState('');
  const [expBank,      setExpBank]      = useState('');
  const [expCompany,   setExpCompany]   = useState('');
  const [expFull,      setExpFull]      = useState(true);
  const [expFrom,      setExpFrom]      = useState('');
  const [expTo,        setExpTo]        = useState('');

  // Active customers for the dropdown — all active customers, including ToPay flagged ones
  const activeCustomers = useMemo(
    () => customers.filter(c => c.active),
    [customers]
  );

  let pending = transactions.filter(t => t.status === 'manual_review');
  if (user?.role === 'kam') pending = pending.filter(t => t.kam === user.kamName || !t.kam);
  if (user?.role === 'rh' || user?.role === 'arpm')  pending = pending.filter(t => t.rh  === user.rhName  || !t.rh);

  const availableMonths = useMemo(() => {
    const set = new Set(pending.map(t => t.date.slice(0, 7)));
    return [...set].sort().reverse();
  }, [transactions]);

  const availableCompanies = useMemo(() => {
    const set = new Set(pending.map(t => t.company));
    return [...set].sort();
  }, [transactions]);

  const availableBanks = useMemo(() => {
    const set = new Set(pending.map(t => t.bank).filter(Boolean));
    return [...set].sort();
  }, [transactions]);

  const expAvailableMonths = useMemo(() => {
    const set = new Set(pending.map(t => t.date.slice(0, 7)));
    return [...set].sort().reverse();
  }, [transactions]);

  const handleExport = useCallback(() => {
    let txs = [...pending];
    if (expMonth)   txs = txs.filter(t => t.date.startsWith(expMonth));
    if (!expFull) {
      if (expFrom) txs = txs.filter(t => t.date >= expFrom);
      if (expTo)   txs = txs.filter(t => t.date <= expTo);
    }
    if (expBank)    txs = txs.filter(t => t.bank === expBank);
    if (expCompany) txs = txs.filter(t => t.company === expCompany);
    const rows = txs.map(t => ({
      Date: t.date, Customer: '', Bank: t.bank,
      Account: t.account, Company: t.company, 'Amount (₹)': t.amount,
      'Ref No': t.refNo, Narration: t.narration, KAM: t.kam || '', 'Regional Head': t.rh || '',
      'Fuzzy Hint': t.fuzzyHint || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Manual Review');
    const parts = ['Delta_ManualReview', expMonth || 'All', expBank, expCompany].filter(Boolean);
    XLSX.writeFile(wb, `${parts.join('_')}.xlsx`);
    setShowExport(false);
  }, [pending, expMonth, expFull, expFrom, expTo, expBank, expCompany]);

  function closeExport() {
    setShowExport(false); setExpMonth(''); setExpBank(''); setExpCompany(''); setExpFull(true); setExpFrom(''); setExpTo('');
  }

  const monthLabel = (m: string) => {
    const [yr, mo] = m.split('-');
    return new Date(Number(yr), Number(mo) - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  };

  // Reset visible count when filters change
  useEffect(() => { setShowCount(60); }, [fMonth, fBank, fCompany, fDate, fCustomer]);

  // Intersection observer — load 60 more rows when sentinel enters view
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) setShowCount(n => n + 60);
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  });

  const filtered = useMemo(() => {
    let txs = pending;
    if (fMonth)    txs = txs.filter(t => t.date.startsWith(fMonth));
    if (fBank)     txs = txs.filter(t => t.bank === fBank);
    if (fCompany)  txs = txs.filter(t => t.company === fCompany);
    if (fDate)     txs = txs.filter(t => t.date === fDate);
    if (fCustomer) {
      const q = fCustomer.toLowerCase();
      txs = txs.filter(t =>
        t.narration.toLowerCase().includes(q) ||
        (t.fuzzyHint || '').toLowerCase().includes(q)
      );
    }
    return txs;
  }, [pending, fMonth, fBank, fCompany, fDate, fCustomer]);

  // Resolve KAM/RH from live customer master
  function resolveCustomer(name: string) {
    return customers.find(c => c.name.toLowerCase() === name.toLowerCase());
  }

  function getSelectedCustomer(txId: string, fuzzyHint?: string) {
    return assignMap[txId] !== undefined ? assignMap[txId] : (fuzzyHint || '');
  }

  function doAssign(txId: string, customerName: string) {
    const c = resolveCustomer(customerName);
    assignTransaction(txId, customerName, c?.kam || '', c?.rh || '');
  }

  // Find other pending transactions matching any of the given keywords
  function findSimilar(excludeId: string, keywords: string[]): string[] {
    const kws = keywords.map(k => k.toUpperCase());
    return transactions
      .filter(t => t.status === 'manual_review' && t.id !== excludeId)
      .filter(t => {
        const n = t.narration.toUpperCase().replace(/\s+/g, '');
        const nSpaced = t.narration.toUpperCase();
        return kws.some(k => n.includes(k.replace(/\s+/g, '')) || nSpaced.includes(k));
      })
      .map(t => t.id);
  }

  function suggestKeyword(narration: string): string {
    const noise = /\b(NEFT|RTGS|IMPS|UPI|CR|DR|REF|NO|TXN|TRANSFER|BY|TO|FROM|ON|AT|OF|AND|THE|FOR)\b/gi;
    const refPattern = /\b[A-Z0-9]{10,}\b/g;
    const cleaned = narration
      .replace(/[\/\-_|]/g, ' ')
      .replace(refPattern, '')
      .replace(noise, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .toUpperCase();
    return cleaned.split(' ').filter(w => w.length > 3).slice(0, 3).join(' ');
  }

  function doReject(txId: string) {
    const tx = transactions.find(t => t.id === txId);
    setExcludeKeyword(tx ? suggestKeyword(tx.narration) : '');
    setExcludeRejectId(txId);
  }

  function confirmReject(addExclude: boolean) {
    if (!excludeRejectId) return;
    const reason = rejectMap[excludeRejectId] || 'Not a Collection';
    const tx = transactions.find(t => t.id === excludeRejectId);
    if (tx) sendToRecycleBin('transaction', tx, user?.name || 'User', reason);
    if (addExclude && excludeKeyword.trim()) {
      addExcludePattern({ pattern: excludeKeyword.trim(), reason });
    }
    rejectTransaction(excludeRejectId, reason);
    setExcludeRejectId(null);
    setExcludeKeyword('');
  }

  // Open the Save Rule modal — pre-compute how many similar transactions will be bulk-assigned
  function openSaveRule(txId: string) {
    const customerName = getSelectedCustomer(txId, transactions.find(t => t.id === txId)?.fuzzyHint);
    if (!customerName) return;
    setSaveRuleId(txId);
    setRuleKeyword('');
    setBulkCount(0);
  }

  // Called as the user types keywords — live preview of how many will be auto-assigned
  function onKeywordChange(val: string) {
    setRuleKeyword(val);
    if (!saveRuleId) return;
    const kws = val.split(',').map(k => k.trim().toUpperCase()).filter(Boolean);
    setBulkCount(kws.length ? findSimilar(saveRuleId, kws).length : 0);
  }

  function saveRule(txId: string) {
    const customerName = getSelectedCustomer(txId, transactions.find(t => t.id === txId)?.fuzzyHint);
    if (!customerName || !ruleKeyword.trim()) return;
    const keywords = ruleKeyword.split(',').map(k => k.trim().toUpperCase()).filter(Boolean);

    // Save rule to Rule Manager
    addRule({ customer: customerName, keywords, source: 'manual' });

    // Assign this transaction + all similar ones in one update
    const similarIds = findSimilar(txId, keywords);
    const c = resolveCustomer(customerName);
    bulkAssign([txId, ...similarIds], customerName, c?.kam || '', c?.rh || '');

    setSaveRuleId(null);
    setRuleKeyword('');
    setBulkCount(0);
  }

  function openRejectAll() {
    setRejectAllReason('');
    setRejectAllKeyword('');
    setRejectAllAddExclude(false);
    setShowRejectAll(true);
  }

  function confirmRejectAll() {
    const reason = rejectAllReason || 'Not a Collection';
    filtered.forEach(tx => {
      sendToRecycleBin('transaction', tx, user?.name || 'User', reason);
      rejectTransaction(tx.id, reason);
    });
    if (rejectAllAddExclude && rejectAllKeyword.trim()) {
      addExcludePattern({ pattern: rejectAllKeyword.trim(), reason });
    }
    setShowRejectAll(false);
  }

  function skipRuleSaveAndAssign(txId: string) {
    const customerName = getSelectedCustomer(txId, transactions.find(t => t.id === txId)?.fuzzyHint);
    if (!customerName) return;
    doAssign(txId, customerName);
    setSaveRuleId(null);
    setRuleKeyword('');
    setBulkCount(0);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {pending.length > 0 && (
        <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 10, padding: '14px 18px', color: '#92400e', fontSize: 15, fontWeight: 600 }}>
          ⚠ {pending.length} transaction{pending.length > 1 ? 's are' : ' is'} unassigned and waiting for review
        </div>
      )}

      {/* Filter Bar */}
      <div className="card" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 10 }}>
          <div>
            <div className="filter-label">Month</div>
            <select value={fMonth} onChange={e => setFMonth(e.target.value)} style={{ width: '100%' }}>
              <option value="">All Months</option>
              {availableMonths.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </div>
          <div>
            <div className="filter-label">Bank</div>
            <select value={fBank} onChange={e => setFBank(e.target.value)} style={{ width: '100%' }}>
              <option value="">All Banks</option>
              {availableBanks.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <div className="filter-label">Company</div>
            <select value={fCompany} onChange={e => setFCompany(e.target.value)} style={{ width: '100%' }}>
              <option value="">All Companies</option>
              {availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div className="filter-label">Date</div>
            <input type="date" value={fDate} onChange={e => setFDate(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div>
            <div className="filter-label">Customer / Narration</div>
            <input
              type="text"
              value={fCustomer}
              onChange={e => setFCustomer(e.target.value)}
              placeholder="Search..."
              style={{ width: '100%' }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, color: 'var(--text2)', fontWeight: 600 }}>
            Showing <strong style={{ color: 'var(--text)', fontSize: 16 }}>{filtered.length}</strong> of {pending.length} pending
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" style={{ fontSize: 13 }}
              onClick={() => { setFMonth(''); setFBank(''); setFCompany(''); setFDate(''); setFCustomer(''); }}>
              Clear Filters
            </button>
            <button className="btn btn-danger" style={{ fontSize: 13 }} onClick={openRejectAll} disabled={filtered.length === 0}>
              Reject All ({filtered.length})
            </button>
            <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => setShowExport(true)}>
              ⬇ Export Excel
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {pending.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text3)' }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>All transactions reviewed</div>
            <div style={{ fontSize: 14, marginTop: 8 }}>No unassigned transactions</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🔍</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>No results for selected filters</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Bank</th>
                  <th>Company</th>
                  <th>Narration</th>
                  <th>Ref No</th>
                  <th style={{ minWidth: 220 }}>Assign Customer</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, showCount).map(t => {
                  const selected = getSelectedCustomer(t.id, t.fuzzyHint);
                  return (
                    <tr key={t.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(t.date)}</td>
                      <td style={{ fontWeight: 600 }}>{formatCr(t.amount)}</td>
                      <td>{t.bank}</td>
                      <td><span className="badge badge-gray">{t.company}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--text2)', minWidth: 260, maxWidth: 400, wordBreak: 'break-word', lineHeight: 1.5 }}>
                        {t.narration}
                        {t.fuzzyHint && (
                          <div style={{ marginTop: 4, fontSize: 11, color: '#a16207', fontWeight: 600, background: '#fef9c3', borderRadius: 4, padding: '2px 6px', display: 'inline-block' }}>
                            Possible: {t.fuzzyHint}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text3)' }}>{t.refNo}</td>
                      <td>
                        <CustomerSearch
                          value={selected}
                          onChange={name => setAssignMap(m => ({ ...m, [t.id]: name }))}
                          customers={activeCustomers}
                        />
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-primary"
                            style={{ padding: '4px 10px', fontSize: 12 }}
                            disabled={!selected}
                            onClick={() => openSaveRule(t.id)}
                          >
                            Assign
                          </button>
                          <select
                            value={rejectMap[t.id] || ''}
                            onChange={e => setRejectMap(m => ({ ...m, [t.id]: e.target.value }))}
                            style={{ fontSize: 12 }}
                          >
                            <option value="">Reject…</option>
                            {REJECT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                          {rejectMap[t.id] && (
                            <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => doReject(t.id)}>
                              Confirm Reject
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {showCount < filtered.length && (
                  <tr ref={sentinelRef}>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text3)', fontSize: 13 }}>
                      Showing {showCount} of {filtered.length} — scroll down to load more
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Exclude Pattern Modal */}
      {excludeRejectId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={e => { if (e.target === e.currentTarget) { setExcludeRejectId(null); setExcludeKeyword(''); } }}>
          <div className="card" style={{ padding: 28, width: 420, position: 'relative' }}>
            <button onClick={() => { setExcludeRejectId(null); setExcludeKeyword(''); }} title="Cancel"
              style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)', lineHeight: 1, padding: 4 }}>✕</button>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Add to Exclude List?</h3>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
              Future transactions matching this keyword will be auto-ignored and never appear in Manual Review.
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>KEYWORD — edit if needed</label>
              <input value={excludeKeyword} onChange={e => setExcludeKeyword(e.target.value)} placeholder="e.g. BANK CHARGES" style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => { setExcludeRejectId(null); setExcludeKeyword(''); }}>Cancel</button>
              <button className="btn btn-secondary" onClick={() => confirmReject(false)}>Skip — Just Reject</button>
              <button className="btn btn-danger" disabled={!excludeKeyword.trim()} onClick={() => confirmReject(true)}>Save & Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* Reject All Modal */}
      {showRejectAll && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={e => { if (e.target === e.currentTarget) setShowRejectAll(false); }}>
          <div className="card" style={{ padding: 28, width: 460, position: 'relative' }}>
            <button onClick={() => setShowRejectAll(false)} title="Cancel"
              style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)', lineHeight: 1, padding: 4 }}>✕</button>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Reject All Transactions?</h3>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18 }}>
              This will reject <strong style={{ color: 'var(--danger)' }}>{filtered.length} transaction{filtered.length !== 1 ? 's' : ''}</strong> currently shown in the table (based on active filters). They will be moved to the Recycle Bin.
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>REJECT REASON</label>
              <select value={rejectAllReason} onChange={e => setRejectAllReason(e.target.value)} style={{ width: '100%' }}>
                <option value="">Select reason…</option>
                {REJECT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 16, padding: '14px 16px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                <input type="checkbox" checked={rejectAllAddExclude} onChange={e => setRejectAllAddExclude(e.target.checked)} />
                Also add keyword to Exclude List
              </label>
              {rejectAllAddExclude && (
                <div style={{ marginTop: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>KEYWORD — future matches will be auto-ignored</label>
                  <input
                    value={rejectAllKeyword}
                    onChange={e => setRejectAllKeyword(e.target.value)}
                    placeholder="e.g. BANK CHARGES"
                    style={{ width: '100%' }}
                    autoFocus
                  />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowRejectAll(false)}>Cancel</button>
              <button
                className="btn btn-danger"
                disabled={!rejectAllReason || (rejectAllAddExclude && !rejectAllKeyword.trim())}
                onClick={confirmRejectAll}
              >
                Reject All {filtered.length} Transactions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExport && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) closeExport(); }}>
          <div className="card" style={{ padding: 30, width: 460, position: 'relative' }}>
            <button onClick={closeExport} title="Close"
              style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)', lineHeight: 1, padding: 4 }}>✕</button>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Export Manual Review to Excel</h3>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>Exports only unassigned (Manual Review) transactions matching the selected filters.</p>

            <div style={{ marginBottom: 16 }}>
              <div className="filter-label">Month</div>
              <select value={expMonth} onChange={e => setExpMonth(e.target.value)} style={{ width: '100%' }}>
                <option value="">All Months</option>
                {expAvailableMonths.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <div className="filter-label">Bank Account</div>
                <select value={expBank} onChange={e => setExpBank(e.target.value)} style={{ width: '100%' }}>
                  <option value="">All Banks</option>
                  {availableBanks.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <div className="filter-label">Company</div>
                <select value={expCompany} onChange={e => setExpCompany(e.target.value)} style={{ width: '100%' }}>
                  <option value="">All Companies</option>
                  {availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div className="filter-label" style={{ marginBottom: 10 }}>Date Range</div>
              <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, cursor: 'pointer', fontWeight: expFull ? 700 : 400 }}>
                  <input type="radio" checked={expFull} onChange={() => setExpFull(true)} /> Full Month
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, cursor: 'pointer', fontWeight: !expFull ? 700 : 400 }}>
                  <input type="radio" checked={!expFull} onChange={() => setExpFull(false)} /> Custom Range
                </label>
              </div>
              {!expFull && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <div className="filter-label">From</div>
                    <input type="date" value={expFrom} onChange={e => setExpFrom(e.target.value)} style={{ width: '100%' }} />
                  </div>
                  <div>
                    <div className="filter-label">To</div>
                    <input type="date" value={expTo} onChange={e => setExpTo(e.target.value)} style={{ width: '100%' }} />
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={closeExport}>Cancel</button>
              <button className="btn btn-primary" onClick={handleExport}>⬇ Download Excel</button>
            </div>
          </div>
        </div>
      )}

      {/* Save Rule & Assign Modal */}
      {saveRuleId && (() => {
        const tx = transactions.find(t => t.id === saveRuleId);
        const customerName = getSelectedCustomer(saveRuleId, tx?.fuzzyHint);
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
            onClick={e => { if (e.target === e.currentTarget) { setSaveRuleId(null); setRuleKeyword(''); setBulkCount(0); } }}>
            <div className="card" style={{ padding: 28, width: 460, position: 'relative' }}>
              <button onClick={() => { setSaveRuleId(null); setRuleKeyword(''); setBulkCount(0); }} title="Cancel"
                style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)', lineHeight: 1, padding: 4 }}>✕</button>
              <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Save as Rule?</h3>
              <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
                Add keywords so future transactions like this are matched automatically to <strong>{customerName}</strong>.<br />
                The rule will appear in Rule Manager immediately.
              </p>
              {tx && (
                <div style={{ marginBottom: 14, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 7, fontSize: 12, color: 'var(--text2)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {tx.narration}
                </div>
              )}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>KEYWORD(S) — comma separated</label>
                <input
                  value={ruleKeyword}
                  onChange={e => onKeywordChange(e.target.value)}
                  placeholder="e.g. BALAJI ACTION, BALAJIACTION"
                  style={{ width: '100%' }}
                  autoFocus
                />
                {bulkCount > 0 && (
                  <div style={{ marginTop: 6, fontSize: 12, color: '#15803d', fontWeight: 600 }}>
                    ✓ {bulkCount} other transaction{bulkCount > 1 ? 's' : ''} in Manual Review also match — will be auto-assigned
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => { setSaveRuleId(null); setRuleKeyword(''); setBulkCount(0); }}>Cancel</button>
                <button className="btn btn-secondary" onClick={() => skipRuleSaveAndAssign(saveRuleId)}>Skip — Just Assign</button>
                <button className="btn btn-primary" disabled={!ruleKeyword.trim()} onClick={() => saveRule(saveRuleId)}>Save Rule & Assign</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
