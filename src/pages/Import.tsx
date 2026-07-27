import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useTransactions } from '../context/TransactionsContext';
import { useRules } from '../context/RulesContext';
import { useAuth } from '../context/AuthContext';
import { useCustomers } from '../context/CustomersContext';
import {
  matchNarration,
  detectColumns,
  smartIsCreditRow,
  smartParseAmount,
  smartGetNarration,
  smartGetRefNo,
  smartParseDate,
} from '../utils/ruleEngine';
import type { DetectedColumns, ColumnOverride } from '../utils/ruleEngine';
import { formatCr } from '../utils/formatters';
import { apiTransactions, apiBankAccounts, apiColumnOverrides } from '../api';
import type { Transaction } from '../context/TransactionsContext';

type Bank = 'HDFC' | 'Axis' | 'Kotak' | 'Kotak Escrow' | 'ICICI';
type Company = 'Zast' | 'Transin';

const BANKS: Bank[] = ['HDFC', 'Axis', 'Kotak', 'Kotak Escrow', 'ICICI'];

// ─── Bank accounts ─────────────────────────────────────────────────────────────

const DEFAULT_BANK_ACCOUNTS: Record<string, string> = {
  'HDFC-Zast': '50200016511197',
  'HDFC-Transin': '50200077318421',
  'Axis-Transin': '926030009212185',
  'Kotak-Transin': '5612066680',
  'Kotak Escrow-Transin': '5949967551',
};

// ─── Column overrides ──────────────────────────────────────────────────────────

// ─── CSV parser ────────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, '').split('\n');

  // Find real header row — look for the line with the most comma-separated fields
  // that contains at least one recognisable banking keyword
  const BANK_KW = ['date', 'narration', 'description', 'particulars', 'deposit', 'credit',
    'withdrawal', 'debit', 'amount', 'balance', 'reference', 'cheque', 'utr', 'flag', 'falg'];
  let headerIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const lower = lines[i].toLowerCase();
    const score = BANK_KW.filter(kw => lower.includes(kw)).length;
    if (score > bestScore) { bestScore = score; headerIdx = i; }
    if (score >= 3) break;
  }

  const rawHeaders = lines[headerIdx].split(',').map(h => h.replace(/"/g, '').trim());
  const dataLines = lines.slice(headerIdx + 1).filter(l => l.trim() && l.trim() !== ',');

  return dataLines.map(line => {
    // Simple CSV split that respects quoted fields
    const vals: string[] = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    vals.push(cur.trim());
    const row: Record<string, string> = {};
    rawHeaders.forEach((h, i) => { if (h) row[h] = vals[i] ?? ''; });
    return row;
  }).filter(r => Object.values(r).some(v => v !== ''));
}

// ─── XLSX parser ───────────────────────────────────────────────────────────────

function parseXLSX(buffer: ArrayBuffer): Record<string, string>[] {
  // cellDates:false keeps dates as serial numbers; raw:false + dateNF formats them as
  // "yyyy-mm-dd" strings — completely avoids JS Date UTC/local timezone shift in IST.
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const fmtRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
  // Second pass with raw:true to recover exact integer values for large ref-no columns.
  // SheetJS raw:false formats 12-digit integers as "6.06053E+11" — different ref nos can
  // produce the same string, causing false duplicate detection. raw:true gives the exact number.
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: true });

  const BANK_KW = ['date', 'narration', 'description', 'particulars', 'deposit', 'credit',
    'withdrawal', 'debit', 'amount', 'balance', 'reference', 'cheque', 'utr', 'flag', 'falg'];
  let headerRowIdx = 0, bestScore = -1;
  for (let i = 0; i < Math.min(fmtRows.length, 25); i++) {
    const cells = (fmtRows[i] as unknown[]).map(c => String(c ?? '').toLowerCase());
    const score = BANK_KW.filter(kw => cells.some(c => c.includes(kw))).length;
    if (score > bestScore) { bestScore = score; headerRowIdx = i; }
    if (score >= 3) break;
  }

  const headers = (fmtRows[headerRowIdx] as unknown[]).map(c => String(c ?? '').trim());
  return fmtRows.slice(headerRowIdx + 1)
    .map((r, idx) => {
      const fmtCells = r as unknown[];
      const rawCells = (rawRows[headerRowIdx + 1 + idx] as unknown[] | undefined) ?? [];
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        if (!h) return;
        const fmt = String(fmtCells[i] ?? '').trim();
        const raw = rawCells[i];
        // Integer numeric cells formatted as scientific notation have lost precision.
        // Recover exact value from the raw pass (safe because Excel stores ≤15-digit integers exactly).
        if (typeof raw === 'number' && Number.isInteger(raw) && /[eE]/i.test(fmt)) {
          obj[h] = String(raw);
        } else {
          obj[h] = fmt;
        }
      });
      return obj;
    })
    .filter(r => Object.values(r).some(v => v !== ''));
}

// ─── Extract UTR from narration (Axis Bank: no dedicated ref column) ──────────

