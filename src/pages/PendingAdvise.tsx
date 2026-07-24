import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTransactions } from '../context/TransactionsContext';
import { useAuth } from '../context/AuthContext';
import { formatCr, formatDate, daysPending } from '../utils/formatters';
import { KAMS, RHS } from '../data/customers';
import * as XLSX from 'xlsx';

export function PendingAdvise() {
  const { transactions, uploadAdvise, bulkUploadAdvise, updateTransaction } = useTransactions();
  const { user } = useAuth();

  const [uploadTx,      setUploadTx]      = useState<string | null>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [selected,      setSelected]      = useState<Set<string>>(new Set());
  const [editComment,   setEditComment]   = useState<Record<string, string>>({});
  const [savingComment, setSavingComment] = useState<string | null>(null);
  const [uploading,     setUploading]     = useState(false);

  const [fMonth,    setFMonth]    = useState('');
  const [fKAM,      setFKAM]      = useState('');
  const [fRH,       setFRH]       = useState('');
  const [fDate,     setFDate]     = useState('');
  const [fCustomer, setFCustomer] = useState('');
  const [fRef,      setFRef]      = useState('');

  const availableMonths = useMemo(() => {
    const set = new Set(transactions.filter(t => t.status === 'matched' && t.adviseStatus === 'pending').map(t => t.date.slice(0, 7)));
    return [...set].sort().reverse();
  }, [transactions]);

  const autoMonthRef = useRef(false);
  useEffect(() => {
    if (!autoMonthRef.current && availableMonths.length > 0) {
      autoMonthRef.current = true;
      setFMonth(availableMonths[0]);
    }
  }, [availableMonths]);

  const [showExportModal, setShowExportModal] = useState(false);
  const [expMonth,        setExpMonth]        = useState('');
  const [expCustSearch,   setExpCustSearch]   = useState('');
  const [expCustomer,     setExpCustomer]     = useState('');
  const [expCustOpen,     setExpCustOpen]     = useState(false);

  const monthLabel = (m: string) => {
    const [yr, mo] = m.split('-');
    return new Date(Number(yr), Number(mo) - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  };

  const allPending = useMemo(() => {
    let txs = transactions.filter(t => t.status === 'matched' && t.adviseStatus === 'pending');
    if (user?.role === 'kam') txs = txs.filter(t => t.kam === user.kamName);
    if (user?.role === 'rh' || user?.role === 'arpm')  txs = txs.filter(t => t.rh  === user.rhName);
    return txs.sort((a, b) => a.date.localeCompare(b.date));
  }, [transactions, user]);

  const allPendingCustomers = useMemo(() => {
    return [...new Set(allPending.map(t => t.customer))].sort();
  }, [allPending]);

  const filteredExpCusts = useMemo(() => {
    if (!expCustSearch) return allPendingCustomers;
    return allPendingCustomers.filter(c => c.toLowerCase().includes(expCustSearch.toLowerCase()));
  }, [allPendingCustomers, expCustSearch]);

  function handleExport() {
    let rows = allPending;
    if (expMonth)    rows = rows.filter(t => t.date.startsWith(expMonth));
    if (expCustomer) rows = rows.filter(t => t.customer === expCustomer);
    const data = rows.map(t => ({
      Date: t.date,
      Customer: t.customer,
      Bank: t.bank,
      'Amount (₹)': t.amount,
      'Ref No': t.refNo,
      Narration: t.narration,
      KAM: t.kam,
      RH: t.rh,
      'Days Pending': daysPending(t.date),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pending Advises');
    XLSX.writeFile(wb, `pending-advises${expMonth ? `-${expMonth}` : ''}.xlsx`);
    setShowExportModal(false);
  }

  const filtered = useMemo(() => {
    let txs = allPending;
    if (fMonth)    txs = txs.filter(t => t.date.startsWith(fMonth));
    if (fKAM)      txs = txs.filter(t => t.kam === fKAM);
    if (fRH)       txs = txs.filter(t => t.rh  === fRH);
    if (fDate)     txs = txs.filter(t => t.date === fDate);
    if (fCustomer) txs = txs.filter(t => t.customer.toLowerCase().includes(fCustomer.toLowerCase()));
    if (fRef)      txs = txs.filter(t => t.refNo.toLowerCase().includes(fRef.toLowerCase()));
    return txs;
  }, [allPending, fMonth, fKAM, fRH, fDate, fCustomer, fRef]);

  const allFilteredIds = filtered.map(t => t.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selected.has(id));

  function toggleAll() {
    if (allSelected) {
      setSelected(prev => { const n = new Set(prev); allFilteredIds.forEach(id => n.delete(id)); return n; });
    } else {
      setSelected(prev => new Set([...prev, ...allFilteredIds]));
    }
  }

  function toggleOne(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function handleUpload(txId: string, file: File) {
    const reader = new FileReader();
    reader.onload = async () => {
      setUploading(true);
      try { await uploadAdvise(txId, file.name, reader.result as string); } finally { setUploading(false); }
      setUploadTx(null);
    };
    reader.readAsDataURL(file);
  }

  function handleBulkUpload(file: File) {
    const ids = [...selected].filter(id => filtered.some(t => t.id === id));
    if (ids.length === 0) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setUploading(true);
      try { await bulkUploadAdvise(ids, file.name, reader.result as string); } finally { setUploading(false); }
      setSelected(new Set());
      setShowBulkModal(false);
    };
    reader.readAsDataURL(file);
  }

  function startEdit(txId: string) {
    const tx = transactions.find(t => t.id === txId);
    setEditComment(prev => ({ ...prev, [txId]: tx?.comment || '' }));
  }

  function saveComment(txId: string) {
    setSavingComment(txId);
    updateTransaction(txId, { comment: editComment[txId] });
    setTimeout(() => {
      setSavingComment(null);
      setEditComment(prev => { const n = { ...prev }; delete n[txId]; return n; });
    }, 500);
  }

  function getDaysColor(days: number) {
    if (days > 15) return 'var(--danger)';
    if (days > 7)  return 'var(--warning)';
    return 'var(--text)';
  }

  const overdue = allPending.filter(t => daysPending(t.date) > 15).length;
  const selectedCount = [...selected].filter(id => filtered.some(t => t.id === id)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {allPending.length > 0 && (
        <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 10, padding: '14px 18px', color: '#92400e', fontSize: 15, fontWeight: 600 }}>
          ⚠ {allPending.length} transaction{allPending.length > 1 ? 's have' : ' has'} no payment advise uploaded
          {overdue > 0 && (
            <span style={{ marginLeft: 14, color: 'var(--danger)', fontWeight: 800 }}>
              {overdue} overdue (&gt;15 days)
            </span>
          )}
        </div>
      )}

      {/* Filter Bar */}
      <div className="card" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, marginBottom: 10 }}>
          <div>
            <div className="filter-label">Month</div>
            <select value={fMonth} onChange={e => setFMonth(e.target.value)} style={{ width: '100%' }}>
              <option value="">All Months</option>
              {availableMonths.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </div>
          <div>
            <div className="filter-label">KAM</div>
            <select value={fKAM} onChange={e => setFKAM(e.target.value)} style={{ width: '100%' }}>
              <option value="">All KAMs</option>
              {KAMS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <div className="filter-label">Regional Head</div>
            <select value={fRH} onChange={e => setFRH(e.target.value)} style={{ width: '100%' }}>
              <option value="">All RH</option>
              {RHS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <div className="filter-label">Date</div>
            <input type="date" value={fDate} onChange={e => setFDate(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div>
            <div className="filter-label">Customer</div>
            <input placeholder="Search..." value={fCustomer} onChange={e => setFCustomer(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div>
            <div className="filter-label">Reference No.</div>
            <input placeholder="Ref No..." value={fRef} onChange={e => setFRef(e.target.value)} style={{ width: '100%' }} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 15, color: 'var(--text2)', fontWeight: 600 }}>
            Showing <strong style={{ color: 'var(--text)', fontSize: 16 }}>{filtered.length}</strong> of {allPending.length} pending
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {selectedCount > 0 && (
              <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => setShowBulkModal(true)}>
                📎 Upload Advise for Selected ({selectedCount})
              </button>
            )}
            <button className="btn btn-secondary" style={{ fontSize: 13 }}
              onClick={() => { setExpMonth(fMonth); setExpCustomer(''); setExpCustSearch(''); setShowExportModal(true); }}>
              <i className="ti ti-table-export" /> Export Excel
            </button>
            <button className="btn btn-secondary" style={{ fontSize: 13 }}
              onClick={() => { setFMonth(''); setFKAM(''); setFRH(''); setFDate(''); setFCustomer(''); setFRef(''); }}>
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text3)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>
              {allPending.length === 0 ? '✓' : '🔍'}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              {allPending.length === 0 ? 'All payment advises uploaded' : 'No results for selected filters'}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} title="Select all visible" />
                  </th>
                  <th>Customer</th>
                  <th>Ref No</th>
                  <th style={{ textAlign: 'right', minWidth: 160 }}>Amount</th>
                  <th>Date</th>
                  <th>Bank</th>
                  <th>KAM</th>
                  <th>Days Pending</th>
                  <th>Upload</th>
                  <th style={{ minWidth: 160 }}>Comment</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const days = daysPending(t.date);
                  const isEditing = t.id in editComment;
                  const isSaving  = savingComment === t.id;
                  return (
                    <tr key={t.id} style={{ background: selected.has(t.id) ? 'var(--brand-subtle, #f0f4ff)' : undefined }}>
                      <td>
                        <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleOne(t.id)} />
                      </td>
                      <td style={{ fontWeight: 600, fontSize: 14 }}>{t.customer}</td>
                      <td style={{ fontSize: 11, color: 'var(--text3)' }}>{t.refNo}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCr(t.amount)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(t.date)}</td>
                      <td>{t.bank}</td>
                      <td style={{ fontSize: 13 }}>{t.kam}</td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
                          <span style={{ fontWeight: 700, color: getDaysColor(days) }}>{days} days</span>
                          {days > 15 && <span className="badge badge-red">Overdue</span>}
                          {days > 7 && days <= 15 && <span className="badge badge-yellow">Due Soon</span>}
                        </div>
                      </td>
                      <td>
                        <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setUploadTx(t.id)}>
                          Upload
                        </button>
                      </td>
                      <td>
                        {isEditing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <textarea
                              value={editComment[t.id]}
                              onChange={e => setEditComment(prev => ({ ...prev, [t.id]: e.target.value }))}
                              rows={2}
                              style={{ width: '100%', minWidth: 220, resize: 'vertical', fontSize: 13 }}
                              placeholder="Add a comment..."
                            />
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-primary" style={{ padding: '3px 10px', fontSize: 12 }}
                                onClick={() => saveComment(t.id)} disabled={isSaving}>
                                {isSaving ? 'Saving…' : 'Save'}
                              </button>
                              <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 12 }}
                                onClick={() => setEditComment(prev => { const n = { ...prev }; delete n[t.id]; return n; })}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 5 }}>
                            <div style={{ fontSize: 13, color: t.comment ? 'var(--text)' : 'var(--text3)', fontStyle: t.comment ? 'normal' : 'italic' }}>
                              {t.comment || 'No comment'}
                            </div>
                            <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 11 }}
                              onClick={() => startEdit(t.id)}>
                              Edit
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Single Upload Modal */}
      {uploadTx && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setUploadTx(null); }}>
          <div className="card" style={{ padding: 28, width: 380 }}>
            {(() => {
              const tx = transactions.find(t => t.id === uploadTx);
              return (
                <>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Upload Payment Advise</h3>
                  {tx && <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>{tx.customer} · {formatCr(tx.amount)} · {formatDate(tx.date)}</p>}
                  <div style={{ border: '2px dashed var(--border)', borderRadius: 10, padding: 30, textAlign: 'center', background: 'var(--surface2)', marginBottom: 16 }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📎</div>
                    <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>Drag & drop or click to browse</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>PDF, PNG, JPG, CSV</div>
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg,.csv" style={{ marginTop: 12 }}
                      onChange={e => { if (e.target.files?.[0]) handleUpload(uploadTx, e.target.files[0]); }}
                      disabled={uploading}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary" onClick={() => setUploadTx(null)} disabled={uploading}>
                      {uploading ? 'Uploading…' : 'Cancel'}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowExportModal(false); }}>
          <div className="card" style={{ padding: 28, width: 420 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Export Pending Payment Advises</h3>

            <div style={{ marginBottom: 14 }}>
              <div className="filter-label" style={{ marginBottom: 4 }}>Month</div>
              <select value={expMonth} onChange={e => setExpMonth(e.target.value)} style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
                <option value="">All Months</option>
                {availableMonths.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 20, position: 'relative' }}>
              <div className="filter-label" style={{ marginBottom: 4 }}>Customer Name</div>
              <input
                value={expCustSearch || expCustomer}
                placeholder="Search or select customer..."
                onFocus={() => { setExpCustOpen(true); setExpCustSearch(expCustomer); setExpCustomer(''); }}
                onChange={e => { setExpCustSearch(e.target.value); setExpCustomer(''); setExpCustOpen(true); }}
                onBlur={() => setTimeout(() => setExpCustOpen(false), 150)}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }}
              />
              {expCustomer && <span style={{ position: 'absolute', right: 8, top: 30, fontSize: 11, color: 'var(--brand)', fontWeight: 700, cursor: 'pointer' }} onClick={() => { setExpCustomer(''); setExpCustSearch(''); }}>✕</span>}
              {expCustOpen && filteredExpCusts.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxHeight: 180, overflowY: 'auto', zIndex: 50 }}>
                  <div style={{ padding: '6px 10px', fontSize: 12, color: 'var(--text3)', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onMouseDown={() => { setExpCustomer(''); setExpCustSearch(''); setExpCustOpen(false); }}>
                    All Customers
                  </div>
                  {filteredExpCusts.map(c => (
                    <div key={c} style={{ padding: '7px 10px', fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}
                      onMouseDown={() => { setExpCustomer(c); setExpCustSearch(''); setExpCustOpen(false); }}>
                      {c}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
              {(() => {
                let rows = allPending;
                if (expMonth)    rows = rows.filter(t => t.date.startsWith(expMonth));
                if (expCustomer) rows = rows.filter(t => t.customer === expCustomer);
                return `${rows.length} row${rows.length !== 1 ? 's' : ''} will be exported`;
              })()}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowExportModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleExport}>Download Excel</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal */}
      {showBulkModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !uploading) setShowBulkModal(false); }}>
          <div className="card" style={{ padding: 28, width: 420 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Bulk Upload Payment Advise</h3>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
              This file will be applied to <strong>{selectedCount} selected transaction{selectedCount > 1 ? 's' : ''}</strong>.
            </p>
            <div style={{ border: '2px dashed var(--border)', borderRadius: 10, padding: 30, textAlign: 'center', background: 'var(--surface2)', marginBottom: 16 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📎</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>Select a single advise file to apply to all selected transactions</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>PDF, PNG, JPG, CSV</div>
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,.csv" style={{ marginTop: 12 }}
                onChange={e => { if (e.target.files?.[0]) handleBulkUpload(e.target.files[0]); }}
                disabled={uploading}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowBulkModal(false)} disabled={uploading}>
                {uploading ? 'Uploading…' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
