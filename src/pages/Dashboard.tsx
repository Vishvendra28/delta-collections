import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { Page } from '../App';
import { useTransactions } from '../context/TransactionsContext';
import { useAuth } from '../context/AuthContext';
import { KAMS, RHS } from '../data/customers';
import { formatCr, formatCrRounded, sumExact } from '../utils/formatters';
import { useTarget } from '../context/TargetContext';
import * as XLSX from 'xlsx';

interface Props { onNavigate: (p: Page) => void; }

function getFY(month: string): string {
  const [yr, mo] = month.split('-').map(Number);
  const start = mo >= 4 ? yr : yr - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

function fyRange(fy: string): string[] {
  const start = Number(fy.split('-')[0]);
  const months: string[] = [];
  for (let m = 4; m <= 12; m++) months.push(`${start}-${String(m).padStart(2, '0')}`);
  for (let m = 1; m <= 3; m++) months.push(`${start + 1}-${String(m).padStart(2, '0')}`);
  return months;
}

function scopedTxs(txs: ReturnType<typeof useTransactions>['transactions']) {
  return txs.filter(t => t.status === 'matched');
}

export function Dashboard({ onNavigate }: Props) {
  const { transactions } = useTransactions();
  const { user, demoUsers } = useAuth();
  const { version, getTargetMeta, getTargetRows, prefetchTarget } = useTarget();

  const [fFY,       setFFY]       = useState('');
  const [fMonth,    setFMonth]    = useState('');
  const [fKAM,      setFKAM]      = useState('');
  const [fRH,       setFRH]       = useState('');
  const [fBank,     setFBank]     = useState('');
  const [fCompany,  setFCompany]  = useState('');
  const [fDate,     setFDate]     = useState('');
  const [fCustomer, setFCustomer] = useState('');
  const [fRef,      setFRef]      = useState('');
  const [showAllDates, setShowAllDates] = useState(false);
  const [datePage,     setDatePage]     = useState(0);
  const [sortDate,     setSortDate]     = useState<string | null>(null);
  const [showExport,   setShowExport]   = useState(false);
  const [expMonth,  setExpMonth]  = useState('');
  const [expFrom,   setExpFrom]   = useState('');
  const [expTo,     setExpTo]     = useState('');
  const [expFull,   setExpFull]   = useState(true);
  const [expBank,   setExpBank]   = useState('');
  const [expCompany, setExpCompany] = useState('');

  const scoped = useMemo(() => scopedTxs(transactions), [transactions]);

  const autoMonthRef = useRef(false);
  useEffect(() => {
    if (!autoMonthRef.current && scoped.length > 0) {
      autoMonthRef.current = true;
      const months = [...new Set(scoped.map(t => t.date.slice(0, 7)))].sort().reverse();
      if (months[0]) { setFMonth(months[0]); setFFY(getFY(months[0])); }
    }
  }, [scoped]);

  const filtered = useMemo(() => {
    let txs = scoped;
    if (fMonth) {
      txs = txs.filter(t => t.date.startsWith(fMonth));
    } else {
      const fyMs = new Set(fyRange(fFY));
      txs = txs.filter(t => fyMs.has(t.date.slice(0, 7)));
    }
    if (fKAM)      txs = txs.filter(t => t.kam === fKAM);
    if (fRH)       txs = txs.filter(t => t.rh  === fRH);
    if (fBank)     txs = txs.filter(t => t.bank === fBank);
    if (fCompany)  txs = txs.filter(t => t.company === fCompany);
    if (fDate)     txs = txs.filter(t => t.date === fDate);
    if (fCustomer) txs = txs.filter(t => t.customer.toLowerCase().includes(fCustomer.toLowerCase()));
    if (fRef)      txs = txs.filter(t => t.refNo.toLowerCase().includes(fRef.toLowerCase()));
    return txs;
  }, [scoped, fMonth, fFY, fKAM, fRH, fBank, fCompany, fDate, fCustomer, fRef]);

  const mtdTotal        = sumExact(filtered.map(t => t.amount));
const uniqueCustomers = new Set(filtered.map(t => t.customer)).size;
  const today           = new Date().toISOString().slice(0, 10);
  const todayTxs        = filtered.filter(t => t.date === today);
  const todayTotal      = sumExact(todayTxs.map(t => t.amount));

  // Month-over-month: compute prev month total using same KAM/RH/Bank/Company filters
  const prevMonth = useMemo(() => {
    if (!fMonth) return null;
    const [yr, mo] = fMonth.split('-').map(Number);
    const d = new Date(yr, mo - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, [fMonth]);

  const prevMonthTotal = useMemo(() => {
    if (!prevMonth) return null;
    let txs = scoped.filter(t => t.date.startsWith(prevMonth));
    if (fKAM)     txs = txs.filter(t => t.kam === fKAM);
    if (fRH)      txs = txs.filter(t => t.rh === fRH);
    if (fBank)    txs = txs.filter(t => t.bank === fBank);
    if (fCompany) txs = txs.filter(t => t.company === fCompany);
    return sumExact(txs.map(t => t.amount));
  }, [scoped, prevMonth, fKAM, fRH, fBank, fCompany]);

  const momDelta = useMemo(() => {
    if (prevMonthTotal === null || prevMonthTotal === 0) return null;
    return ((mtdTotal - prevMonthTotal) / prevMonthTotal) * 100;
  }, [mtdTotal, prevMonthTotal]);

  const targetMonth = fMonth || new Date().toISOString().slice(0, 7);

  useEffect(() => {
    const kamList = demoUsers.filter(u => u.role === 'kam' && u.kamName);
    if (user?.role === 'kam' && user.kamName) {
      prefetchTarget(user.kamName, targetMonth);
    } else {
      kamList.forEach(u => { if (u.kamName) prefetchTarget(u.kamName, targetMonth); });
    }
  }, [targetMonth, user, demoUsers, prefetchTarget]);

  const targetTotal = useMemo(() => {
    const kamList = demoUsers.filter(u => u.role === 'kam' && u.kamName);
    if (user?.role === 'kam' && user.kamName) {
      return getTargetRows(user.kamName, targetMonth).reduce((s, r) => s + r.totalAmount, 0);
    }
    return kamList.reduce((sum, u) =>
      sum + getTargetRows(u.kamName!, targetMonth).reduce((s, r) => s + r.totalAmount, 0), 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMonth, user, demoUsers, getTargetRows, version]);

  const PAGE_SIZE = 10;
  const allDates = useMemo(() => [...new Set(filtered.map(t => t.date))].sort(), [filtered]);
  const visibleDates = useMemo(() => {
    if (!showAllDates) return allDates.slice(-3);
    const start = datePage * PAGE_SIZE;
    return allDates.slice(start, start + PAGE_SIZE);
  }, [showAllDates, allDates, datePage]);
  const totalPages = Math.ceil(allDates.length / PAGE_SIZE);

  const customerRows = useMemo(() => {
    const map: Record<string, { total: number; byDate: Record<string, number>; kam: string; rh: string }> = {};
    filtered.forEach(t => {
      if (!map[t.customer]) map[t.customer] = { total: 0, byDate: {}, kam: t.kam, rh: t.rh };
      map[t.customer].total = Math.round((map[t.customer].total + t.amount + Number.EPSILON) * 100) / 100;
      const prev = map[t.customer].byDate[t.date] || 0;
      map[t.customer].byDate[t.date] = Math.round((prev + t.amount + Number.EPSILON) * 100) / 100;
    });
    const entries = Object.entries(map);
    if (sortDate) {
      return entries.sort((a, b) => {
        const av = a[1].byDate[sortDate] || 0;
        const bv = b[1].byDate[sortDate] || 0;
        if (bv !== av) return bv - av;
        return a[0].localeCompare(b[0]);
      });
    }
    return entries.sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered, sortDate]);

  const kamRows = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(t => {
      map[t.kam] = Math.round(((map[t.kam] || 0) + t.amount + Number.EPSILON) * 100) / 100;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const dateTotals = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(t => {
      map[t.date] = Math.round(((map[t.date] || 0) + t.amount + Number.EPSILON) * 100) / 100;
    });
    return map;
  }, [filtered]);

  const handleMgmtExport = useCallback(() => {
    const months = [...new Set(scoped.map(t => t.date.slice(0, 7)))].sort().reverse();
    const month = fMonth || months[0] || '';
    let txs = month ? scoped.filter(t => t.date.startsWith(month)) : [...scoped];
    if (fKAM)     txs = txs.filter(t => t.kam === fKAM);
    if (fRH)      txs = txs.filter(t => t.rh === fRH);
    if (fBank)    txs = txs.filter(t => t.bank === fBank);
    if (fCompany) txs = txs.filter(t => t.company === fCompany);

    const wb = XLSX.utils.book_new();

    // Sheet 1: KAM Summary
    const kamMap: Record<string, { total: number; count: number; customers: Set<string> }> = {};
    txs.forEach(t => {
      if (!kamMap[t.kam]) kamMap[t.kam] = { total: 0, count: 0, customers: new Set() };
      kamMap[t.kam].total += t.amount;
      kamMap[t.kam].count++;
      kamMap[t.kam].customers.add(t.customer);
    });
    const kamSheet = Object.entries(kamMap)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([kam, d]) => ({ KAM: kam, 'Amount (₹)': d.total, Transactions: d.count, Customers: d.customers.size }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kamSheet), 'KAM Summary');

    // Sheet 2: Customer Summary
    const custMap: Record<string, { kam: string; rh: string; total: number; count: number }> = {};
    txs.forEach(t => {
      if (!custMap[t.customer]) custMap[t.customer] = { kam: t.kam, rh: t.rh, total: 0, count: 0 };
      custMap[t.customer].total += t.amount;
      custMap[t.customer].count++;
    });
    const custSheet = Object.entries(custMap)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, d]) => ({ Customer: name, KAM: d.kam, 'Regional Head': d.rh, 'Amount (₹)': d.total, Transactions: d.count }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(custSheet), 'Customer Summary');

    // Sheet 3: Daily Breakdown
    const dayMap: Record<string, number> = {};
    txs.forEach(t => { dayMap[t.date] = (dayMap[t.date] || 0) + t.amount; });
    const daySheet = Object.entries(dayMap)
      .sort()
      .map(([date, total]) => ({ Date: date, 'Amount (₹)': total }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(daySheet), 'Daily Breakdown');

    // Sheet 4: Full Transaction List
    const fullSheet = txs.map(t => ({
      Date: t.date, Customer: t.customer, Bank: t.bank, Company: t.company,
      'Amount (₹)': t.amount, 'Ref No': t.refNo, KAM: t.kam, 'Regional Head': t.rh,
      'Advise Status': t.adviseStatus,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fullSheet), 'Transactions');

    XLSX.writeFile(wb, `Delta_Management_Summary_${month || 'All'}.xlsx`);
  }, [scoped, fMonth, fKAM, fRH, fBank, fCompany]);

  const handleExport = useCallback(() => {
    let txs = expMonth ? scoped.filter(t => t.date.startsWith(expMonth)) : [...scoped];
    if (!expFull) {
      if (expFrom) txs = txs.filter(t => t.date >= expFrom);
      if (expTo)   txs = txs.filter(t => t.date <= expTo);
    }
    if (expBank)    txs = txs.filter(t => t.bank === expBank);
    if (expCompany) txs = txs.filter(t => t.company === expCompany);
    const rows = txs.map(t => ({
      Date: t.date, Customer: t.customer, Bank: t.bank,
      Account: t.account, Company: t.company, 'Amount (₹)': t.amount,
      'Ref No': t.refNo, KAM: t.kam, 'Regional Head': t.rh, 'Advise Status': t.adviseStatus,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Collections');
    const suffix = [expBank, expCompany].filter(Boolean).join('_');
    XLSX.writeFile(wb, `Delta_Collections_${expMonth}${!expFull && expFrom ? `_${expFrom}_to_${expTo}` : '_Full'}${suffix ? `_${suffix}` : ''}.xlsx`);
    setShowExport(false);
  }, [scoped, expMonth, expFull, expFrom, expTo, expBank, expCompany]);

  const availableFYs = useMemo(() => {
    const fySet = new Set(scoped.map(t => getFY(t.date.slice(0, 7))));
    return [...fySet].sort().reverse();
  }, [scoped]);

  const availableMonths = useMemo(() => {
    const set = new Set(scoped.map(t => t.date.slice(0, 7)));
    const all = [...set].sort().reverse();
    const range = new Set(fyRange(fFY));
    return all.filter(m => range.has(m));
  }, [scoped, fFY]);

  const availableBanks = useMemo(() => {
    const set = new Set(scoped.map(t => t.bank).filter(Boolean));
    return [...set].sort();
  }, [scoped]);

  const availableCompanies = useMemo(() => {
    const set = new Set(scoped.map(t => t.company).filter(Boolean));
    return [...set].sort();
  }, [scoped]);

  const monthLabel = (m: string) => {
    if (!m) return 'All Months';
    const [yr, mo] = m.split('-');
    return new Date(Number(yr), Number(mo) - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  };


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── KPI CARDS ── */}
      <div className="card" style={{ display: 'flex', padding: 0, overflow: 'hidden' }}>

        {/* Left: MTD Collection */}
        <div style={{ flex: 1, padding: '14px 22px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text2)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Total MTD Collection</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--brand)', lineHeight: 1.15 }}>{formatCrRounded(mtdTotal)}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span>{uniqueCustomers} customers · {filtered.length} txns</span>
            {momDelta !== null && (
              <span style={{ fontWeight: 700, color: momDelta >= 0 ? 'var(--success)' : 'var(--danger)', fontSize: 11, background: momDelta >= 0 ? '#d1fae5' : '#fee2e2', padding: '1px 7px', borderRadius: 99 }}>
                {momDelta >= 0 ? '▲' : '▼'} {Math.abs(momDelta).toFixed(1)}% vs prev month
              </span>
            )}
          </div>
        </div>

        {/* Right: Target vs Actual */}
        <div onClick={() => onNavigate('target')}
          style={{ flex: 1, padding: '14px 22px', cursor: 'pointer' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text2)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Target vs Actual</span>
            <span style={{ fontSize: 10, color: 'var(--brand)', fontWeight: 600 }}>View Details ↗</span>
          </div>
          {targetTotal > 0 ? (
            <>
              <div style={{ display: 'flex', gap: 16, alignItems: 'baseline', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>Target</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>{formatCrRounded(targetTotal)}</div>
                </div>
                <div style={{ width: 1, height: 28, background: 'var(--border)', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>Actual</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--brand)' }}>{formatCrRounded(mtdTotal)}</div>
                </div>
              </div>
              {(() => {
                const pct = targetTotal > 0 ? (mtdTotal / targetTotal) * 100 : 0;
                const color = pct >= 80 ? 'var(--success)' : pct >= 50 ? '#d97706' : 'var(--danger)';
                const bg    = pct >= 80 ? '#d1fae5' : pct >= 50 ? '#fef3c7' : '#fee2e2';
                return (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>{monthLabel(targetMonth)}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color, background: bg, padding: '1px 8px', borderRadius: 99 }}>{pct.toFixed(1)}%</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 99, background: 'var(--border)' }}>
                      <div style={{ height: '100%', borderRadius: 99, background: color, width: `${Math.min(pct, 100)}%`, transition: 'width 0.4s' }} />
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>No target uploaded for {monthLabel(targetMonth)}</div>
          )}
        </div>

      </div>

      {/* ── FY TOGGLE ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', letterSpacing: '0.05em' }}>FINANCIAL YEAR:</span>
        {availableFYs.map(fy => (
          <button
            key={fy}
            onClick={() => { setFFY(fy); setFMonth(''); localStorage.removeItem('delta_dashboard_month'); }}
            style={{
              padding: '5px 14px', borderRadius: 20, border: `2px solid ${fFY === fy ? 'var(--brand)' : 'var(--border)'}`,
              background: fFY === fy ? 'var(--brand)' : 'var(--surface2)',
              color: fFY === fy ? '#fff' : 'var(--text)', cursor: 'pointer', fontSize: 12, fontWeight: 700,
            }}
          >
            FY {fy}
          </button>
        ))}
      </div>

      {/* ── FILTER BAR ── */}
      <div className="card" style={{ padding: '16px 18px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 12, marginBottom: 12 }}>
          {[
            { label: 'Month', el: <select value={fMonth} onChange={e => { const m = e.target.value; setFMonth(m); if (m) { setFFY(getFY(m)); localStorage.setItem('delta_dashboard_month', m); } else { localStorage.removeItem('delta_dashboard_month'); } }} style={{ width: '100%' }}><option value="">All in FY</option>{availableMonths.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}</select> },
            { label: 'KAM', el: <select value={fKAM} onChange={e => setFKAM(e.target.value)} style={{ width: '100%' }}><option value="">All KAMs</option>{KAMS.map(k => <option key={k} value={k}>{k}</option>)}</select> },
            { label: 'Regional Head', el: <select value={fRH} onChange={e => setFRH(e.target.value)} style={{ width: '100%' }}><option value="">All RH</option>{RHS.map(r => <option key={r} value={r}>{r}</option>)}</select> },
            { label: 'Bank', el: <select value={fBank} onChange={e => setFBank(e.target.value)} style={{ width: '100%' }}><option value="">All Banks</option>{availableBanks.map(b => <option key={b} value={b}>{b}</option>)}</select> },
            { label: 'Company', el: <select value={fCompany} onChange={e => setFCompany(e.target.value)} style={{ width: '100%' }}><option value="">All Companies</option>{availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}</select> },
            { label: 'Date', el: <input type="date" value={fDate} onChange={e => setFDate(e.target.value)} style={{ width: '100%' }} /> },
            { label: 'Customer Name', el: <input placeholder="Search..." value={fCustomer} onChange={e => setFCustomer(e.target.value)} style={{ width: '100%' }} /> },
            { label: 'Reference No.', el: <input placeholder="Ref No..." value={fRef} onChange={e => setFRef(e.target.value)} style={{ width: '100%' }} /> },
          ].map(({ label, el }) => (
            <div key={label}>
              <div className="filter-label">{label}</div>
              {el}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={() => { setFMonth(''); localStorage.removeItem('delta_dashboard_month'); setFKAM(''); setFRH(''); setFBank(''); setFCompany(''); setFDate(''); setFCustomer(''); setFRef(''); }}>
            Clear Filters
          </button>
          <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={handleMgmtExport}>
            📊 Management Summary
          </button>
          <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => { setExpMonth(fMonth); setShowExport(true); }}>
            ⬇ Export Excel
          </button>
        </div>
      </div>

      {/* ── COLLECTION SUMMARY TABLE ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="section-title">Collection Summary</div>
            <div className="card-header-meta">
              {monthLabel(fMonth)} · <strong style={{ color: 'var(--text)' }}>{customerRows.length} customers</strong> · <strong style={{ color: 'var(--brand)', fontSize: 15 }}>{formatCrRounded(mtdTotal)}</strong>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {showAllDates && totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 13, padding: '5px 10px' }}
                  disabled={datePage === 0}
                  onClick={() => setDatePage(p => p - 1)}
                >← Prev</button>
                <span style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                  Dates {datePage * PAGE_SIZE + 1}–{Math.min((datePage + 1) * PAGE_SIZE, allDates.length)} of {allDates.length}
                </span>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 13, padding: '5px 10px' }}
                  disabled={datePage >= totalPages - 1}
                  onClick={() => setDatePage(p => p + 1)}
                >Next →</button>
              </div>
            )}
            {sortDate && (
              <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setSortDate(null)}>
                ✕ Clear Sort
              </button>
            )}
            <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={() => { setShowAllDates(s => !s); setDatePage(0); setSortDate(null); }}>
              {showAllDates ? '← Show Recent' : `View All Dates (${allDates.length})`}
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 240, position: 'sticky', left: 0, background: 'var(--surface2)', zIndex: 2 }}>Customer Name</th>
                <th style={{ borderRight: '2px solid var(--border)' }}>KAM</th>
                {visibleDates.map(d => {
                  const label = new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                  const isActive = sortDate === d;
                  return (
                    <th key={d}
                      onClick={() => setSortDate(isActive ? null : d)}
                      style={{
                        textAlign: 'right', minWidth: 140, cursor: 'pointer',
                        borderRight: '2px solid var(--border)',
                        background: isActive ? 'var(--brand-subtle, #e8f0fe)' : undefined,
                        userSelect: 'none',
                      }}
                      title="Click to sort by this date"
                    >
                      {label}{isActive ? ' ↓' : ''}
                    </th>
                  );
                })}
                <th style={{ textAlign: 'right', minWidth: 155, background: 'var(--surface2)' }}>Grand Total</th>
              </tr>
            </thead>
            <tbody>
              {customerRows.map(([customer, data]) => (
                <tr key={customer}>
                  <td style={{ fontWeight: 600, position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 1, fontSize: 14 }}>{customer}</td>
                  <td style={{ color: 'var(--text2)', fontSize: 13, borderRight: '2px solid var(--border)' }}>{data.kam}</td>
                  {visibleDates.map(d => (
                    <td key={d} style={{
                      textAlign: 'right',
                      borderRight: '2px solid var(--border)',
                      color: data.byDate[d] ? 'var(--text)' : 'var(--text3)',
                      fontWeight: data.byDate[d] ? 600 : 400,
                      background: sortDate === d && data.byDate[d] ? 'var(--brand-subtle, #f0f4ff)' : undefined,
                    }}>
                      {data.byDate[d] ? formatCrRounded(data.byDate[d]) : '—'}
                    </td>
                  ))}
                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--brand)', fontSize: 14 }}>{formatCrRounded(data.total)}</td>
                </tr>
              ))}

              {customerRows.length > 0 && (
                <tr style={{ background: 'var(--surface2)' }}>
                  <td style={{ fontWeight: 800, fontSize: 14, position: 'sticky', left: 0, background: 'var(--surface2)' }}>Grand Total</td>
                  <td style={{ borderRight: '2px solid var(--border)' }} />
                  {visibleDates.map(d => (
                    <td key={d} style={{ textAlign: 'right', fontWeight: 700, borderRight: '2px solid var(--border)' }}>
                      {dateTotals[d] ? formatCrRounded(dateTotals[d]) : '—'}
                    </td>
                  ))}
                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--brand)', fontSize: 15 }}>{formatCrRounded(mtdTotal)}</td>
                </tr>
              )}

              {customerRows.length === 0 && (
                <tr><td colSpan={visibleDates.length + 3} style={{ textAlign: 'center', padding: 48, color: 'var(--text3)', fontSize: 14 }}>
                  No collection data for selected filters
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── KAM-WISE COLLECTION ── */}
      {kamRows.length > 0 && (
        <div className="card" style={{ padding: '18px 22px' }}>
          <div className="section-title" style={{ marginBottom: 14 }}>KAM-wise Collection</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 8 }}>
            {kamRows.map(([kam, amt]) => (
              <div key={kam} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>{kam}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--brand)', marginLeft: 12, whiteSpace: 'nowrap' }}>{formatCrRounded(amt)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── COMPANY-WISE COLLECTION ── */}
      {(() => {
        const companies = ['Zast', 'Transin'];
        const rows = companies.map(c => ({
          company: c,
          total: sumExact(filtered.filter(t => t.company === c).map(t => t.amount)),
          count: filtered.filter(t => t.company === c).length,
        })).filter(r => r.total > 0);
        if (!rows.length) return null;
        return (
          <div className="card" style={{ padding: '18px 22px' }}>
            <div className="section-title" style={{ marginBottom: 16 }}>Company-wise Collection</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {rows.map(r => (
                <div key={r.company} style={{ padding: '16px 20px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.company}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3, marginBottom: 8 }}>{r.count} transactions</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--brand)', wordBreak: 'break-word' }}>{formatCrRounded(r.total)}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── BANK-WISE COLLECTION ── */}
      {(() => {
        const banks = ['HDFC', 'Axis', 'Kotak', 'Kotak Escrow', 'ICICI'];
        const rows = banks.map(b => ({
          bank: b,
          total: sumExact(filtered.filter(t => t.bank === b).map(t => t.amount)),
          count: filtered.filter(t => t.bank === b).length,
        })).filter(r => r.total > 0);
        if (!rows.length) return null;
        return (
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
              <div className="section-title">Bank-wise Collection</div>
              <div className="card-header-meta">{rows.length} banks · <strong style={{ color: 'var(--brand)' }}>{formatCrRounded(sumExact(rows.map(r => r.total)))}</strong> total</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    {rows.map(r => (
                      <th key={r.bank} style={{ textAlign: 'center', minWidth: 180 }}>{r.bank}</th>
                    ))}
                    <th style={{ textAlign: 'right', minWidth: 180, background: 'var(--surface2)' }}>Grand Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {rows.map(r => (
                      <td key={r.bank} style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--brand)', wordBreak: 'break-word' }}>{formatCrRounded(r.total)}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{r.count} txns</div>
                      </td>
                    ))}
                    <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 14, color: 'var(--brand)', wordBreak: 'break-word' }}>
                      {formatCrRounded(sumExact(rows.map(r => r.total)))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ── EXPORT MODAL ── */}
      {showExport && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowExport(false); setExpBank(''); setExpCompany(''); } }}>
          <div className="card" style={{ padding: 30, width: 440, position: 'relative' }}>
            <button onClick={() => { setShowExport(false); setExpBank(''); setExpCompany(''); }} title="Close" style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)', lineHeight: 1, padding: 4 }}>✕</button>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 22 }}>Export to Excel</h3>

            <div style={{ marginBottom: 16 }}>
              <div className="filter-label">Month</div>
              <select value={expMonth} onChange={e => setExpMonth(e.target.value)} style={{ width: '100%' }}>
                <option value="">All Months</option>
                {availableMonths.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
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
              <button className="btn btn-secondary" onClick={() => { setShowExport(false); setExpBank(''); setExpCompany(''); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleExport}>⬇ Download Excel</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