function extractRefFromNarration(narration: string): string {
  const n = narration.toUpperCase();
  // NEFT/DEUTH00612812844/... — UTR is the token immediately after NEFT/
  const neft = n.match(/\bNEFT\/([A-Z0-9]{10,25})\//);
  if (neft) return neft[1];
  // INB/RTGS/UTIBR62026050675174999/... or RTGS/HDFCR52026051256822904/...
  const rtgs = n.match(/(?:INB\/)?RTGS\/([A-Z0-9]{10,25})\//);
  if (rtgs) return rtgs[1];
  // IFT/CB0130470018/... — ref is the token immediately after IFT/
  const ift = n.match(/\bIFT\/([A-Z0-9]{6,20})\//);
  if (ift) return ift[1];
  // ACH/CR/.../NACH/SELCR1234567/... — use the SELCR settlement ref
  const ach = n.match(/\bSELCR([A-Z0-9]+)/);
  if (ach) return 'SELCR' + ach[1];
  // ACH/CR/0001261500001007/... — fallback: use the numeric mandate ref
  const achNum = n.match(/\bACH\/(?:CR|DR)\/([0-9]{10,})\//);
  if (achNum) return achNum[1];
  return '';
}

// ─── Preview row type ──────────────────────────────────────────────────────────

interface PreviewRow {
  date: string; narration: string; refNo: string; amount: number;
  customer: string; matched: boolean; excluded: boolean; excludeReason?: string;
  duplicate?: boolean;
  fuzzyCustomer?: string;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function Import() {
  const { transactions, replaceByBankMonth, clearByBankMonth } = useTransactions();
  const { customers } = useCustomers();
  const { rules, excludePatterns, companyScopedExcludes } = useRules();
  const { user } = useAuth();

  const [bank, setBank]       = useState<Bank>('HDFC');
  const [company, setCompany] = useState<Company>('Transin');
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [done, setDone]       = useState<{ matched: number; review: number; duplicates: number; excluded: number } | null>(null);
  const [fixingKam, setFixingKam] = useState(false);
  const [fixResult, setFixResult] = useState<number | null>(null);
  const [registrySearch, setRegistrySearch] = useState('');
  const [diagLoading, setDiagLoading] = useState(false);
  const [diag, setDiag] = useState<{
    notInMaster: { customer: string; txn_count: string }[];
    masterBlank: { name: string; kam: string; rh: string; txn_count: string }[];
    fixedCount: number;
  } | null>(null);
  const [showDiag, setShowDiag] = useState(false);
  const [detectedCols, setDetectedCols] = useState<DetectedColumns>({});
  const [parseStats, setParseStats] = useState<{ debits: number; summary: number; total: number } | null>(null);

  // Clear section
  const [clearBank, setClearBank]       = useState<Bank>('HDFC');
  const [clearMonth, setClearMonth]     = useState('');
  const [clearCompany, setClearCompany] = useState<Company | ''>('');
  const [clearDate, setClearDate]       = useState('');

  // Bank accounts
  const [bankAccounts, setBankAccounts] = useState<Record<string, string>>(DEFAULT_BANK_ACCOUNTS);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue]   = useState('');
  const [addBank, setAddBank]       = useState('');
  const [addCompany, setAddCompany] = useState('');
  const [addAccount, setAddAccount] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  // Column overrides
  const [allOverrides, setAllOverrides] = useState<Record<string, ColumnOverride>>({});
  const [showOverride, setShowOverride] = useState(false);
  const override: ColumnOverride = allOverrides[bank] ?? {};

  useEffect(() => {
    apiBankAccounts.getAll().then(map => {
      if (Object.keys(map).length > 0) setBankAccounts(map);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    apiColumnOverrides.getAll().then(map => setAllOverrides(map as Record<string, ColumnOverride>)).catch(() => {});
  }, []);

  function setOverrideField(field: keyof ColumnOverride, value: string) {
    const next = { ...allOverrides, [bank]: { ...(allOverrides[bank] ?? {}), [field]: value } };
    setAllOverrides(next);
    apiColumnOverrides.save(next as Record<string, Record<string, string>>).catch(() => {});
  }
  function resetOverride() {
    const next = { ...allOverrides };
    delete next[bank];
    setAllOverrides(next);
    apiColumnOverrides.save(next as Record<string, Record<string, string>>).catch(() => {});
  }
  const hasOverride = Object.values(override).some(v => v);

  // Bank accounts helpers
  function updateBankAccounts(next: Record<string, string>) {
    setBankAccounts(next);
    apiBankAccounts.save(next).catch(() => {});
  }
  function handleEditSave(key: string) {
    if (!editValue.trim()) return;
    updateBankAccounts({ ...bankAccounts, [key]: editValue.trim() });
    setEditingKey(null); setEditValue('');
  }
  function handleDelete(key: string) {
    if (!window.confirm(`Remove account "${key}"?`)) return;
    const next = { ...bankAccounts }; delete next[key]; updateBankAccounts(next);
  }
  function handleAdd() {
    if (!addBank.trim() || !addCompany.trim() || !addAccount.trim()) return;
    updateBankAccounts({ ...bankAccounts, [`${addBank.trim()}-${addCompany.trim()}`]: addAccount.trim() });
    setAddBank(''); setAddCompany(''); setAddAccount(''); setShowAddForm(false);
  }

  const availableMonths = Array.from(
    new Set(transactions.filter(t => t.bank === clearBank && (!clearCompany || t.company === clearCompany)).map(t => t.date.slice(0, 7)))
  ).sort().reverse();

  const availableDates = useMemo(() => {
    if (!clearMonth) return [];
    return [...new Set(
      transactions
        .filter(t => t.bank === clearBank && t.date.startsWith(clearMonth) && (!clearCompany || t.company === clearCompany))
        .map(t => t.date)
    )].sort();
  }, [transactions, clearBank, clearMonth, clearCompany]);

  // ── Import Registry (derived from transactions) ───────────────────────────
  const importRegistry = useMemo(() => {
    const map: Record<string, {
      bank: string; company: string; month: string;
      count: number; total: number;
      minDate: string; maxDate: string; importedAt: string;
    }> = {};
    for (const t of transactions) {
      const month = t.date.slice(0, 7);
      const key = `${t.bank}||${t.company}||${month}`;
      if (!map[key]) {
        map[key] = { bank: t.bank, company: t.company, month, count: 0, total: 0, minDate: t.date, maxDate: t.date, importedAt: t.createdAt };
      }
      map[key].count++;
      map[key].total += t.amount;
      if (t.date < map[key].minDate) map[key].minDate = t.date;
      if (t.date > map[key].maxDate) map[key].maxDate = t.date;
      if (t.createdAt > map[key].importedAt) map[key].importedAt = t.createdAt;
    }
    return Object.values(map).sort((a, b) =>
      b.month.localeCompare(a.month) || a.bank.localeCompare(b.bank) || a.company.localeCompare(b.company)
    );
  }, [transactions]);

  // Group registry by month for display
  const registryByMonth = useMemo(() => {
    const months: Record<string, typeof importRegistry> = {};
    for (const entry of importRegistry) {
      if (!months[entry.month]) months[entry.month] = [];
      months[entry.month].push(entry);
    }
    return months;
  }, [importRegistry]);

  const registryMonths = Object.keys(registryByMonth).sort().reverse();

  function fmtMonth(m: string) {
    const [yr, mo] = m.split('-');
    return new Date(Number(yr), Number(mo) - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  }
  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function fmtImportedAt(iso: string) {
    return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } as Intl.DateTimeFormatOptions);
  }
  function fmtAmt(n: number) {
    if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
    if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
    return `₹${n.toLocaleString('en-IN')}`;
  }

  const accountKey = `${bank}-${company}`;
  const accountNo  = bankAccounts[accountKey] || '';

  // ── File handler ─────────────────────────────────────────────────────────────

  async function handleFile(file: File) {
    setDone(null);
    const ext = file.name.split('.').pop()?.toLowerCase();
    let rows: Record<string, string>[] = [];

    if (ext === 'csv') {
      rows = parseCSV(await file.text());
    } else {
      rows = parseXLSX(await file.arrayBuffer());
    }

    if (!rows.length) { alert('No data rows found in this file.'); return; }

    // Detect columns from first row's keys
    const cols = detectColumns(Object.keys(rows[0]));
    setDetectedCols(cols);

    // Narration patterns that indicate a bank summary/total row — never a real transaction
    const SUMMARY_ROW = /transaction\s+total|opening\s+balance|closing\s+balance|total\s+dr|total\s+cr|grand\s+total|brought\s+forward|carried\s+forward|balance\s+b\/f|balance\s+c\/f|^closing\s+bal|^opening\s+bal|sweep\s+in|sweep\s+out|trf\s+from\s+saving|trf\s+to\s+saving|auto\s+sweep|reverse\s+sweep|balance\s+transfer|bal\s+trf/i;

    const dedupeKey = (date: string, amount: number, narration: string, refNo: string) =>
      refNo.trim() ? refNo.trim() : `${date}|${amount}|${narration.slice(0, 40)}`;

    // Keys already in the model for this bank (will be replaced, so check within-batch only)
    const batchSeen = new Set<string>();

    let debitCount = 0, summaryCount = 0;
    const previewed: PreviewRow[] = [];
    for (const row of rows) {
      if (!smartIsCreditRow(row, cols, override)) { debitCount++; continue; }
      const amount = smartParseAmount(row, cols, override);
      if (amount <= 0) { debitCount++; continue; }
      const narration = smartGetNarration(row, cols, override);
      if (SUMMARY_ROW.test(narration)) { summaryCount++; continue; }
      const rawRef  = smartGetRefNo(row, cols, override);
      const refNo   = rawRef || extractRefFromNarration(narration);
      const dateRaw = override.date
        ? (row[override.date] ?? '')
        : (cols.date ? (row[cols.date] ?? '') : '');
      const date = smartParseDate(dateRaw);
      const key  = dedupeKey(date, amount, narration, refNo);
      const isDuplicate = batchSeen.has(key);
      if (!isDuplicate) batchSeen.add(key);
      const result = matchNarration(narration, rules, excludePatterns, companyScopedExcludes, company);
      // Kotak+Transin only: NACH-TRE-CR-RFU... narrations are ambiguous between
      // Epsilon Carbon and Hindustan Pencils — flag for manual verification
      const isKotakNachAmb = bank === 'Kotak' && company === 'Transin' && /NACH-TRE-CR-RFU/i.test(narration);
      previewed.push({
        date, narration, refNo, amount,
        fuzzyCustomer: isKotakNachAmb && !result.matched
          ? 'Epsilon Carbon Pvt Limited / Hindustan Pencils Private Limited'
          : result.fuzzyCustomer,
        customer: result.customer || '',
        matched: result.matched,
        excluded: result.excluded || false,
        excludeReason: result.excludeReason,
        duplicate: isDuplicate,
      });
    }

    setParseStats({ debits: debitCount, summary: summaryCount, total: rows.length });
    setPreview(previewed);
  }

  // ── Confirm import ────────────────────────────────────────────────────────────

  async function confirmImport() {
    if (!preview) return;
    setImporting(true);
    let matched = 0, review = 0, excluded = 0, duplicates = 0;
    const toAdd: Transaction[] = [];

    // Build a seen-set from transactions already in the DB for this bank+company
    // covering all months present in the incoming file — prevents cross-file duplicates
    const incomingMonths = [...new Set(
      preview
        .filter(r => !r.duplicate && !r.excluded)
        .map(r => r.date.slice(0, 7))
        .filter(Boolean)
    )];
    const dbSeen = new Set<string>();
    for (const month of incomingMonths) {
      try {
        const existing = await apiTransactions.getAll({ bank, company, month });
        for (const t of existing) {
          const key = t.ref_no?.trim()
            ? t.ref_no.trim()
            : `${t.date}|${t.amount}|${t.narration.slice(0, 40)}`;
          dbSeen.add(key);
        }
      } catch { /* non-fatal — proceed without DB dedup for this month */ }
    }

    for (const row of preview) {
      if (row.duplicate) { duplicates++; continue; }
      if (row.excluded) { excluded++; continue; }
      // Check against existing DB transactions
      const dedupeKey = row.refNo?.trim()
        ? row.refNo.trim()
        : `${row.date}|${row.amount}|${row.narration.slice(0, 40)}`;
      if (dbSeen.has(dedupeKey)) { duplicates++; continue; }
      dbSeen.add(dedupeKey); // also dedup within this batch against itself
      const customer = customers.find(c => c.name.toLowerCase() === row.customer.toLowerCase());
      const status = row.matched ? 'matched' : 'manual_review';
      if (row.matched) matched++; else review++;
      toAdd.push({
        id: `T${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date: row.date, customer: row.customer, bank, account: accountNo, company,
        amount: row.amount, refNo: row.refNo, narration: row.narration,
        kam: customer?.kam || '', rh: customer?.rh || '',
        status, adviseStatus: 'pending', createdAt: new Date().toISOString(),
        ...(row.fuzzyCustomer ? { fuzzyHint: row.fuzzyCustomer } : {}),
      });
    }

    const months = [...new Set(toAdd.map(t => t.date.slice(0, 7)))];
    if (toAdd.length > 0) {
      await replaceByBankMonth(bank, months, toAdd, company);
    }
    apiTransactions.fixKamRh().catch(() => {});
    setDone({ matched, review, duplicates, excluded });
    setPreview(null);
    setParseStats(null);
    setImporting(false);
  }

  async function handleFixKamRh() {
    setFixingKam(true);
    setFixResult(null);
    try {
      const res = await apiTransactions.fixKamRh();
      setFixResult(res.updated);
    } finally {
      setFixingKam(false);
    }
  }

  async function handleDiagnostic() {
    setDiagLoading(true);
    try {
      const result = await apiTransactions.kamRhDiagnostic();
      setDiag(result);
      setShowDiag(true);
    } finally {
      setDiagLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {importing && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 16,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            border: '5px solid rgba(255,255,255,0.2)',
            borderTopColor: '#fff',
            animation: 'spin 0.8s linear infinite',
          }} />
          <div style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>Importing transactions…</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Please wait, do not close this page</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760 }}>

      {/* ── Import card ── */}
      <div className="card" style={{ padding: 24 }}>
        <h2 className="page-heading" style={{ marginBottom: 22 }}>Import Bank Statement</h2>

        {/* Step 1 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 10 }}>STEP 1 — SELECT BANK</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {BANKS.map(b => (
              <button key={b} onClick={() => { setBank(b); setPreview(null); setParseStats(null); }} className={`btn ${bank === b ? 'btn-primary' : 'btn-secondary'}`} style={{ fontSize: 12 }}>{b}</button>
            ))}
          </div>
        </div>

        {/* Step 2 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 10 }}>STEP 2 — SELECT COMPANY</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['Zast', 'Transin'] as Company[]).map(c => (
              <button key={c} onClick={() => setCompany(c)} className={`btn ${company === c ? 'btn-primary' : 'btn-secondary'}`} style={{ fontSize: 12 }}>{c}</button>
            ))}
          </div>
          {accountNo && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text3)' }}>Account: {accountNo}</div>}
        </div>

        {/* Step 3 */}
        <div style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 10 }}>STEP 3 — UPLOAD FILE</label>
          <div style={{ border: '2px dashed var(--border)', borderRadius: 10, padding: 24, textAlign: 'center', background: 'var(--surface2)' }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>📂</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>Drag & drop or click to browse</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>Supports any bank format — CSV, XLS, XLSX</div>
            <input type="file" accept=".csv,.xls,.xlsx" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
          </div>
        </div>
      </div>

      {/* ── Column Mapping Override ── */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="section-title">
              Column Mapping Override
              {hasOverride && <span className="badge badge-yellow" style={{ marginLeft: 8, fontSize: 11 }}>Active for {bank}</span>}
            </div>
            <div className="card-header-meta">Only needed if auto-detection fails for this bank's format</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {hasOverride && <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={resetOverride}>Reset to Auto</button>}
            <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setShowOverride(s => !s)}>
              {showOverride ? 'Hide ▲' : 'Configure ▼'}
            </button>
          </div>
        </div>

        {showOverride && (
          <div style={{ marginTop: 18 }}>
            {/* Auto-detected columns info */}
            {Object.keys(detectedCols).length > 0 && (
              <div style={{ marginBottom: 14, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text2)' }}>
                <strong style={{ color: 'var(--text)' }}>Auto-detected from last file: </strong>
                {Object.entries(detectedCols).map(([role, col]) => (
                  <span key={role} style={{ marginRight: 12 }}>{role}: <code style={{ fontSize: 11 }}>{col}</code></span>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {([
                { field: 'date',        label: 'Date Column',           placeholder: 'e.g. Transaction Date' },
                { field: 'narration',   label: 'Narration Column',      placeholder: 'e.g. Description' },
                { field: 'amount',      label: 'Amount Column',         placeholder: 'e.g. Amount' },
                { field: 'deposit',     label: 'Deposit/Credit Column', placeholder: 'e.g. Deposit Amt' },
                { field: 'creditFlag',  label: 'CR/DR Flag Column',     placeholder: 'e.g. C.D.Falg' },
                { field: 'creditValues',label: 'Credit Values',         placeholder: 'e.g. C,CR,Credit,CREDIT' },
                { field: 'ref',         label: 'Reference Column',      placeholder: 'e.g. Reference No' },
              ] as { field: keyof ColumnOverride; label: string; placeholder: string }[]).map(({ field, label, placeholder }) => (
                <div key={field}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 5 }}>{label.toUpperCase()}</div>
                  <input
                    value={override[field] ?? ''}
                    onChange={e => setOverrideField(field, e.target.value)}
                    placeholder={placeholder}
                    style={{ width: '100%' }}
                  />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text3)' }}>
              Overrides are saved per bank. Leave a field blank to keep auto-detection for that column.
            </div>
          </div>
        )}
      </div>

      {/* ── Preview ── */}
      {preview && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="section-title">Import Preview</div>
              <div className="card-header-meta">
                <strong style={{ color: 'var(--success)' }}>{preview.filter(r => r.matched && !r.duplicate).length} matched</strong> ·&nbsp;
                <strong style={{ color: 'var(--warning)' }}>{preview.filter(r => !r.matched && !r.excluded && !r.duplicate).length} to review</strong> ·&nbsp;
                {preview.filter(r => r.excluded).length} excluded
                {preview.filter(r => r.duplicate).length > 0 && (
                  <> ·&nbsp;<strong style={{ color: 'var(--danger)' }}>{preview.filter(r => r.duplicate).length} duplicate{preview.filter(r => r.duplicate).length > 1 ? 's' : ''} — will be skipped</strong></>
                )}
                {parseStats && (
                  <> ·&nbsp;<span style={{ color: 'var(--text3)' }}>{parseStats.debits} debit{parseStats.debits !== 1 ? 's' : ''} filtered out</span></>
                )}
              </div>
              {parseStats && parseStats.debits === 0 && parseStats.total > preview.length + parseStats.summary + 5 && (
                <div style={{ marginTop: 8, padding: '7px 12px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 7, fontSize: 12, color: '#991b1b', maxWidth: 560 }}>
                  ⚠ <strong>0 debit transactions were filtered — this may indicate a column detection issue.</strong> Debit transactions could be slipping in as credits. Check the column mapping above or set manual overrides.
                </div>
              )}
              {preview.every(r => !r.refNo?.trim()) && (
                <div style={{ marginTop: 8, padding: '7px 12px', background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 7, fontSize: 12, color: '#92400e', maxWidth: 520 }}>
                  ⚠ <strong>No Reference Numbers (UTR) found in this file.</strong> Duplicate detection is based on Date + Amount + Narration only — it may miss duplicates if any of these differ slightly between entries. Verify carefully before confirming.
                </div>
              )}
              {(() => {
                const ambCount = preview.filter(r => !r.duplicate && !r.matched && /NACH-TRE-CR-RFU/i.test(r.narration)).length;
                return ambCount > 0 && bank === 'Kotak' && company === 'Transin' ? (
                  <div style={{ marginTop: 8, padding: '10px 14px', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 7, fontSize: 12, color: '#92400e', maxWidth: 560 }}>
                    ⚠ <strong>{ambCount} NACH-TRE-CR transaction{ambCount > 1 ? 's' : ''} require manual verification.</strong> These could belong to either <strong>Epsilon Carbon Pvt Limited</strong> or <strong>Hindustan Pencils Private Limited</strong> — both share the same narration pattern. Check each one carefully before confirming.
                  </div>
                ) : null;
              })()}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => { setPreview(null); setParseStats(null); }}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmImport} disabled={importing}>
                {importing ? 'Importing...' : 'Confirm Import'}
              </button>
            </div>
          </div>
          <div style={{ overflowX: 'auto', maxHeight: 400 }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Narration</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Customer</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 50).map((row, i) => (
                  <tr key={i} style={row.duplicate ? { opacity: 0.45, background: 'var(--surface2)' } : undefined}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{row.date}</td>
                    <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text2)' }}>{row.narration}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCr(row.amount)}</td>
                    <td style={{ fontSize: 12 }}>
                      {row.customer || (row.fuzzyCustomer ? <span style={{ color: 'var(--warning, #a16207)', fontStyle: 'italic' }}>~{row.fuzzyCustomer}</span> : '—')}
                    </td>
                    <td>
                      {row.duplicate && <span className="badge badge-red">Duplicate — skipped</span>}
                      {!row.duplicate && row.excluded  && <span className="badge badge-gray">Excluded</span>}
                      {!row.duplicate && !row.excluded && row.matched  && <span className="badge badge-green">Matched</span>}
                      {!row.duplicate && !row.excluded && !row.matched && row.fuzzyCustomer && <span className="badge badge-yellow" title={`Possible: ${row.fuzzyCustomer}`}>Fuzzy → Review</span>}
                      {!row.duplicate && !row.excluded && !row.matched && !row.fuzzyCustomer && <span className="badge badge-yellow">Review</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 50 && <div style={{ padding: 12, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>Showing first 50 of {preview.length} rows</div>}
          </div>
        </div>
      )}

      {/* ── Clear Data ── */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ marginBottom: 18 }}>
          <div className="section-title">Clear Existing Data</div>
          <div className="card-header-meta">Remove all transactions for a specific bank and month</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>BANK</label>
            <select value={clearBank} onChange={e => { setClearBank(e.target.value as Bank); setClearMonth(''); setClearDate(''); }} style={{ minWidth: 140 }}>
              {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>COMPANY</label>
            <select value={clearCompany} onChange={e => { setClearCompany(e.target.value as Company | ''); setClearMonth(''); setClearDate(''); }} style={{ minWidth: 130 }}>
              <option value="">All Companies</option>
              {(['Zast', 'Transin'] as Company[]).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>MONTH</label>
            <select value={clearMonth} onChange={e => { setClearMonth(e.target.value); setClearDate(''); }} style={{ minWidth: 160 }}>
              <option value="">— Select month —</option>
              {availableMonths.map(m => {
                const count = transactions.filter(t => t.bank === clearBank && t.date.slice(0, 7) === m && (!clearCompany || t.company === clearCompany)).length;
                const [yr, mo] = m.split('-');
                const label = new Date(Number(yr), Number(mo) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
                return <option key={m} value={m}>{label} ({count} txns)</option>;
              })}
              {availableMonths.length === 0 && <option disabled>No data for this bank{clearCompany ? ` / ${clearCompany}` : ''}</option>}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>
              DATE <span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: 11 }}>(optional)</span>
            </label>
            <select value={clearDate} onChange={e => setClearDate(e.target.value)} style={{ minWidth: 150 }} disabled={!clearMonth}>
              <option value="">All dates in month</option>
              {availableDates.map(d => {
                const count = transactions.filter(t => t.bank === clearBank && t.date === d && (!clearCompany || t.company === clearCompany)).length;
                return <option key={d} value={d}>{d} ({count} txns)</option>;
              })}
            </select>
          </div>
          <button className="btn btn-danger" disabled={!clearMonth} onClick={() => {
            if (!clearMonth) return;
            const [yr, mo] = clearMonth.split('-');
            const monthLabel = new Date(Number(yr), Number(mo) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
            const count = transactions.filter(t =>
              t.bank === clearBank &&
              t.date.slice(0, 7) === clearMonth &&
              (!clearCompany || t.company === clearCompany) &&
              (!clearDate || t.date === clearDate)
            ).length;
            const companyLabel = clearCompany ? ` (${clearCompany})` : '';
            const scopeLabel = clearDate ? ` on ${clearDate}` : ` for ${monthLabel}`;
            if (window.confirm(`Remove ${count} ${clearBank}${companyLabel} transaction${count !== 1 ? 's' : ''}${scopeLabel}?`)) {
              clearByBankMonth(clearBank, clearMonth, clearCompany || undefined, clearDate || undefined);
              setClearMonth('');
              setClearDate('');
            }
          }}>{clearDate ? `Clear ${clearDate}` : 'Clear Data'}</button>
        </div>
      </div>

      {/* ── Bank Accounts ── */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <div className="section-title">Bank Accounts</div>
            <div className="card-header-meta">Manage bank–company account mappings</div>
          </div>
          <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => setShowAddForm(s => !s)}>+ Add Account</button>
        </div>

        {showAddForm && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, padding: 14, background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 5 }}>BANK</div>
              <input value={addBank} onChange={e => setAddBank(e.target.value)} placeholder="e.g. HDFC" style={{ width: 120 }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 5 }}>COMPANY</div>
              <select value={addCompany} onChange={e => setAddCompany(e.target.value)} style={{ width: 120 }}>
                <option value="">— Select —</option>
                <option value="Zast">Zast</option>
                <option value="Transin">Transin</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 5 }}>ACCOUNT NUMBER</div>
              <input value={addAccount} onChange={e => setAddAccount(e.target.value)} placeholder="Account No." style={{ width: 180 }} />
            </div>
            <button className="btn btn-primary" style={{ fontSize: 13 }} disabled={!addBank.trim() || !addCompany || !addAccount.trim()} onClick={handleAdd}>Save</button>
            <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={() => { setShowAddForm(false); setAddBank(''); setAddCompany(''); setAddAccount(''); }}>Cancel</button>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Bank</th><th>Company</th><th>Account Number</th><th>Actions</th></tr></thead>
            <tbody>
              {Object.entries(bankAccounts).map(([key, accNo]) => {
                const [b, ...rest] = key.split('-');
                const c = rest.join('-');
                return (
                  <tr key={key}>
                    <td style={{ fontWeight: 600 }}>{b}</td>
                    <td><span className="badge badge-blue">{c}</span></td>
                    <td>
                      {editingKey === key
                        ? <input value={editValue} onChange={e => setEditValue(e.target.value)} style={{ width: 200 }} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleEditSave(key); if (e.key === 'Escape') setEditingKey(null); }} />
                        : <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{accNo}</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {editingKey === key ? (
                          <>
                            <button className="btn btn-primary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => handleEditSave(key)}>Save</button>
                            <button className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => setEditingKey(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => { setEditingKey(key); setEditValue(accNo); }}>Edit</button>
                            <button className="btn btn-danger" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => handleDelete(key)}>Delete</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Import Registry ── */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="section-title">Import Registry</div>
            <div className="card-header-meta">Bank statement files currently loaded in the system — grouped by month</div>
          </div>
          <input
            value={registrySearch}
            onChange={e => setRegistrySearch(e.target.value)}
            placeholder="Search bank, company, month…"
            style={{ minWidth: 220, fontSize: 13 }}
          />
        </div>

        {registryMonths.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--text3)', fontSize: 14 }}>
            No transactions imported yet.
          </div>
        ) : (() => {
          const q = registrySearch.trim().toLowerCase();
          const filteredMonths = registryMonths.filter(month => {
            if (!q) return true;
            if (fmtMonth(month).toLowerCase().includes(q) || month.includes(q)) return true;
            return registryByMonth[month].some(e =>
              e.bank.toLowerCase().includes(q) || e.company.toLowerCase().includes(q)
            );
          });
          const filteredByMonth = (month: string) => {
            if (!q) return registryByMonth[month];
            return registryByMonth[month].filter(e =>
              e.bank.toLowerCase().includes(q) ||
              e.company.toLowerCase().includes(q) ||
              fmtMonth(month).toLowerCase().includes(q) ||
              month.includes(q)
            );
          };
          return filteredMonths.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 20px', color: 'var(--text3)', fontSize: 13 }}>
              No results for "{registrySearch}"
            </div>
          ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {filteredMonths.map(month => (
              <div key={month}>
                {/* Month heading */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{fmtMonth(month)}</div>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                    {filteredByMonth(month).reduce((a, e) => a + e.count, 0)} transactions total
                  </div>
                </div>

                {/* Cards grid for this month */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                  {filteredByMonth(month).map(entry => (
                    <div key={`${entry.bank}||${entry.company}`} style={{
                      border: '1px solid #bbf7d0', borderLeft: '4px solid #22c55e',
                      borderRadius: 10, padding: '14px 16px', background: '#f0fdf4',
                      display: 'flex', flexDirection: 'column', gap: 6,
                    }}>
                      {/* Header row */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: '#15803d' }}>{entry.bank}</span>
                          <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 999, background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', fontWeight: 600 }}>
                            {entry.company}
                          </span>
                        </div>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#22c55e', color: '#fff', fontWeight: 700 }}>
                          ✓ Present
                        </span>
                      </div>

                      {/* Stats */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                        <div style={{ background: '#fff', borderRadius: 6, padding: '8px 10px', border: '1px solid #bbf7d0' }}>
                          <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, marginBottom: 2 }}>TRANSACTIONS</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: '#15803d' }}>{entry.count}</div>
                        </div>
                        <div style={{ background: '#fff', borderRadius: 6, padding: '8px 10px', border: '1px solid #bbf7d0' }}>
                          <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, marginBottom: 2 }}>TOTAL AMOUNT</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#15803d' }}>{fmtAmt(entry.total)}</div>
                        </div>
                      </div>

                      {/* Date range */}
                      <div style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>
                        <span style={{ fontWeight: 600 }}>Date range:</span> {fmtDate(entry.minDate)} — {fmtDate(entry.maxDate)}
                      </div>

                      {/* Imported at */}
                      <div style={{ fontSize: 11, color: '#6b7280' }}>
                        <span style={{ fontWeight: 600 }}>Last imported:</span> {fmtImportedAt(entry.importedAt)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          );
        })()}
      </div>

      {/* ── Fix KAM / RH ── */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ marginBottom: 14 }}>
          <div className="section-title">Fix Blank KAM / RH</div>
          <div className="card-header-meta">
            Updates transactions where KAM or RH is blank but the customer exists in the Customer Master with KAM/RH assigned
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <button className="btn btn-primary" disabled={fixingKam} onClick={handleFixKamRh} style={{ fontSize: 13 }}>
            {fixingKam ? 'Fixing…' : 'Fix KAM / RH'}
          </button>
          <button className="btn btn-secondary" disabled={diagLoading} onClick={handleDiagnostic} style={{ fontSize: 13 }}>
            {diagLoading ? 'Checking…' : 'Diagnose Issues'}
          </button>
          {fixResult !== null && (
            <span style={{ fontSize: 13, color: fixResult > 0 ? '#15803d' : 'var(--text3)', fontWeight: 600 }}>
              {fixResult > 0
                ? `✓ Updated ${fixResult} transaction${fixResult !== 1 ? 's' : ''}`
                : '✓ All fixable transactions already updated'}
            </span>
          )}
        </div>

        {showDiag && diag && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 4 }}>

            {/* Summary chips */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ padding: '8px 14px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: '#15803d' }}>{diag.fixedCount}</span>
                <span style={{ color: '#15803d', marginLeft: 6 }}>transactions with KAM/RH assigned</span>
              </div>
              {diag.notInMaster.length > 0 && (
                <div style={{ padding: '8px 14px', borderRadius: 8, background: '#fef3c7', border: '1px solid #fde68a', fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: '#92400e' }}>{diag.notInMaster.length}</span>
                  <span style={{ color: '#92400e', marginLeft: 6 }}>customers not in Customer Master</span>
                </div>
              )}
              {diag.masterBlank.length > 0 && (
                <div style={{ padding: '8px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: '#ef4444' }}>{diag.masterBlank.length}</span>
                  <span style={{ color: '#ef4444', marginLeft: 6 }}>customers in Master but KAM/RH blank there</span>
                </div>
              )}
            </div>

            {/* Group 1: Not in Customer Master */}
            {diag.notInMaster.length > 0 && (
              <div style={{ background: 'var(--surface)', border: '1px solid #fde68a', borderLeft: '4px solid #f59e0b', borderRadius: 10, padding: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#92400e', marginBottom: 6 }}>
                  Customers not found in Customer Master
                </div>
                <div style={{ fontSize: 12, color: '#92400e', marginBottom: 12 }}>
                  These customers are matched in transactions but have no entry in the Customer Master. Add them to the Customer Master with their KAM and RH, then run Fix KAM/RH again.
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#fef3c7' }}>
                        <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 600, color: '#92400e', borderBottom: '1px solid #fde68a' }}>Customer Name</th>
                        <th style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#92400e', borderBottom: '1px solid #fde68a' }}>Transactions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diag.notInMaster.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg)' }}>
                          <td style={{ padding: '7px 12px', fontWeight: 500 }}>{r.customer}</td>
                          <td style={{ padding: '7px 12px', textAlign: 'right', color: 'var(--text2)' }}>{r.txn_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Group 2: In master but KAM/RH blank */}
            {diag.masterBlank.length > 0 && (
              <div style={{ background: 'var(--surface)', border: '1px solid #fecaca', borderLeft: '4px solid #ef4444', borderRadius: 10, padding: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#ef4444', marginBottom: 6 }}>
                  Customers in Master but KAM / RH is blank in the Master
                </div>
                <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 12 }}>
                  These customers exist in the Customer Master but their KAM or RH field is empty there. Go to Settings → Customer Master and assign KAM and RH for each, then run Fix KAM/RH again.
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#fef2f2' }}>
                        <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 600, color: '#ef4444', borderBottom: '1px solid #fecaca' }}>Customer Name</th>
                        <th style={{ padding: '7px 12px', textAlign: 'center', fontWeight: 600, color: '#ef4444', borderBottom: '1px solid #fecaca' }}>KAM</th>
                        <th style={{ padding: '7px 12px', textAlign: 'center', fontWeight: 600, color: '#ef4444', borderBottom: '1px solid #fecaca' }}>RH</th>
                        <th style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#ef4444', borderBottom: '1px solid #fecaca' }}>Transactions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diag.masterBlank.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg)' }}>
                          <td style={{ padding: '7px 12px', fontWeight: 500 }}>{r.name}</td>
                          <td style={{ padding: '7px 12px', textAlign: 'center', color: r.kam ? 'var(--text)' : '#ef4444' }}>{r.kam || '— blank —'}</td>
                          <td style={{ padding: '7px 12px', textAlign: 'center', color: r.rh ? 'var(--text)' : '#ef4444' }}>{r.rh || '— blank —'}</td>
                          <td style={{ padding: '7px 12px', textAlign: 'right', color: 'var(--text2)' }}>{r.txn_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {diag.notInMaster.length === 0 && diag.masterBlank.length === 0 && (
              <div style={{ padding: '16px 20px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, fontSize: 13, color: '#15803d', fontWeight: 600 }}>
                ✓ No issues found — all matched customers have KAM and RH assigned.
              </div>
            )}

            <button onClick={() => setShowDiag(false)} style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Hide diagnostic
            </button>
          </div>
        )}

        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text3)' }}>
          Run <strong>Diagnose Issues</strong> to see why customers are showing blank KAM/RH. Fix the Customer Master in Settings, then run <strong>Fix KAM/RH</strong> to update all transactions.
        </div>
      </div>

      {/* ── Result ── */}
      {done && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 18, color: 'var(--success)' }}>✓ Import Complete</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { label: 'Matched',          val: done.matched,    bg: '#dcfce7', color: '#15803d' },
              { label: 'Sent to Review',   val: done.review,     bg: '#fef9c3', color: '#a16207' },
              { label: 'Duplicates Skipped', val: done.duplicates, bg: '#fee2e2', color: '#dc2626' },
              { label: 'Excluded',         val: done.excluded,   bg: 'var(--surface2)', color: 'var(--text2)' },
            ].map(({ label, val, bg, color }) => (
              <div key={label} style={{ textAlign: 'center', padding: '20px 16px', background: bg, borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 32, fontWeight: 800, color }}>{val}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color, marginTop: 6 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      </div>
    </>
  );
}
