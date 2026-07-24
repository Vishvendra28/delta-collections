import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTransactions } from '../context/TransactionsContext';
import { useAuth } from '../context/AuthContext';
import { useRecycleBin } from '../context/RecycleBinContext';
import { useCustomers } from '../context/CustomersContext';
import { KAMS } from '../data/customers';
import { formatCr, formatDate, sumExact } from '../utils/formatters';
import { VirtualTable } from '../components/VirtualTable';
import { apiAdviseFiles } from '../api';
import type { Page } from '../App';

interface Props { onNavigate: (p: Page) => void; }

const BANKS = ['HDFC', 'Axis', 'Kotak', 'Kotak Escrow', 'ICICI'];
const COMPANIES = ['Zast', 'Transin'];

function fmtMonth(m: string): string {
  const [yr, mo] = m.split('-');
  return new Date(Number(yr), Number(mo) - 1).toLocaleString('en-IN', { month: 'long' }) + yr.slice(2);
}

export function Transactions({ onNavigate: _onNavigate }: Props) {
  const { transactions, uploadAdvise, deleteTransaction, reassignTransaction, updateTransaction, addTransactions } = useTransactions();
  const { user } = useAuth();
  const { sendToRecycleBin } = useRecycleBin();
  const { customers } = useCustomers();

  const [filterMonth,    setFilterMonth]    = useState('');
  const [filterKAM,      setFilterKAM]      = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');

  // Pre-fill search term when arriving from global search in Topbar
  useEffect(() => {
    const term = localStorage.getItem('delta_tx_search');
    if (term) { setFilterCustomer(term); localStorage.removeItem('delta_tx_search'); }
  }, []);
  const [filterBank,     setFilterBank]     = useState('');
  const [filterCompany,  setFilterCompany]  = useState('');
  const [filterStatus,   setFilterStatus]   = useState('');
  const [filterRef,      setFilterRef]      = useState('');
  const [uploadTxId,     setUploadTxId]     = useState<string | null>(null);
  const [viewAdviseTx,   setViewAdviseTx]   = useState<string | null>(null);
  const [viewAdviseData, setViewAdviseData] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [reassignTxId,   setReassignTxId]   = useState<string | null>(null);
  const [reassignCustomer, setReassignCustomer] = useState('');

  const [showAddModal,  setShowAddModal]  = useState(false);
  const [newDate,       setNewDate]       = useState('');
  const [newAmount,     setNewAmount]     = useState('');
  const [newNarration,  setNewNarration]  = useState('');
  const [newRefNo,      setNewRefNo]      = useState('');
  const [newBank,       setNewBank]       = useState('');
  const [newAccount,    setNewAccount]    = useState('');
  const [newCompany,    setNewCompany]    = useState('');
  const [newCustomer,   setNewCustomer]   = useState('');

  // Dynamic month list from actual data
  const availableMonths = useMemo(() => {
    const set = new Set(transactions.map(t => t.date.slice(0, 7)));
    return [...set].sort().reverse();
  }, [transactions]);

  const autoMonthRef = useRef(false);
  useEffect(() => {
    if (!autoMonthRef.current && availableMonths.length > 0) {
      autoMonthRef.current = true;
      setFilterMonth(availableMonths[0]);
    }
  }, [availableMonths]);

  const visible = useMemo(() => {
    let txs = transactions.filter(t => t.status !== 'excluded');
    if (user?.role === 'kam') txs = txs.filter(t => t.kam === user.kamName);
    if (user?.role === 'rh' || user?.role === 'arpm')  txs = txs.filter(t => t.rh  === user.rhName);
    if (filterMonth)    txs = txs.filter(t => t.date.startsWith(filterMonth));
    if (filterKAM)      txs = txs.filter(t => t.kam === filterKAM);
    if (filterCompany)  txs = txs.filter(t => t.company === filterCompany);
    if (filterCustomer) txs = txs.filter(t => t.customer.toLowerCase().includes(filterCustomer.toLowerCase()));
    if (filterBank)     txs = txs.filter(t => t.bank === filterBank);
    if (filterStatus)   txs = txs.filter(t => t.status === filterStatus);
    if (filterRef)      txs = txs.filter(t => t.refNo.toLowerCase().includes(filterRef.toLowerCase()));
    return txs.sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, user, filterMonth, filterKAM, filterCompany, filterCustomer, filterBank, filterStatus, filterRef]);

  const total = sumExact(visible.filter(t => t.status === 'matched').map(t => t.amount));

  function handleUpload(txId: string, file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      uploadAdvise(txId, file.name, reader.result as string);
      setUploadTxId(null);
    };
    reader.readAsDataURL(file);
  }

  function handleDelete(id: string) {
    const tx = transactions.find(t => t.id === id);
    if (tx) sendToRecycleBin('transaction', tx, user?.name || 'User', 'Manually deleted');
    deleteTransaction(id);
    setConfirmDeleteId(null);
  }

  const uploadTx     = uploadTxId     ? transactions.find(t => t.id === uploadTxId)     : null;
  const deleteTx     = confirmDeleteId ? transactions.find(t => t.id === confirmDeleteId) : null;
  const reassignTx   = reassignTxId   ? transactions.find(t => t.id === reassignTxId)   : null;

  function handleViewAdvise(txId: string) {
    setViewAdviseTx(txId);
    setViewAdviseData(null);
    apiAdviseFiles.get(txId).then(f => setViewAdviseData(f.file_data)).catch(() => setViewAdviseData(''));
  }

  function handleAddTransaction() {
    if (!newDate || !newAmount || !newBank || !newCompany) return;
    const cust = customers.find(c => c.name.toLowerCase() === newCustomer.trim().toLowerCase());
    const tx = {
      id: `MANUAL-${Date.now()}`,
      date: newDate,
      customer: newCustomer.trim(),
      bank: newBank,
      account: newAccount.trim(),
      company: newCompany,
      amount: parseFloat(newAmount),
      refNo: newRefNo.trim(),
      narration: newNarration.trim(),
      kam: cust?.kam || '',
      rh: cust?.rh || '',
      status: (cust ? 'matched' : 'manual_review') as 'matched' | 'manual_review',
      adviseStatus: 'pending' as 'pending',
      createdAt: new Date().toISOString(),
    };
    addTransactions([tx]);
    setShowAddModal(false);
    setNewDate(''); setNewAmount(''); setNewNarration(''); setNewRefNo('');
    setNewBank(''); setNewAccount(''); setNewCompany(''); setNewCustomer('');
  }

  function handleReassign() {
    if (!reassignTxId || !reassignCustomer) return;
    const cust = customers.find(c => c.name === reassignCustomer);
    reassignTransaction(reassignTxId, reassignCustomer, cust?.kam || '', cust?.rh || '');
    setReassignTxId(null);
    setReassignCustomer('');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Filters */}
      <div className="card" style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>MONTH</div>
            <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={{ minWidth: 130 }}>
              <option value="">All Months</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>{fmtMonth(m)}</option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>COMPANY</div>
            <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} style={{ minWidth: 110 }}>
              <option value="">All</option>
              <option value="Zast">Zast</option>
              <option value="Transin">Transin</option>
            </select>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>BANK</div>
            <select value={filterBank} onChange={e => setFilterBank(e.target.value)} style={{ minWidth: 110 }}>
              <option value="">All Banks</option>
              {['HDFC', 'Axis', 'Kotak', 'Kotak Escrow', 'ICICI'].map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>STATUS</div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ minWidth: 130 }}>
              <option value="">All</option>
              <option value="matched">Matched</option>
              <option value="manual_review">Manual Review</option>
              <option value="duplicate">Duplicate</option>
            </select>
          </div>

          {user?.role === 'admin' && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>KAM</div>
              <select value={filterKAM} onChange={e => setFilterKAM(e.target.value)} style={{ minWidth: 110 }}>
                <option value="">All KAMs</option>
                {KAMS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          )}

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>CUSTOMER</div>
            <input placeholder="Search..." value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)} style={{ minWidth: 150 }} />
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>REF NO.</div>
            <input placeholder="Ref No..." value={filterRef} onChange={e => setFilterRef(e.target.value)} style={{ minWidth: 120 }} />
          </div>

          <button
            className="btn btn-secondary"
            style={{ alignSelf: 'flex-end', padding: '6px 14px', fontSize: 12 }}
            onClick={() => {
              setFilterMonth(''); setFilterKAM(''); setFilterCompany('');
              setFilterCustomer(''); setFilterBank(''); setFilterStatus(''); setFilterRef('');
            }}
          >
            Clear
          </button>

          <span style={{ flex: 1 }} />
          <button
            className="btn btn-primary"
            style={{ alignSelf: 'flex-end', padding: '6px 14px', fontSize: 12 }}
            onClick={() => { setShowAddModal(true); setNewDate(new Date().toISOString().slice(0, 10)); }}
          >
            + Add Transaction
          </button>
          <div style={{ alignSelf: 'center', textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--brand)' }}>{formatCr(total)}</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500, marginTop: 2 }}>{visible.length} transactions</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <VirtualTable
          rows={visible}
          style={{ height: 'calc(100vh - 220px)' }}
          emptyMessage="No transactions match the selected filters"
          headers={
            <tr>
              <th>Date</th>
              <th>Customer</th>
              <th>Bank</th>
              <th>Company</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th>Ref No</th>
              <th>KAM</th>
              <th>RH</th>
              <th>Status</th>
              <th>Payment Advise</th>
              {user?.role === 'admin' && <th>Actions</th>}
            </tr>
          }
          renderRow={(t) => (
            <tr key={t.id} style={{ height: 44 }}>
              <td style={{ whiteSpace: 'nowrap' }}>{formatDate(t.date)}</td>
              <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{t.customer}</td>
              <td>{t.bank}</td>
              <td><span className="badge badge-gray">{t.company}</span></td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCr(t.amount)}</td>
              <td style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{t.refNo}</td>
              <td style={{ fontSize: 12 }}>{t.kam}</td>
              <td style={{ fontSize: 12 }}>{t.rh}</td>
              <td>
                {t.status === 'matched'       && <span className="badge badge-green">Matched</span>}
                {t.status === 'manual_review'  && <span className="badge badge-yellow">Review</span>}
                {t.status === 'duplicate'      && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span className="badge badge-red">Duplicate</span>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '2px 7px', fontSize: 10 }}
                      title="Send to Manual Review for assignment"
                      onClick={() => updateTransaction(t.id, { status: 'manual_review' })}
                    >
                      Mark Valid
                    </button>
                  </div>
                )}
              </td>
              <td>
                {t.status === 'matched' && (
                  t.adviseStatus === 'uploaded' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                      <span className="badge badge-green">✓ Uploaded</span>
                      <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => handleViewAdvise(t.id)}>View</button>
                      <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => setUploadTxId(t.id)}>Re-upload</button>
                    </div>
                  ) : (
                    <button className="btn btn-primary" style={{ padding: '3px 10px', fontSize: 11 }} onClick={() => setUploadTxId(t.id)}>Upload</button>
                  )
                )}
              </td>
              {user?.role === 'admin' && (
                <td style={{ display: 'flex', gap: 4 }}>
                  {t.status === 'matched' && (
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '2px 8px', fontSize: 11 }}
                      title="Re-assign to a different customer"
                      onClick={() => { setReassignTxId(t.id); setReassignCustomer(t.customer); }}
                    >
                      Re-assign
                    </button>
                  )}
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '2px 8px', fontSize: 11, color: 'var(--danger, #dc2626)' }}
                    title="Delete this transaction permanently"
                    onClick={() => setConfirmDeleteId(t.id)}
                  >
                    Delete
                  </button>
                </td>
              )}
            </tr>
          )}
        />
      </div>

      {/* Delete Confirm Modal */}
      {confirmDeleteId && deleteTx && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setConfirmDeleteId(null); }}>
          <div className="card" style={{ padding: 28, width: 420 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: 'var(--danger, #dc2626)' }}>Delete Transaction?</h3>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18, lineHeight: 1.6 }}>
              This will <strong>permanently remove</strong> this transaction from the model. This action cannot be undone.
            </p>
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{deleteTx.customer}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
                {formatDate(deleteTx.date)} · {deleteTx.bank} · {deleteTx.company} · {formatCr(deleteTx.amount)}
              </div>
              {deleteTx.refNo && (
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Ref: {deleteTx.refNo}</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                style={{ background: 'var(--danger, #dc2626)', borderColor: 'var(--danger, #dc2626)' }}
                onClick={() => handleDelete(confirmDeleteId)}
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Advise Modal */}
      {viewAdviseTx && (() => {
        const tx = transactions.find(t => t.id === viewAdviseTx);
        if (!tx) return null;
        return (
          <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setViewAdviseTx(null); }}>
            <div className="card" style={{ padding: 28, width: 460 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Payment Advise Details</h3>
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 18, marginBottom: 18, border: '1px solid var(--border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    ['Customer', tx.customer],
                    ['Amount', formatCr(tx.amount)],
                    ['Date', formatDate(tx.date)],
                    ['Bank', tx.bank],
                    ['Ref No', tx.refNo || '—'],
                    ['KAM', tx.kam],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{label}</div>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 18, border: '1px solid var(--border)', marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>UPLOADED FILE</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>📄</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand)' }}>{tx.adviseFile || 'Unknown file'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Payment Advise Document</div>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                {viewAdviseData === null ? (
                  <div style={{ fontSize: 13, color: 'var(--text3)', alignSelf: 'center' }}>Loading…</div>
                ) : viewAdviseData === '' ? (
                  <div style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic', alignSelf: 'center' }}>
                    File not found — re-upload to view
                  </div>
                ) : (
                  <>
                    <button className="btn btn-secondary"
                      onClick={() => {
                        const win = window.open();
                        if (win) {
                          win.document.write(`<iframe src="${viewAdviseData}" style="width:100%;height:100vh;border:none;" />`);
                          win.document.title = tx.adviseFile || 'Payment Advise';
                        }
                      }}
                    >
                      👁 Open File
                    </button>
                    <button className="btn btn-primary"
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = viewAdviseData;
                        link.download = tx.adviseFile || 'payment_advise';
                        link.click();
                      }}
                    >
                      ⬇ Download
                    </button>
                  </>
                )}
                <button className="btn btn-secondary" onClick={() => setViewAdviseTx(null)}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Re-assign Modal */}
      {reassignTxId && reassignTx && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setReassignTxId(null); }}>
          <div className="card" style={{ padding: 28, width: 420 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Re-assign Transaction</h3>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18 }}>
              {formatDate(reassignTx.date)} · {formatCr(reassignTx.amount)} · {reassignTx.bank}
            </p>
            <div style={{ marginBottom: 18 }}>
              <div className="filter-label">Customer</div>
              <select value={reassignCustomer} onChange={e => setReassignCustomer(e.target.value)} style={{ width: '100%' }}>
                <option value="">Select customer…</option>
                {customers.filter(c => c.active).sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setReassignTxId(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleReassign} disabled={!reassignCustomer}>Re-assign</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Manual Transaction Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAddModal(false); }}>
          <div className="card" style={{ padding: 28, width: 520, position: 'relative' }}>
            <button onClick={() => setShowAddModal(false)} style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)', lineHeight: 1, padding: 4 }}>✕</button>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 18 }}>Add Transaction Manually</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <div className="filter-label">DATE *</div>
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={{ width: '100%' }} />
              </div>
              <div>
                <div className="filter-label">AMOUNT (₹) *</div>
                <input type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="e.g. 150000" style={{ width: '100%' }} />
              </div>
              <div>
                <div className="filter-label">BANK *</div>
                <select value={newBank} onChange={e => setNewBank(e.target.value)} style={{ width: '100%' }}>
                  <option value="">Select bank…</option>
                  {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <div className="filter-label">COMPANY *</div>
                <select value={newCompany} onChange={e => setNewCompany(e.target.value)} style={{ width: '100%' }}>
                  <option value="">Select company…</option>
                  {COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <div className="filter-label">ACCOUNT NO.</div>
                <input value={newAccount} onChange={e => setNewAccount(e.target.value)} placeholder="Account number" style={{ width: '100%' }} />
              </div>
              <div>
                <div className="filter-label">REF NO.</div>
                <input value={newRefNo} onChange={e => setNewRefNo(e.target.value)} placeholder="Reference number" style={{ width: '100%' }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div className="filter-label">CUSTOMER NAME</div>
                <input value={newCustomer} onChange={e => setNewCustomer(e.target.value)} placeholder="Must match Customer Master for auto-assign" style={{ width: '100%' }} />
                {newCustomer.trim() && (() => {
                  const found = customers.find(c => c.name.toLowerCase() === newCustomer.trim().toLowerCase());
                  return found
                    ? <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 4, fontWeight: 600 }}>✓ Found in Customer Master — will auto-assign to {found.kam} / {found.rh}</div>
                    : <div style={{ fontSize: 11, color: '#d97706', marginTop: 4, fontWeight: 600 }}>Not in Customer Master — will go to Manual Review</div>;
                })()}
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div className="filter-label">NARRATION</div>
                <input value={newNarration} onChange={e => setNewNarration(e.target.value)} placeholder="Transaction narration" style={{ width: '100%' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={!newDate || !newAmount || !newBank || !newCompany}
                onClick={handleAddTransaction}
              >
                Add Transaction
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload / Re-upload Modal */}
      {uploadTxId && uploadTx && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={e => { if (e.target === e.currentTarget) setUploadTxId(null); }}
        >
          <div className="card" style={{ padding: 28, width: 400 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
              {uploadTx.adviseStatus === 'uploaded' ? 'Re-upload Payment Advise' : 'Upload Payment Advise'}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18 }}>
              {uploadTx.customer} · {formatCr(uploadTx.amount)} · {formatDate(uploadTx.date)}
            </p>
            {uploadTx.adviseFile && (
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 6 }}>
                Current file: <strong>{uploadTx.adviseFile}</strong>
              </div>
            )}
            <div style={{ border: '2px dashed var(--border)', borderRadius: 10, padding: 28, textAlign: 'center', background: 'var(--surface2)', marginBottom: 16 }}>
              <div style={{ fontSize: 26, marginBottom: 8 }}>📎</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>Drag & drop or click to browse</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>PDF · PNG · JPG · CSV</div>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.csv"
                onChange={e => { if (e.target.files?.[0]) handleUpload(uploadTxId, e.target.files[0]); }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setUploadTxId(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
