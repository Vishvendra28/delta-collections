import React, { useState } from 'react';
import { useRules } from '../context/RulesContext';
import { useCustomers } from '../context/CustomersContext';
import { useTransactions } from '../context/TransactionsContext';
import { useRecycleBin } from '../context/RecycleBinContext';
import { useAuth } from '../context/AuthContext';
import { KAMS, RHS } from '../data/customers';
import type { Rule, ExcludePattern, CompanyScopedExclude } from '../data/rules';
import type { Customer } from '../data/customers';

function SectionHeader({
  title, count, meta, open, onToggle, action,
}: {
  title: string; count: number; meta?: string; open: boolean;
  onToggle: () => void; action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px', cursor: 'pointer', userSelect: 'none',
        borderBottom: open ? '1px solid var(--border)' : 'none',
      }}
      onClick={onToggle}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 15, color: 'var(--text3)', lineHeight: 1, transition: 'transform .2s', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
        <div>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text1)' }}>{title}</span>
          <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>({count})</span>
          {meta && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>{meta}</div>}
        </div>
      </div>
      {action && <div onClick={e => e.stopPropagation()}>{action}</div>}
    </div>
  );
}

export function RuleManager() {
  const { rules, excludePatterns, companyScopedExcludes, addRule, updateRule, deleteRule, addExcludePattern, updateExcludePattern, deleteExcludePattern, addCompanyScopedExclude, updateCompanyScopedExclude, deleteCompanyScopedExclude } = useRules();
  const { customers, addCustomer, updateCustomer, deleteCustomer, lookupKamRh } = useCustomers();
  const { reenrichTransactions } = useTransactions();
  const { sendToRecycleBin } = useRecycleBin();
  const { user } = useAuth();

  // Accordion open/closed state — all collapsed by default
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  function toggleSection(s: string) { setOpenSections(p => ({ ...p, [s]: !p[s] })); }

  // Rule editing state
  const [editRule, setEditRule]  = useState<Rule | null>(null);
  const [showAdd, setShowAdd]   = useState(false);
  const [newKeywords, setNewKeywords] = useState('');
  const [newCustomer, setNewCustomer] = useState('');
  const [searchRules, setSearchRules] = useState('');

  // Exclude pattern state
  const [editExclude, setEditExclude] = useState<ExcludePattern | null>(null);
  const [editExcludePattern, setEditExcludePattern] = useState('');
  const [editExcludeReason, setEditExcludeReason]   = useState('');
  const [showAddExclude, setShowAddExclude] = useState(false);
  const [newExcludePattern, setNewExcludePattern] = useState('');
  const [newExcludeReason, setNewExcludeReason]   = useState('');
  const [searchExclude, setSearchExclude] = useState('');

  // Company-scoped exclude state
  const [showAddCSE, setShowAddCSE] = useState(false);
  const [editCSE, setEditCSE] = useState<CompanyScopedExclude | null>(null);
  const [cseForm, setCseForm] = useState({ pattern: '', company: 'Transin', reason: '' });
  const [searchCSE, setSearchCSE] = useState('');

  // Customer master state
  const [editCustomer,  setEditCustomer]  = useState<Customer | null>(null);
  const [showAddCust,   setShowAddCust]   = useState(false);
  const [newCustName,   setNewCustName]   = useState('');
  const [newCustKAM,    setNewCustKAM]    = useState('');
  const [newCustRH,     setNewCustRH]     = useState('');
  const [newCustToPay,  setNewCustToPay]  = useState(false);
  const [searchCustomers, setSearchCustomers] = useState('');

  const filteredRules = rules.filter(r =>
    !searchRules ||
    r.customer.toLowerCase().includes(searchRules.toLowerCase()) ||
    r.keywords.some(k => k.toLowerCase().includes(searchRules.toLowerCase())) ||
    r.compoundRules?.some(cr => cr.allOf.some(k => k.toLowerCase().includes(searchRules.toLowerCase())))
  );

  const filteredExclude = excludePatterns.filter(ep =>
    !searchExclude ||
    ep.pattern.toLowerCase().includes(searchExclude.toLowerCase()) ||
    ep.reason.toLowerCase().includes(searchExclude.toLowerCase())
  );

  const filteredCSE = companyScopedExcludes.filter(cse =>
    !searchCSE ||
    cse.pattern.toLowerCase().includes(searchCSE.toLowerCase()) ||
    cse.company.toLowerCase().includes(searchCSE.toLowerCase()) ||
    cse.reason.toLowerCase().includes(searchCSE.toLowerCase())
  );

  const filteredCustomers = customers.filter(c =>
    !searchCustomers ||
    c.name.toLowerCase().includes(searchCustomers.toLowerCase()) ||
    c.kam.toLowerCase().includes(searchCustomers.toLowerCase()) ||
    c.rh.toLowerCase().includes(searchCustomers.toLowerCase())
  );

  function handleAdd() {
    if (!newCustomer || !newKeywords.trim()) return;
    addRule({ customer: newCustomer, keywords: newKeywords.split(',').map(k => k.trim().toUpperCase()).filter(Boolean), source: 'manual' });
    setShowAdd(false); setNewKeywords(''); setNewCustomer('');
  }

  function startEditExclude(ep: ExcludePattern) {
    setEditExclude(ep);
    setEditExcludePattern(ep.pattern);
    setEditExcludeReason(ep.reason);
  }

  function saveEditExclude() {
    if (!editExclude) return;
    updateExcludePattern(editExclude.pattern, { pattern: editExcludePattern.trim(), reason: editExcludeReason.trim() });
    setEditExclude(null);
  }

  function handleAddExclude() {
    if (!newExcludePattern.trim()) return;
    addExcludePattern({ pattern: newExcludePattern.trim(), reason: newExcludeReason.trim() });
    setShowAddExclude(false); setNewExcludePattern(''); setNewExcludeReason('');
  }

  function startEditCustomer(c: Customer) { setEditCustomer({ ...c }); }

  function saveEditCustomer() {
    if (!editCustomer) return;
    updateCustomer(editCustomer.id, editCustomer);
    reenrichTransactions(lookupKamRh);
    setEditCustomer(null);
  }

  function handleDeleteCustomer(id: string, name: string) {
    if (window.confirm(`Delete customer "${name}"? This cannot be undone.`)) {
      const c = customers.find(x => x.id === id);
      if (c) sendToRecycleBin('customer', c, user?.name || 'User', 'Deleted from Customer Master');
      deleteCustomer(id);
      reenrichTransactions(lookupKamRh);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── EXCLUDE PATTERNS ACCORDION ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <SectionHeader
          title="Exclude Patterns"
          count={excludePatterns.length}
          meta="matching narrations are auto-excluded at import"
          open={!!openSections['exclude']}
          onToggle={() => toggleSection('exclude')}
          action={
            <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setShowAddExclude(true)}>
              + Add Pattern
            </button>
          }
        />
        {openSections['exclude'] && (
          <div style={{ padding: '0 0 4px' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' }}>
              <input placeholder="Search patterns or reasons..." value={searchExclude} onChange={e => setSearchExclude(e.target.value)} style={{ minWidth: 240 }} />
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>{filteredExclude.length} of {excludePatterns.length} shown</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Pattern</th>
                    <th>Reason</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExclude.map(ep => (
                    <tr key={ep.pattern}>
                      <td>
                        <span style={{ padding: '2px 10px', background: '#fee2e2', borderRadius: 6, fontSize: 12, color: '#991b1b', fontWeight: 600 }}>{ep.pattern}</span>
                      </td>
                      <td style={{ color: 'var(--text2)', fontSize: 13 }}>{ep.reason}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => startEditExclude(ep)}>Edit</button>
                          <button className="btn btn-danger" style={{ padding: '3px 8px', fontSize: 11 }}
                            onClick={() => { if (window.confirm(`Delete exclude pattern "${ep.pattern}"?`)) { sendToRecycleBin('exclude_pattern', ep, user?.name || 'User', 'Deleted from Rule Manager'); deleteExcludePattern(ep.pattern); } }}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── COMPANY-SCOPED EXCLUDES ACCORDION ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <SectionHeader
          title="Company-Scoped Excludes"
          count={companyScopedExcludes.length}
          meta="block specific narrations for one company only (e.g. accept in Zast, reject in Transin)"
          open={!!openSections['cse']}
          onToggle={() => toggleSection('cse')}
          action={
            <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => { setCseForm({ pattern: '', company: 'Transin', reason: '' }); setShowAddCSE(true); }}>
              + Add
            </button>
          }
        />
        {openSections['cse'] && (
          <div style={{ padding: '0 0 4px' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' }}>
              <input placeholder="Search pattern, company or reason..." value={searchCSE} onChange={e => setSearchCSE(e.target.value)} style={{ minWidth: 260 }} />
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>{filteredCSE.length} of {companyScopedExcludes.length} shown</span>
            </div>
            <div style={{ padding: '8px 16px 12px', background: '#fefce8', border: '1px solid #fde68a', margin: '8px 16px', borderRadius: 7, fontSize: 12, color: '#92400e' }}>
              ℹ These excludes fire <strong>before</strong> customer rules. A narration matching this pattern is always rejected for the specified company, even if a rule would otherwise match it.
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Pattern</th>
                    <th>Company</th>
                    <th>Reason</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCSE.map(cse => (
                    <tr key={cse.id}>
                      <td>
                        <span style={{ padding: '2px 10px', background: '#fee2e2', borderRadius: 6, fontSize: 12, color: '#991b1b', fontWeight: 600 }}>{cse.pattern}</span>
                      </td>
                      <td>
                        <span style={{ padding: '2px 10px', background: 'var(--brand-light)', borderRadius: 6, fontSize: 12, color: 'var(--brand)', fontWeight: 600 }}>{cse.company}</span>
                      </td>
                      <td style={{ color: 'var(--text2)', fontSize: 13 }}>{cse.reason}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => { setEditCSE(cse); setCseForm({ pattern: cse.pattern, company: cse.company, reason: cse.reason }); }}>Edit</button>
                          <button className="btn btn-danger" style={{ padding: '3px 8px', fontSize: 11 }}
                            onClick={() => { if (window.confirm(`Delete company-scoped exclude "${cse.pattern}" for ${cse.company}?`)) deleteCompanyScopedExclude(cse.id); }}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {companyScopedExcludes.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '20px 0' }}>No company-scoped excludes yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── NARRATION RULES ACCORDION ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <SectionHeader
          title="Narration Rules"
          count={rules.length}
          meta="keywords matched against bank narrations to identify customers"
          open={!!openSections['rules']}
          onToggle={() => toggleSection('rules')}
          action={
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setShowAdd(true)}>
              + Add Rule
            </button>
          }
        />
        {openSections['rules'] && (
          <div>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' }}>
              <input placeholder="Search rules..." value={searchRules} onChange={e => setSearchRules(e.target.value)} style={{ minWidth: 240 }} />
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>{filteredRules.length} of {rules.length} shown</span>
            </div>
            <div style={{ padding: '8px 12px 8px', background: '#f0f9ff', border: '1px solid #bae6fd', margin: '0 16px 12px', borderRadius: 7, fontSize: 12, color: '#0369a1' }}>
              ℹ Fuzzy safety net: if no rule matches exactly, the engine checks whether 2+ significant words from a customer name appear in the narration. Those go to Manual Review with a suggested customer.
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>Rule ID</th>
                    <th>Customer</th>
                    <th>Keywords</th>
                    <th>Source</th>
                    <th>Added</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRules.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' }}>{r.id}</td>
                      <td style={{ fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customer}</td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {r.keywords.map(kw => (
                            <span key={kw} style={{ padding: '2px 8px', background: 'var(--brand-light)', borderRadius: 4, fontSize: 11, color: 'var(--brand)', fontWeight: 600 }}>{kw}</span>
                          ))}
                          {r.compoundRules?.map((cr, i) => (
                            <span key={i} style={{ padding: '2px 8px', background: '#e0f2fe', borderRadius: 4, fontSize: 11, color: '#0369a1', fontWeight: 600 }}>
                              ALL: {cr.allOf.join(' + ')}
                            </span>
                          ))}
                        </div>
                        {r.note && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3, fontStyle: 'italic' }}>{r.note}</div>}
                      </td>
                      <td><span className={`badge ${r.source === 'system' ? 'badge-blue' : 'badge-green'}`}>{r.source}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--text3)' }}>{r.createdAt}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setEditRule({ ...r })}>Edit</button>
                          <button className="btn btn-danger" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => { if (window.confirm(`Delete rule for "${r.customer}"?`)) { sendToRecycleBin('rule', r, user?.name || 'User', 'Deleted from Rule Manager'); deleteRule(r.id); } }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── CUSTOMER MASTER ACCORDION ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <SectionHeader
          title="Customer Master"
          count={customers.length}
          meta="KAM & RH assignments for all active customers"
          open={!!openSections['customers']}
          onToggle={() => toggleSection('customers')}
          action={
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setShowAddCust(true)}>
              + Add Customer
            </button>
          }
        />
        {openSections['customers'] && (
          <div>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' }}>
              <input placeholder="Search by name, KAM or RH..." value={searchCustomers} onChange={e => setSearchCustomers(e.target.value)} style={{ minWidth: 260 }} />
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>{filteredCustomers.length} of {customers.length} shown</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Customer Name</th>
                    <th>KAM</th>
                    <th>Regional Head</th>
                    <th>ToPay</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 500 }}>{c.name}</td>
                      <td>{c.kam || <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>}</td>
                      <td>{c.rh || <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>}</td>
                      <td>{c.toPayFlag ? <span className="badge badge-red">ToPay</span> : <span className="badge badge-gray">No</span>}</td>
                      <td><span className={`badge ${c.active ? 'badge-green' : 'badge-gray'}`}>{c.active ? 'Active' : 'Inactive'}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => startEditCustomer(c)}>Edit</button>
                          <button className="btn btn-danger" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => handleDeleteCustomer(c.id, c.name)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── ADD RULE MODAL ── */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={e => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div className="card" style={{ padding: 28, width: 460, position: 'relative' }}>
            <button onClick={() => setShowAdd(false)} title="Close" style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)', lineHeight: 1, padding: 4 }}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Add New Rule</h3>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>CUSTOMER</div>
              <select value={newCustomer} onChange={e => setNewCustomer(e.target.value)} style={{ width: '100%' }}>
                <option value="">— Select customer —</option>
                {customers.filter(c => c.active).map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>KEYWORDS — comma separated</div>
              <input value={newKeywords} onChange={e => setNewKeywords(e.target.value)} placeholder="e.g. COLGATE, COLGATE PALMOLIVE" style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd} disabled={!newCustomer || !newKeywords.trim()}>Add Rule</button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT RULE MODAL ── */}
      {editRule && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={e => { if (e.target === e.currentTarget) setEditRule(null); }}>
          <div className="card" style={{ padding: 28, width: 460, position: 'relative' }}>
            <button onClick={() => setEditRule(null)} title="Close" style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)', lineHeight: 1, padding: 4 }}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Edit Rule — {editRule.id}</h3>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>CUSTOMER</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{editRule.customer}</div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>KEYWORDS — comma separated (standalone matches)</div>
              <input
                value={editRule.keywords.join(', ')}
                onChange={e => setEditRule({ ...editRule, keywords: e.target.value.split(',').map(k => k.trim().toUpperCase()).filter(Boolean) })}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>COMPOUND RULES — must contain ALL listed keywords</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>Each line = one rule. List keywords separated by commas. Example: <code>HDFCH010, ASIAN PAINTS</code></div>
              <textarea
                rows={Math.max(2, (editRule.compoundRules?.length ?? 0) + 1)}
                value={(editRule.compoundRules ?? []).map(cr => cr.allOf.join(', ')).join('\n')}
                onChange={e => {
                  const lines = e.target.value.split('\n').map(l => l.trim()).filter(Boolean);
                  const compoundRules = lines.map(l => ({ allOf: l.split(',').map(k => k.trim().toUpperCase()).filter(Boolean) })).filter(cr => cr.allOf.length >= 2);
                  setEditRule({ ...editRule, compoundRules });
                }}
                placeholder="HDFCH010, ASIAN PAINTS"
                style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>NOTE (OPTIONAL)</div>
              <input value={editRule.note || ''} onChange={e => setEditRule({ ...editRule, note: e.target.value })} style={{ width: '100%' }} placeholder="Optional note" />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setEditRule(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { updateRule(editRule.id, editRule); setEditRule(null); }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD EXCLUDE PATTERN MODAL ── */}
      {showAddExclude && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddExclude(false); }}>
          <div className="card" style={{ padding: 28, width: 420, position: 'relative' }}>
            <button onClick={() => setShowAddExclude(false)} title="Close" style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)', lineHeight: 1, padding: 4 }}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Add Exclude Pattern</h3>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>PATTERN (case-insensitive substring match)</div>
              <input value={newExcludePattern} onChange={e => setNewExcludePattern(e.target.value)} placeholder="e.g. BANK CHARGES" style={{ width: '100%' }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>REASON</div>
              <input value={newExcludeReason} onChange={e => setNewExcludeReason(e.target.value)} placeholder="e.g. Bank service charges" style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowAddExclude(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddExclude} disabled={!newExcludePattern.trim()}>Add Pattern</button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT EXCLUDE PATTERN MODAL ── */}
      {editExclude && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={e => { if (e.target === e.currentTarget) setEditExclude(null); }}>
          <div className="card" style={{ padding: 28, width: 420, position: 'relative' }}>
            <button onClick={() => setEditExclude(null)} title="Close" style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)', lineHeight: 1, padding: 4 }}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Edit Exclude Pattern</h3>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>PATTERN</div>
              <input value={editExcludePattern} onChange={e => setEditExcludePattern(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>REASON</div>
              <input value={editExcludeReason} onChange={e => setEditExcludeReason(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setEditExclude(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEditExclude}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD COMPANY-SCOPED EXCLUDE MODAL ── */}
      {showAddCSE && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddCSE(false); }}>
          <div className="card" style={{ padding: 28, width: 440, position: 'relative' }}>
            <button onClick={() => setShowAddCSE(false)} title="Close" style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)', lineHeight: 1, padding: 4 }}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Add Company-Scoped Exclude</h3>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>Block a narration pattern for a specific company only.</p>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>PATTERN (case-insensitive)</div>
              <input value={cseForm.pattern} onChange={e => setCseForm(f => ({ ...f, pattern: e.target.value.toUpperCase() }))} placeholder="e.g. SUNFLAG" style={{ width: '100%' }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>COMPANY TO BLOCK IN</div>
              <select value={cseForm.company} onChange={e => setCseForm(f => ({ ...f, company: e.target.value }))} style={{ width: '100%' }}>
                <option value="Transin">Transin</option>
                <option value="Zast">Zast</option>
              </select>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>REASON</div>
              <input value={cseForm.reason} onChange={e => setCseForm(f => ({ ...f, reason: e.target.value }))} placeholder="e.g. Not a Transin collection customer" style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowAddCSE(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!cseForm.pattern.trim()}
                onClick={() => { addCompanyScopedExclude(cseForm); setShowAddCSE(false); }}>
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT COMPANY-SCOPED EXCLUDE MODAL ── */}
      {editCSE && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={e => { if (e.target === e.currentTarget) setEditCSE(null); }}>
          <div className="card" style={{ padding: 28, width: 440, position: 'relative' }}>
            <button onClick={() => setEditCSE(null)} title="Close" style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)', lineHeight: 1, padding: 4 }}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Edit Company-Scoped Exclude</h3>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>PATTERN (case-insensitive)</div>
              <input value={cseForm.pattern} onChange={e => setCseForm(f => ({ ...f, pattern: e.target.value.toUpperCase() }))} style={{ width: '100%' }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>COMPANY TO BLOCK IN</div>
              <select value={cseForm.company} onChange={e => setCseForm(f => ({ ...f, company: e.target.value }))} style={{ width: '100%' }}>
                <option value="Transin">Transin</option>
                <option value="Zast">Zast</option>
              </select>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>REASON</div>
              <input value={cseForm.reason} onChange={e => setCseForm(f => ({ ...f, reason: e.target.value }))} style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setEditCSE(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={!cseForm.pattern.trim()}
                onClick={() => { updateCompanyScopedExclude(editCSE.id, cseForm); setEditCSE(null); }}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD CUSTOMER MODAL ── */}
      {showAddCust && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAddCust(false); }}>
          <div className="card" style={{ padding: 28, width: 460, position: 'relative' }}>
            <button onClick={() => { setShowAddCust(false); setNewCustName(''); }} title="Close" style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)', lineHeight: 1, padding: 4 }}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 18 }}>Add New Customer</h3>
            <div style={{ marginBottom: 14 }}>
              <div className="filter-label">Customer Name</div>
              <input value={newCustName} onChange={e => setNewCustName(e.target.value)} placeholder="Full company name..." style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <div className="filter-label">KAM</div>
                <select value={newCustKAM} onChange={e => setNewCustKAM(e.target.value)} style={{ width: '100%' }}>
                  <option value="">— None —</option>
                  {KAMS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div>
                <div className="filter-label">Regional Head</div>
                <select value={newCustRH} onChange={e => setNewCustRH(e.target.value)} style={{ width: '100%' }}>
                  <option value="">— None —</option>
                  {RHS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div className="filter-label">ToPay Flag</div>
              <select value={newCustToPay ? 'yes' : 'no'} onChange={e => setNewCustToPay(e.target.value === 'yes')} style={{ width: '100%' }}>
                <option value="no">No</option>
                <option value="yes">Yes (ToPay)</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => { setShowAddCust(false); setNewCustName(''); }}>Cancel</button>
              <button className="btn btn-primary"
                disabled={!newCustName.trim()}
                onClick={() => {
                  addCustomer({ name: newCustName.trim(), kam: newCustKAM, rh: newCustRH, toPayFlag: newCustToPay, active: true });
                  reenrichTransactions(lookupKamRh);
                  setShowAddCust(false); setNewCustName(''); setNewCustKAM(''); setNewCustRH(''); setNewCustToPay(false);
                }}>
                Add Customer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT CUSTOMER MODAL ── */}
      {editCustomer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={e => { if (e.target === e.currentTarget) setEditCustomer(null); }}>
          <div className="card" style={{ padding: 28, width: 460, position: 'relative' }}>
            <button onClick={() => setEditCustomer(null)} title="Close" style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)', lineHeight: 1, padding: 4 }}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Edit Customer — {editCustomer.id}</h3>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>CUSTOMER NAME</div>
              <input value={editCustomer.name} onChange={e => setEditCustomer({ ...editCustomer, name: e.target.value })} style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>KAM</div>
                <select value={editCustomer.kam} onChange={e => setEditCustomer({ ...editCustomer, kam: e.target.value })} style={{ width: '100%' }}>
                  <option value="">— None —</option>
                  {KAMS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>REGIONAL HEAD</div>
                <select value={editCustomer.rh} onChange={e => setEditCustomer({ ...editCustomer, rh: e.target.value })} style={{ width: '100%' }}>
                  <option value="">— None —</option>
                  {RHS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>TOPAY FLAG</div>
                <select value={editCustomer.toPayFlag ? 'yes' : 'no'} onChange={e => setEditCustomer({ ...editCustomer, toPayFlag: e.target.value === 'yes' })} style={{ width: '100%' }}>
                  <option value="no">No</option>
                  <option value="yes">Yes (ToPay)</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>STATUS</div>
                <select value={editCustomer.active ? 'active' : 'inactive'} onChange={e => setEditCustomer({ ...editCustomer, active: e.target.value === 'active' })} style={{ width: '100%' }}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setEditCustomer(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEditCustomer}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
