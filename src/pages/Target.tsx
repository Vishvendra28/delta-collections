import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';
import { useTransactions } from '../context/TransactionsContext';
import { useCustomers } from '../context/CustomersContext';
import { useTarget, type TargetRow, type TargetMeta } from '../context/TargetContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PeriodStats {
  period: 1 | 2 | 3;
  label: string;
  origTarget: number;
  carryForward: number;
  effectiveTarget: number;
  actual: number;
  gap: number;
  achievePct: number;
}

interface CustStat {
  customer: string;
  target: number;
  actual: number;
  remaining: number;
  pct: number;
}

interface KamData {
  kamName: string;
  meta: TargetMeta | null;
  periods: PeriodStats[];
  byPeriod: CustStat[][];
  totalTarget: number;
  totalActual: number;
  totalGap: number;
  totalPct: number;
}

type ViewTab = 'performance' | 'summary' | 'kamview' | 'risk';
type PeriodView = '10day' | '20day-p1p2' | '20day-p2p3';

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function getMonthOptions(): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  const curYear = now.getFullYear();
  const curMo = now.getMonth();
  for (let yr = 2026; yr <= curYear; yr++) {
    const lastMo = yr < curYear ? 11 : curMo;
    for (let mo = 0; mo <= lastMo; mo++) {
      const d = new Date(yr, mo, 1);
      opts.push({ value: `${yr}-${String(mo + 1).padStart(2, '0')}`, label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) });
    }
  }
  return opts.reverse();
}

function curMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function curDay() { return new Date().getDate(); }

function prevMonthOf(m: string): string {
  const [yr, mo] = m.split('-').map(Number);
  return mo === 1 ? `${yr - 1}-12` : `${yr}-${String(mo - 1).padStart(2, '0')}`;
}

function fmtL(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`;
  return `${sign}₹${abs.toLocaleString('en-IN')}`;
}

function achieveColor(pct: number) {
  if (pct >= 90) return '#22c55e';
  if (pct >= 50) return '#f59e0b';
  return '#ef4444';
}

function statusLabel(pct: number): string {
  if (pct >= 90) return 'On Track';
  if (pct >= 50) return 'At Risk';
  return 'Critical';
}

function computeKamData(
  kamName: string,
  monthYear: string,
  rows: TargetRow[],
  meta: TargetMeta | null,
  transactions: Array<{ status: string; kam: string; date: string; customer: string; amount: number }>,
): KamData {
  const [yr, mo] = monthYear.split('-').map(Number);
  const dim = new Date(yr, mo, 0).getDate();
  const ranges: [number, number][] = [[1, 10], [11, 20], [21, dim]];

  const ktxns = transactions.filter(
    t => t.status === 'matched' && t.kam === kamName && t.date.startsWith(monthYear)
  );

  const periodAmts = (r: TargetRow) => [r.p1, r.p2, r.p3];

  let carry = 0;
  const periods: PeriodStats[] = ranges.map(([s, e], i) => {
    const origTarget = rows.reduce((a, r) => a + periodAmts(r)[i], 0);
    const effectiveTarget = origTarget + carry;
    const actual = ktxns
      .filter(t => { const d = +t.date.slice(8); return d >= s && d <= e; })
      .reduce((a, t) => a + t.amount, 0);
    const gap = effectiveTarget - actual;
    const achievePct = effectiveTarget > 0 ? (actual / effectiveTarget) * 100 : actual > 0 ? 100 : 0;
    const p: PeriodStats = { period: (i + 1) as 1 | 2 | 3, label: `${s}–${e}`, origTarget, carryForward: carry, effectiveTarget, actual, gap, achievePct };
    carry = Math.max(0, gap);
    return p;
  });

  const custs = [...new Set(rows.map(r => r.customer))];
  const byPeriod: CustStat[][] = ranges.map(([s, e], i) =>
    custs.map(customer => {
      const target = rows.filter(r => r.customer === customer).reduce((a, r) => a + periodAmts(r)[i], 0);
      if (target === 0) return null;
      const actual = ktxns.filter(t => { const d = +t.date.slice(8); return t.customer.toLowerCase() === customer.toLowerCase() && d >= s && d <= e; }).reduce((a, t) => a + t.amount, 0);
      return { customer, target, actual, remaining: Math.max(0, target - actual), pct: target > 0 ? Math.min(100, (actual / target) * 100) : actual > 0 ? 100 : 0 };
    }).filter((x): x is CustStat => x !== null).sort((a, b) => b.target - a.target)
  );

  const totalTarget = rows.reduce((a, r) => a + r.p1 + r.p2 + r.p3, 0);
  const totalActual = ktxns.reduce((a, t) => a + t.amount, 0);
  return { kamName, meta, periods, byPeriod, totalTarget, totalActual, totalGap: totalTarget - totalActual, totalPct: totalTarget > 0 ? (totalActual / totalTarget) * 100 : totalActual > 0 ? 100 : 0 };
}

function parseTargetFile(buf: ArrayBuffer, _selMonth: string): { rows: TargetRow[]; excluded: number; error: string | null } {
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const all = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', raw: false }) as string[][];
  const hi = all.findIndex(r => r.some(c => /customer|name/i.test(String(c))) && r.some(c => /\(1-10\)/i.test(String(c))));
  if (hi < 0) return { rows: [], excluded: 0, error: 'Could not detect header row. Expected: Customer Name, [Month](1-10), [Month](11-20), [Month](21-30)' };
  const hs = all[hi].map(c => String(c).toLowerCase());
  const ci = hs.findIndex(h => /customer|name/.test(h));
  const p1i = hs.findIndex(h => /\(1-10\)/.test(h));
  const p2i = hs.findIndex(h => /\(11-20\)/.test(h));
  const p3i = hs.findIndex(h => /\(21-/.test(h));
  const ti  = hs.findIndex(h => /total/.test(h));
  if (ci < 0 || p1i < 0 || p2i < 0 || p3i < 0) return { rows: [], excluded: 0, error: 'Missing columns. Need: Customer Name, [Month](1-10), [Month](11-20), [Month](21-30)' };
  const parseAmt = (v: unknown) => parseFloat(String(v ?? '').replace(/[₹,\s]/g, '')) || 0;
  const rows: TargetRow[] = [];
  let excluded = 0;
  for (let i = hi + 1; i < all.length; i++) {
    const row = all[i];
    const customer = String(row[ci] ?? '').trim();
    if (!customer || /^total/i.test(customer)) continue;
    const p1 = parseAmt(row[p1i]); const p2 = parseAmt(row[p2i]); const p3 = parseAmt(row[p3i]);
    if (p1 + p2 + p3 <= 0) { excluded++; continue; }
    rows.push({ customer, p1, p2, p3, totalAmount: ti >= 0 ? parseAmt(row[ti]) : p1 + p2 + p3 });
  }
  return { rows, excluded, error: null };
}

function parseMasterTargetFile(buf: ArrayBuffer): { kamRows: Record<string, TargetRow[]> | null; excluded: number; totalCustomers: number; kamCount: number; error: string | null } {
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const all = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', raw: false }) as string[][];
  const hi = all.findIndex(r => r.some(c => /customer|name/i.test(String(c))) && r.some(c => /kam/i.test(String(c))) && r.some(c => /\(1-10\)/i.test(String(c))));
  if (hi < 0) return { kamRows: null, excluded: 0, totalCustomers: 0, kamCount: 0, error: 'Header not found. Expected: Customer Name, KAM Name, [Month](1-10), [Month](11-20), [Month](21-30)' };
  const hs = all[hi].map(c => String(c).toLowerCase());
  const ci  = hs.findIndex(h => /customer|name/.test(h) && !/^kam/.test(h));
  const ki  = hs.findIndex(h => /^kam/.test(h));
  const p1i = hs.findIndex(h => /\(1-10\)/.test(h));
  const p2i = hs.findIndex(h => /\(11-20\)/.test(h));
  const p3i = hs.findIndex(h => /\(21-/.test(h));
  const ti  = hs.findIndex(h => /total/.test(h));
  if (ci < 0 || ki < 0 || p1i < 0 || p2i < 0 || p3i < 0) return { kamRows: null, excluded: 0, totalCustomers: 0, kamCount: 0, error: 'Missing columns. Need: Customer Name, KAM Name, [Month](1-10), [Month](11-20), [Month](21-30)' };
  const parseAmt = (v: unknown) => parseFloat(String(v ?? '').replace(/[₹,\s]/g, '')) || 0;
  const kamRows: Record<string, TargetRow[]> = {};
  let excluded = 0;
  for (let i = hi + 1; i < all.length; i++) {
    const row = all[i];
    const customer = String(row[ci] ?? '').trim();
    const kamName  = String(row[ki] ?? '').trim();
    if (!customer || !kamName || /^total/i.test(customer)) continue;
    const p1 = parseAmt(row[p1i]); const p2 = parseAmt(row[p2i]); const p3 = parseAmt(row[p3i]);
    if (p1 + p2 + p3 <= 0) { excluded++; continue; }
    if (!kamRows[kamName]) kamRows[kamName] = [];
    kamRows[kamName].push({ customer, p1, p2, p3, totalAmount: ti >= 0 ? parseAmt(row[ti]) : p1 + p2 + p3 });
  }
  const kamCount = Object.keys(kamRows).length;
  const totalCustomers = Object.values(kamRows).reduce((a, r) => a + r.length, 0);
  if (totalCustomers === 0) return { kamRows: null, excluded, totalCustomers: 0, kamCount: 0, error: 'No valid rows found. Check customer names, KAM names, and amounts.' };
  return { kamRows, excluded, totalCustomers, kamCount, error: null };
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Target() {
  const { user, demoUsers } = useAuth();
  const { transactions } = useTransactions();
  const { customers } = useCustomers();
  const { version, uploadTarget, uploadMasterTarget, deleteTarget, getTargetRows, getTargetMeta, getTargetFile } = useTarget();

  const kamUsers    = demoUsers.filter(u => u.role === 'kam' && u.kamName);
  const allKamNames = kamUsers.map(u => u.kamName!);

  const isAdmin   = user?.role === 'admin';
  const isFounder = user?.role === 'founder';
  const isRH      = user?.role === 'rh' || user?.role === 'arpm';
  const isKAM     = user?.role === 'kam';
  const isAdminView = isAdmin || isFounder;
  const myKam   = isKAM ? user.kamName ?? '' : '';

  // ─── State ─────────────────────────────────────────────────────────────────

  const [selMonth,   setSelMonth]   = useState('');
  const [selKam,     setSelKam]     = useState(() => isKAM ? myKam : 'all');
  const [activeTab,  setActiveTab]  = useState<ViewTab>('summary');
  const [expandedKam, setExpandedKam] = useState<string | null>(null);
  const [periodView, setPeriodView] = useState<PeriodView>('10day');
  const [kamViewKam, setKamViewKam] = useState(isKAM ? myKam : '');
  const [hideNoData, setHideNoData] = useState(false);
  const [showOverdueDetail, setShowOverdueDetail] = useState(false);
  const [showUploadSection, setShowUploadSection] = useState(false);

  // Summary table
  const [summarySort, setSummarySort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'shortfall', dir: 'desc' });
  const [summaryKamFilter, setSummaryKamFilter] = useState('');

  // Individual KAM upload
  const [uploadFor,    setUploadFor]    = useState('');
  const [showUpload,   setShowUpload]   = useState(false);
  const [pendingRows,  setPendingRows]  = useState<TargetRow[] | null>(null);
  const [pendingFile,  setPendingFile]  = useState<{ name: string; base64: string } | null>(null);
  const [parseError,   setParseError]   = useState('');
  const [parseWarn,    setParseWarn]    = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Master upload
  const [showMasterUpload,  setShowMasterUpload]  = useState(false);
  const [masterPendingRows, setMasterPendingRows] = useState<Record<string, TargetRow[]> | null>(null);
  const [masterPendingFile, setMasterPendingFile] = useState<{ name: string; base64: string } | null>(null);
  const [masterParseError,  setMasterParseError]  = useState('');
  const [masterParseWarn,   setMasterParseWarn]   = useState('');
  const masterFileRef = useRef<HTMLInputElement>(null);

  // Shortfall panels
  const [shortfallPanel,   setShortfallPanel]   = useState<{ kamName: string; period: 1|2|3 } | null>(null);
  const [masterShortfall,  setMasterShortfall]  = useState(false);
  const [sfSortDir,        setSfSortDir]        = useState<'desc' | 'asc'>('desc');
  const [sfKamFilter,      setSfKamFilter]      = useState('');
  const [sfRhFilter,       setSfRhFilter]       = useState('');
  const [exportWarn,       setExportWarn]       = useState(false);
  const [riskFilter,       setRiskFilter]       = useState<'all' | 'critical' | 'atrisk' | 'ontrack'>('all');
  const [showPeriodCols,   setShowPeriodCols]   = useState(false);

  const autoMonthRef = useRef(false);
  useEffect(() => {
    if (!autoMonthRef.current && transactions.length > 0) {
      autoMonthRef.current = true;
      const months = [...new Set(transactions.map(t => t.date.slice(0, 7)))].sort().reverse();
      const latest = months[0];
      if (latest) { setSelMonth(latest); localStorage.setItem('target_selMonth', latest); }
    }
  }, [transactions]);

  const monthLabel     = getMonthOptions().find(o => o.value === selMonth)?.label ?? selMonth;
  const isCurrentMonth = selMonth === curMonth();
  const uploadOverdue  = isCurrentMonth && curDay() > 7;
  const prevMonth      = useMemo(() => prevMonthOf(selMonth), [selMonth]);

  // KAM→RH mapping
  const kamRhMap = useMemo(() => {
    const cnt: Record<string, Record<string, number>> = {};
    for (const c of customers) {
      if (!c.kam || !c.rh) continue;
      if (!cnt[c.kam]) cnt[c.kam] = {};
      cnt[c.kam][c.rh] = (cnt[c.kam][c.rh] || 0) + 1;
    }
    return Object.fromEntries(Object.entries(cnt).map(([k, rc]) => [k, Object.entries(rc).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '']));
  }, [customers]);

  // Current month KAM data
  const kamDataMap = useMemo(() => {
    const result: Record<string, KamData> = {};
    for (const kam of allKamNames) result[kam] = computeKamData(kam, selMonth, getTargetRows(kam, selMonth), getTargetMeta(kam, selMonth), transactions);
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selMonth, version, transactions]);

  // Previous month KAM data (for MoM)
  const prevKamDataMap = useMemo(() => {
    const result: Record<string, KamData> = {};
    for (const kam of allKamNames) result[kam] = computeKamData(kam, prevMonth, getTargetRows(kam, prevMonth), getTargetMeta(kam, prevMonth), transactions);
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevMonth, version, transactions]);

  const missingKams = useMemo(() => allKamNames.filter(k => !getTargetMeta(k, selMonth)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selMonth, version]);

  const displayKams = useMemo(() => {
    const base = selKam === 'all' ? allKamNames : [selKam].filter(Boolean);
    return hideNoData ? base.filter(k => !!kamDataMap[k]?.meta) : base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKam, allKamNames, hideNoData, version]);

  // Overdue info
  const overdueInfo = useMemo(() => {
    const [yr, mo] = selMonth.split('-').map(Number);
    const dim = new Date(yr, mo, 0).getDate();
    const today = new Date();
    const periodEnds = [new Date(yr, mo - 1, 10), new Date(yr, mo - 1, 20), new Date(yr, mo - 1, dim)];
    let totalOverdue = 0, overdueCount = 0;
    const entries: Array<{ customer: string; kamName: string; remaining: number; period: number }> = [];
    for (const kamName of displayKams) {
      const data = kamDataMap[kamName];
      if (!data?.meta) continue;
      for (let pi = 0; pi < 3; pi++) {
        if (today <= periodEnds[pi]) continue;
        for (const c of data.byPeriod[pi]) {
          if (c.remaining > 0) { totalOverdue += c.remaining; overdueCount++; entries.push({ customer: c.customer, kamName, remaining: c.remaining, period: pi + 1 }); }
        }
      }
    }
    return { totalOverdue, overdueCount, entries };
  }, [kamDataMap, displayKams, selMonth]);

  // ─── Upload handlers ────────────────────────────────────────────────────────

  function openUploadFor(kam: string) {
    setUploadFor(kam); setShowUpload(true); setPendingRows(null); setPendingFile(null);
    setParseError(''); setParseWarn('');
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setParseError(''); setParseWarn('');
    const reader = new FileReader();
    reader.onload = ev => {
      const buf = ev.target?.result as ArrayBuffer;
      const { rows, excluded, error } = parseTargetFile(buf, selMonth);
      if (error) { setParseError(error); setPendingRows(null); setPendingFile(null); return; }
      if (rows.length === 0) { setParseError('No valid rows found.'); setPendingRows(null); setPendingFile(null); return; }
      if (excluded > 0) setParseWarn(`${excluded} row${excluded > 1 ? 's' : ''} with all-zero amounts excluded.`);
      setPendingRows(rows); setPendingFile({ name: file.name, base64: toBase64(buf) });
    };
    reader.readAsArrayBuffer(file);
  }

  function confirmUpload() {
    if (!pendingRows || !pendingFile || !uploadFor) return;
    uploadTarget(uploadFor, selMonth, pendingRows, pendingFile.base64, user?.name ?? '');
    setPendingRows(null); setPendingFile(null); setShowUpload(false);
    setParseError(''); setParseWarn('');
    if (fileRef.current) fileRef.current.value = '';
  }

  function cancelUpload() {
    setPendingRows(null); setPendingFile(null); setShowUpload(false);
    setParseError(''); setParseWarn('');
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleMasterFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setMasterParseError(''); setMasterParseWarn('');
    const reader = new FileReader();
    reader.onload = ev => {
      const buf = ev.target?.result as ArrayBuffer;
      const { kamRows, excluded, error } = parseMasterTargetFile(buf);
      if (error) { setMasterParseError(error); setMasterPendingRows(null); setMasterPendingFile(null); return; }
      if (excluded > 0) setMasterParseWarn(`${excluded} rows with all-zero amounts excluded.`);
      setMasterPendingRows(kamRows); setMasterPendingFile({ name: file.name, base64: toBase64(buf) });
    };
    reader.readAsArrayBuffer(file);
  }

  async function confirmMasterUpload() {
    if (!masterPendingRows || !masterPendingFile) return;
    await uploadMasterTarget(selMonth, masterPendingRows, masterPendingFile.base64, user?.name ?? '');
    setMasterPendingRows(null); setMasterPendingFile(null); setShowMasterUpload(false);
    setMasterParseError(''); setMasterParseWarn('');
    if (masterFileRef.current) masterFileRef.current.value = '';
  }

  function cancelMasterUpload() {
    setMasterPendingRows(null); setMasterPendingFile(null); setShowMasterUpload(false);
    setMasterParseError(''); setMasterParseWarn('');
    if (masterFileRef.current) masterFileRef.current.value = '';
  }

  async function handleDelete(kam: string) {
    await deleteTarget(kam, selMonth);
    setConfirmDelete(''); setShowUpload(false);
  }

  function downloadOriginal(kam: string) {
    const b64 = getTargetFile(kam, selMonth); if (!b64) return;
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `target_${kam}_${selMonth}.xlsx`; a.click(); URL.revokeObjectURL(url);
  }

  function downloadTemplate(master = false) {
    const [yr, mo] = selMonth.split('-');
    const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(mo) - 1];
    const dim = new Date(parseInt(yr), parseInt(mo), 0).getDate();
    let ws, wb;
    if (master) {
      ws = XLSX.utils.aoa_to_sheet([
        ['Customer Name', 'KAM Name', `${mon}(1-10)`, `${mon}(11-20)`, `${mon}(21-${dim})`, 'Total Target Amount'],
        ['Example Customer Ltd', 'John KAM', 500000, 200000, 300000, '=SUM(C2:E2)'],
        ['Another Customer Pvt Ltd', 'Jane KAM', 300000, 150000, 200000, '=SUM(C3:E3)'],
        ['Total', '', '=SUM(C2:C3)', '=SUM(D2:D3)', '=SUM(E2:E3)', '=SUM(F2:F3)'],
      ]);
      ws['!cols'] = [{ wch: 35 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 22 }];
      wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Target');
      XLSX.writeFile(wb, `master_target_template_${selMonth}.xlsx`);
    } else {
      ws = XLSX.utils.aoa_to_sheet([
        ['Customer Name', `${mon}(1-10)`, `${mon}(11-20)`, `${mon}(21-${dim})`, 'Total Target Amount'],
        ['Example Customer Ltd', 500000, 200000, 300000, '=SUM(B2:D2)'],
        ['Total', '=SUM(B2:B2)', '=SUM(C2:C2)', '=SUM(D2:D2)', '=SUM(E2:E2)'],
      ]);
      ws['!cols'] = [{ wch: 40 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 22 }];
      wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Target');
      XLSX.writeFile(wb, `target_template_${selMonth}.xlsx`);
    }
  }

  function exportExcel() {
    // Mirror the Summary Table exactly — same period view, sort and KAM filter
    const firstData = displayKams.find(k => kamDataMap[k]?.meta);
    const p3Label   = firstData ? kamDataMap[firstData].periods[2].label : '21–31';
    const { piGroups, labels: pLabels } = getPeriodGroups(p3Label);

    type XRow = { customer: string; kamName: string; periodStats: Array<{target:number;actual:number;pct:number}>; target:number; actual:number; shortfall:number; shortfallPct:number; achievePct:number };
    const map: Record<string, { customer: string; kamName: string; periodTargets: number[]; periodActuals: number[]; target: number; actual: number }> = {};
    for (const kamName of displayKams) {
      const data = kamDataMap[kamName]; if (!data?.meta) continue;
      for (let pg = 0; pg < piGroups.length; pg++) {
        const piGroup = piGroups[pg];
        const custs = [...new Set(piGroup.flatMap(pi => data.byPeriod[pi].map(c => c.customer)))];
        for (const customer of custs) {
          const key = `${kamName}::${customer}`;
          if (!map[key]) map[key] = { customer, kamName, periodTargets: new Array(piGroups.length).fill(0), periodActuals: new Array(piGroups.length).fill(0), target: 0, actual: 0 };
          map[key].periodTargets[pg] += piGroup.reduce((a, pi) => a + (data.byPeriod[pi].find(c => c.customer === customer)?.target ?? 0), 0);
          map[key].periodActuals[pg] += piGroup.reduce((a, pi) => a + (data.byPeriod[pi].find(c => c.customer === customer)?.actual ?? 0), 0);
        }
      }
      for (let pi = 0; pi < 3; pi++) for (const c of data.byPeriod[pi]) { const k = `${kamName}::${c.customer}`; if (map[k]) { map[k].target += c.target; map[k].actual += c.actual; } }
    }
    const allRows: XRow[] = Object.values(map).map(r => {
      const shortfall = Math.max(0, r.target - r.actual);
      return { customer: r.customer, kamName: r.kamName, periodStats: r.periodTargets.map((t, i) => ({ target: t, actual: r.periodActuals[i], pct: t > 0 ? Math.min(100, (r.periodActuals[i] / t) * 100) : 0 })), target: r.target, actual: r.actual, shortfall, shortfallPct: r.target > 0 ? (shortfall / r.target) * 100 : 0, achievePct: r.target > 0 ? (r.actual / r.target) * 100 : 0 };
    });
    const flt = summaryKamFilter ? allRows.filter(r => r.kamName === summaryKamFilter) : allRows;
    const sorted = [...flt].sort((a, b) => {
      const av = (a as Record<string,unknown>)[summarySort.col]; const bv = (b as Record<string,unknown>)[summarySort.col];
      if (typeof av === 'string' && typeof bv === 'string') return summarySort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return summarySort.dir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    if (sorted.length === 0) { setExportWarn(true); setTimeout(() => setExportWarn(false), 3000); return; }

    // Header — exactly mirrors the table columns
    const header: string[] = ['Customer'];
    if (isAdminView || isRH) header.push('KAM');
    if (showPeriodCols) for (const pl of pLabels) { header.push(`Target (${pl})`); header.push(`Actual (${pl})`); header.push(`% (${pl})`); }
    header.push('Target (Total)', 'Actual (Total)', 'Shortfall', 'Shortfall %', 'Status');

    const out: unknown[][] = [header];
    for (const r of sorted) {
      const row: unknown[] = [r.customer];
      if (isAdminView || isRH) row.push(r.kamName);
      if (showPeriodCols) for (const ps of r.periodStats) { row.push(ps.target, ps.actual, `${ps.pct.toFixed(1)}%`); }
      row.push(r.target, r.actual, r.shortfall, `${r.shortfallPct.toFixed(1)}%`, statusLabel(r.achievePct));
      out.push(row);
    }
    // Grand total row
    const totRow: unknown[] = ['Grand Total'];
    if (isAdminView || isRH) totRow.push('');
    if (showPeriodCols) for (let gi = 0; gi < pLabels.length; gi++) {
      const gt = sorted.reduce((a, r) => a + r.periodStats[gi].target, 0);
      const ga = sorted.reduce((a, r) => a + r.periodStats[gi].actual, 0);
      totRow.push(gt, ga, gt > 0 ? `${((ga/gt)*100).toFixed(1)}%` : '—');
    }
    const gtTgt = sorted.reduce((a, r) => a + r.target, 0);
    const gtAct = sorted.reduce((a, r) => a + r.actual, 0);
    const gtSF  = sorted.reduce((a, r) => a + r.shortfall, 0);
    totRow.push(gtTgt, gtAct, gtSF, gtTgt > 0 ? `${((gtSF/gtTgt)*100).toFixed(1)}%` : '—', '');
    out.push(totRow);

    const ws = XLSX.utils.aoa_to_sheet(out); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Target vs Actual');
    XLSX.writeFile(wb, `target_actual_${selMonth}.xlsx`);
  }

  function downloadMasterFile() {
    const firstKam = allKamNames.find(k => getTargetMeta(k, selMonth) && getTargetFile(k, selMonth));
    if (!firstKam) return;
    const b64 = getTargetFile(firstKam, selMonth); if (!b64) return;
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `master_target_${selMonth}.xlsx`; a.click(); URL.revokeObjectURL(url);
  }

  function sortSummary(col: string) {
    setSummarySort(s => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }));
  }

  // ─── Sub-renders ────────────────────────────────────────────────────────────

  function renderOverdueBanner() {
    if (overdueInfo.overdueCount === 0) return null;
    return (
      <div style={{ background: '#fef2f2', border: '2px solid #ef4444', borderRadius: 10, overflow: 'hidden' }}>
        <div onClick={() => setShowOverdueDetail(s => !s)} style={{ padding: '12px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 700, color: '#b91c1c', fontSize: 14 }}>
              {overdueInfo.overdueCount} customer-period{overdueInfo.overdueCount > 1 ? 's' : ''} overdue — {fmtL(overdueInfo.totalOverdue)} total pending past deadline
            </span>
          </div>
          <span style={{ color: '#ef4444', fontSize: 12, flexShrink: 0 }}>{showOverdueDetail ? '▲ Hide' : '▼ Details'}</span>
        </div>
        {showOverdueDetail && (
          <div style={{ borderTop: '1px solid #fecaca', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#fef2f2' }}>
                  {['Customer', 'KAM', 'Period', 'Remaining'].map(h => (
                    <th key={h} style={{ padding: '7px 12px', textAlign: h === 'Remaining' ? 'right' : 'left', fontWeight: 600, color: '#991b1b', borderBottom: '1px solid #fecaca' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {overdueInfo.entries.sort((a, b) => b.remaining - a.remaining).map((e, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #fecaca' }}>
                    <td style={{ padding: '7px 12px', fontWeight: 600, color: '#b91c1c' }}>{e.customer}</td>
                    <td style={{ padding: '7px 12px', color: '#7f1d1d' }}>{e.kamName}</td>
                    <td style={{ padding: '7px 12px', color: '#7f1d1d' }}>P{e.period}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700, color: '#b91c1c' }}>{fmtL(e.remaining)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  function renderOverviewBanner() {
    const withData = displayKams.filter(k => kamDataMap[k]?.meta);
    if (withData.length === 0) return null;
    const gtTarget = withData.reduce((a, k) => a + kamDataMap[k].totalTarget, 0);
    const gtActual = withData.reduce((a, k) => a + kamDataMap[k].totalActual, 0);
    const gtGap    = gtTarget - gtActual;
    const gtPct    = gtTarget > 0 ? (gtActual / gtTarget) * 100 : 0;

    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Overall — {monthLabel}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>{withData.length} KAM{withData.length !== 1 ? 's' : ''} with data</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[
            { label: 'Combined Target', val: fmtL(gtTarget), color: '#6366f1' },
            { label: 'Combined Actual', val: fmtL(gtActual), color: '#22c55e' },
            { label: gtGap <= 0 ? 'Surplus' : 'Shortfall', val: fmtL(Math.abs(gtGap)), color: gtGap <= 0 ? '#22c55e' : '#ef4444', click: gtGap > 0 ? () => { setMasterShortfall(true); setShortfallPanel(null); } : undefined },
            { label: 'Achievement', val: `${gtPct.toFixed(1)}%`, color: achieveColor(gtPct) },
          ].map(card => (
            <div key={card.label} onClick={card.click} style={{ cursor: card.click ? 'pointer' : 'default' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{card.label}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: card.color, lineHeight: 1 }}>{card.val}</div>
              {card.click && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>Click for breakdown →</div>}
            </div>
          ))}
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>
            <span>0%</span><span style={{ fontWeight: 700, color: achieveColor(gtPct) }}>{gtPct.toFixed(1)}%</span><span>100%</span>
          </div>
          <div style={{ height: 10, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, gtPct)}%`, height: '100%', background: achieveColor(gtPct), borderRadius: 99, transition: 'width 0.5s' }} />
          </div>
        </div>
      </div>
    );
  }

  const PERIOD_VIEWS: { id: PeriodView; label: string }[] = [
    { id: '10day',      label: '10-Day (P1 / P2 / P3)' },
    { id: '20day-p1p2', label: '20-Day (P1+P2 | P3)' },
    { id: '20day-p2p3', label: '20-Day (P1 | P2+P3)' },
  ];

  function getPeriodGroups(p3Label: string): { piGroups: number[][]; labels: string[] } {
    if (periodView === '20day-p1p2') return { piGroups: [[0, 1], [2]], labels: ['1–20', p3Label] };
    if (periodView === '20day-p2p3') return { piGroups: [[0], [1, 2]], labels: ['1–10', '11–end'] };
    return { piGroups: [[0], [1], [2]], labels: ['1–10', '11–20', p3Label] };
  }

  function renderPeriodToggle() {
    return (
      <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {PERIOD_VIEWS.map(v => (
          <button key={v.id} onClick={() => setPeriodView(v.id)}
            style={{ padding: '5px 12px', border: 'none', fontSize: 12, cursor: 'pointer', background: periodView === v.id ? 'var(--brand)' : 'var(--surface)', color: periodView === v.id ? '#fff' : 'var(--text2)', fontWeight: periodView === v.id ? 600 : 400, whiteSpace: 'nowrap' }}>
            {v.label}
          </button>
        ))}
      </div>
    );
  }

  function renderKamCard(kamName: string) {
    const data    = kamDataMap[kamName];
    const prev    = prevKamDataMap[kamName];
    const hasMeta = !!data?.meta;
    const rh      = kamRhMap[kamName] ?? '';
    const isSelected = expandedKam === kamName;
    const momDelta = hasMeta && prev?.meta ? data.totalPct - prev.totalPct : null;

    return (
      <div key={kamName} onClick={() => { if (hasMeta) setExpandedKam(isSelected ? null : kamName); }}
        style={{ background: 'var(--surface)', border: `2px solid ${isSelected ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 12, padding: '16px 18px', cursor: hasMeta ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', gap: 10, transition: 'border-color 0.2s' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{kamName}</div>
            {rh && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>RH: {rh}</div>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            {hasMeta ? (
              <>
                <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: achieveColor(data.totalPct) + '22', color: achieveColor(data.totalPct), border: `1px solid ${achieveColor(data.totalPct)}55` }}>
                  {statusLabel(data.totalPct)}
                </span>
                {momDelta !== null && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: momDelta >= 0 ? '#16a34a' : '#dc2626' }}>
                    {momDelta >= 0 ? '▲' : '▼'} {Math.abs(momDelta).toFixed(1)}% vs last month
                  </span>
                )}
              </>
            ) : (
              <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' }}>No Data</span>
            )}
          </div>
        </div>

        {hasMeta && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Target</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#6366f1' }}>{fmtL(data.totalTarget)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Actual</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#22c55e' }}>{fmtL(data.totalActual)}</div>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                <span style={{ color: 'var(--text3)' }}>{data.totalGap > 0 ? `Gap: ${fmtL(data.totalGap)}` : `Surplus: ${fmtL(Math.abs(data.totalGap))}`}</span>
                <span style={{ fontWeight: 800, color: achieveColor(data.totalPct) }}>{data.totalPct.toFixed(1)}%</span>
              </div>
              <div style={{ height: 8, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, data.totalPct)}%`, height: '100%', background: achieveColor(data.totalPct), borderRadius: 99, transition: 'width 0.4s' }} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: isSelected ? 'var(--brand)' : 'var(--text3)', textAlign: 'center', fontWeight: isSelected ? 600 : 400 }}>
              {isSelected ? '▲ Click to collapse' : '▼ Click for period detail'}
            </div>
          </>
        )}
      </div>
    );
  }

  function renderKamDetail(kamName: string) {
    const data = kamDataMap[kamName];
    if (!data?.meta) return null;
    return (
      <div style={{ background: 'var(--surface)', border: '2px solid var(--brand)', borderRadius: 12, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{kamName} — Period Detail</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {renderPeriodToggle()}
            <button onClick={() => setExpandedKam(null)} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text2)' }}>✕ Close</button>
          </div>
        </div>
        {renderPeriodTimeline(data)}
        {renderCustomerTable(data)}
      </div>
    );
  }

  function renderPeriodTimeline(data: KamData) {
    const periods = data.periods;
    const p3Label = periods[2].label;

    if (periodView === '20day-p1p2') {
      const p1p2Target = periods[0].effectiveTarget + periods[1].origTarget;
      const p1p2Actual = periods[0].actual + periods[1].actual;
      const p1p2Gap    = p1p2Target - p1p2Actual;
      const p1p2Pct    = p1p2Target > 0 ? (p1p2Actual / p1p2Target) * 100 : 0;
      const p3 = periods[2];
      const cols = [
        { label: 'P1+P2 (1–20)', effectiveTarget: p1p2Target, actual: p1p2Actual, gap: p1p2Gap, achievePct: p1p2Pct, carryForward: periods[0].carryForward },
        { label: `P3 (${p3Label})`, effectiveTarget: p3.effectiveTarget, actual: p3.actual, gap: p3.gap, achievePct: p3.achievePct, carryForward: p3.carryForward },
      ];
      return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{cols.map(col => renderPeriodCol(col))}</div>;
    }

    if (periodView === '20day-p2p3') {
      const p2p3Target = periods[1].effectiveTarget + periods[2].origTarget;
      const p2p3Actual = periods[1].actual + periods[2].actual;
      const p2p3Gap    = p2p3Target - p2p3Actual;
      const p2p3Pct    = p2p3Target > 0 ? (p2p3Actual / p2p3Target) * 100 : 0;
      const p1 = periods[0];
      const cols = [
        { label: `P1 (${p1.label})`, effectiveTarget: p1.effectiveTarget, actual: p1.actual, gap: p1.gap, achievePct: p1.achievePct, carryForward: p1.carryForward },
        { label: `P2+P3 (11–${p3Label.split('–')[1]})`, effectiveTarget: p2p3Target, actual: p2p3Actual, gap: p2p3Gap, achievePct: p2p3Pct, carryForward: periods[1].carryForward },
      ];
      return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{cols.map(col => renderPeriodCol(col))}</div>;
    }

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {periods.map(p => renderPeriodCol({ label: `P${p.period} (${p.label})`, effectiveTarget: p.effectiveTarget, actual: p.actual, gap: p.gap, achievePct: p.achievePct, carryForward: p.carryForward }))}
      </div>
    );
  }

  function renderPeriodCol(col: { label: string; effectiveTarget: number; actual: number; gap: number; achievePct: number; carryForward: number }) {
    return (
      <div key={col.label} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text2)' }}>{col.label}</div>
        {col.carryForward > 0 && (
          <div style={{ fontSize: 11, color: '#92400e', background: '#fef3c7', borderRadius: 6, padding: '4px 8px' }}>
            + {fmtL(col.carryForward)} carry-forward
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text3)' }}>Target</div>
            <div style={{ fontWeight: 700, color: '#6366f1', fontSize: 15 }}>{fmtL(col.effectiveTarget)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text3)' }}>Actual</div>
            <div style={{ fontWeight: 700, color: '#22c55e', fontSize: 15 }}>{fmtL(col.actual)}</div>
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
            <span style={{ color: col.gap > 0 ? '#ef4444' : '#22c55e', fontWeight: 600 }}>
              {col.gap > 0 ? `Gap: ${fmtL(col.gap)}` : `+${fmtL(Math.abs(col.gap))}`}
            </span>
            <span style={{ fontWeight: 800, color: achieveColor(col.achievePct) }}>{col.achievePct.toFixed(1)}%</span>
          </div>
          <div style={{ height: 7, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, col.achievePct)}%`, height: '100%', background: achieveColor(col.achievePct), borderRadius: 99 }} />
          </div>
        </div>
      </div>
    );
  }

  function renderCustomerTable(data: KamData) {
    const p3Label = data.periods[2].label;
    const { piGroups, labels } = getPeriodGroups(p3Label);

    const { piGroups: custPiGroups, labels: custPeriodLabels } = getPeriodGroups(data.periods[2].label);
    const custs = [...new Set(data.byPeriod.flatMap(pp => pp.map(c => c.customer)))];

    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg)' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text3)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Customer</th>
              {custPeriodLabels.map(pl => (
                <React.Fragment key={pl}>
                  <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: 'var(--text3)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', fontSize: 11 }}>{pl} Target</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: 'var(--text3)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', fontSize: 11 }}>{pl} Actual</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: 'var(--text3)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', fontSize: 11 }}>%</th>
                </React.Fragment>
              ))}
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--text3)', borderBottom: '1px solid var(--border)' }}>Total Target</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--text3)', borderBottom: '1px solid var(--border)' }}>Total Actual</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--text3)', borderBottom: '1px solid var(--border)' }}>Shortfall</th>
            </tr>
          </thead>
          <tbody>
            {custs.map((customer, ci) => {
              const periodStats = custPiGroups.map((piGroup: number[]) => {
                const target = piGroup.reduce((a: number, pi: number) => a + (data.byPeriod[pi].find(c => c.customer === customer)?.target ?? 0), 0);
                const actual = piGroup.reduce((a: number, pi: number) => a + (data.byPeriod[pi].find(c => c.customer === customer)?.actual ?? 0), 0);
                return { target, actual, pct: target > 0 ? Math.min(100, (actual / target) * 100) : 0 };
              });
              const totalTarget  = data.byPeriod.reduce((a, pp) => a + (pp.find(c => c.customer === customer)?.target ?? 0), 0);
              const totalActual  = data.byPeriod.reduce((a, pp) => a + (pp.find(c => c.customer === customer)?.actual ?? 0), 0);
              const shortfall    = Math.max(0, totalTarget - totalActual);
              return (
                <tr key={customer} style={{ borderBottom: '1px solid var(--border)', background: ci % 2 === 0 ? 'transparent' : 'var(--bg)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={customer}>{customer}</td>
                  {periodStats.map((ps, psi) => (
                    <React.Fragment key={psi}>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text2)' }}>{fmtL(ps.target)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{fmtL(ps.actual)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <span style={{ fontWeight: 700, color: achieveColor(ps.pct), fontSize: 11 }}>{ps.pct.toFixed(0)}%</span>
                      </td>
                    </React.Fragment>
                  ))}
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#6366f1' }}>{fmtL(totalTarget)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#22c55e' }}>{fmtL(totalActual)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: shortfall > 0 ? '#ef4444' : '#22c55e' }}>{shortfall > 0 ? fmtL(shortfall) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  function renderKamGrid() {
    // Group by RH
    const rhNames = [...new Set(displayKams.map(k => kamRhMap[k] ?? 'Unassigned'))].sort();
    const groups = rhNames.map(rh => ({ rh, kams: displayKams.filter(k => (kamRhMap[k] ?? 'Unassigned') === rh) }));

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {groups.map(({ rh, kams }) => (
          <div key={rh}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>RH: {rh}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {kams.map(kam => renderKamCard(kam))}
            </div>
            {/* Full-width detail panel for selected KAM in this group */}
            {expandedKam && kams.includes(expandedKam) && (
              <div style={{ marginTop: 12 }}>{renderKamDetail(expandedKam)}</div>
            )}
          </div>
        ))}
      </div>
    );
  }

  function renderSummaryTable() {
    // Period groups for the summary table columns
    const firstData = displayKams.find(k => kamDataMap[k]?.meta);
    const p3Label = firstData ? kamDataMap[firstData].periods[2].label : '21–31';
    const { piGroups, labels: pLabels } = getPeriodGroups(p3Label);

    // Build per-customer period stats across all KAMs
    type SummaryRow = {
      customer: string; kamName: string;
      periodStats: Array<{ target: number; actual: number; pct: number }>;
      target: number; actual: number; shortfall: number; shortfallPct: number; achievePct: number;
    };
    const map: Record<string, { customer: string; kamName: string; periodTargets: number[]; periodActuals: number[]; target: number; actual: number }> = {};
    for (const kamName of displayKams) {
      const data = kamDataMap[kamName];
      if (!data?.meta) continue;
      for (let pg = 0; pg < piGroups.length; pg++) {
        const piGroup = piGroups[pg];
        const custs = [...new Set(piGroup.flatMap(pi => data.byPeriod[pi].map(c => c.customer)))];
        for (const customer of custs) {
          const key = `${kamName}::${customer}`;
          if (!map[key]) map[key] = { customer, kamName, periodTargets: new Array(piGroups.length).fill(0), periodActuals: new Array(piGroups.length).fill(0), target: 0, actual: 0 };
          const t = piGroup.reduce((a, pi) => a + (data.byPeriod[pi].find(c => c.customer === customer)?.target ?? 0), 0);
          const a = piGroup.reduce((a, pi) => a + (data.byPeriod[pi].find(c => c.customer === customer)?.actual ?? 0), 0);
          map[key].periodTargets[pg] += t;
          map[key].periodActuals[pg] += a;
        }
      }
      // total target/actual from all 3 periods
      for (let pi = 0; pi < 3; pi++) {
        for (const c of data.byPeriod[pi]) {
          const key = `${kamName}::${c.customer}`;
          if (map[key]) { map[key].target += c.target; map[key].actual += c.actual; }
        }
      }
    }
    const allRows: SummaryRow[] = Object.values(map).map(r => {
      const shortfall = Math.max(0, r.target - r.actual);
      return {
        customer: r.customer, kamName: r.kamName,
        periodStats: r.periodTargets.map((t, i) => ({ target: t, actual: r.periodActuals[i], pct: t > 0 ? Math.min(100, (r.periodActuals[i] / t) * 100) : 0 })),
        target: r.target, actual: r.actual, shortfall,
        shortfallPct: r.target > 0 ? (shortfall / r.target) * 100 : 0,
        achievePct: r.target > 0 ? (r.actual / r.target) * 100 : 0,
      };
    });
    const filtered = summaryKamFilter ? allRows.filter(r => r.kamName === summaryKamFilter) : allRows;
    const sorted = [...filtered].sort((a, b) => {
      const col = summarySort.col;
      const av = (a as Record<string, unknown>)[col]; const bv = (b as Record<string, unknown>)[col];
      if (typeof av === 'string' && typeof bv === 'string') return summarySort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return summarySort.dir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });

    const gtTarget    = sorted.reduce((a, r) => a + r.target, 0);
    const gtActual    = sorted.reduce((a, r) => a + r.actual, 0);
    const gtShortfall = sorted.reduce((a, r) => a + r.shortfall, 0);
    const gtPeriodTargets = pLabels.map((_, gi) => sorted.reduce((a, r) => a + r.periodStats[gi].target, 0));
    const gtPeriodActuals = pLabels.map((_, gi) => sorted.reduce((a, r) => a + r.periodStats[gi].actual, 0));

    const trackedCustLower = new Set(Object.values(map).map(r => r.customer.toLowerCase()));
    const untrackedTxns = transactions.filter(t =>
      t.status === 'matched' &&
      t.date.startsWith(selMonth) &&
      (!summaryKamFilter || t.kam === summaryKamFilter) &&
      !trackedCustLower.has(t.customer.toLowerCase())
    );
    const untrackedTotal = untrackedTxns.reduce((a, t) => a + t.amount, 0);
    const untrackedCustCount = new Set(untrackedTxns.map(t => t.customer)).size;

    const hasFilters = !!summaryKamFilter || summarySort.col !== 'shortfall' || summarySort.dir !== 'desc';

    const SortBtn = ({ col }: { col: string }) => (
      <span style={{ marginLeft: 4, opacity: summarySort.col === col ? 1 : 0.3, cursor: 'pointer', fontSize: 10 }} onClick={() => sortSummary(col)}>
        {summarySort.col === col ? (summarySort.dir === 'desc' ? '▼' : '▲') : '↕'}
      </span>
    );

    // shared cell styles
    const TH = (extra?: React.CSSProperties): React.CSSProperties => ({
      padding: '0 14px', height: 48, verticalAlign: 'middle',
      fontWeight: 700, fontSize: 11, color: '#6b7280',
      textTransform: 'uppercase', letterSpacing: 0.5,
      borderBottom: '2px solid var(--border)',
      borderRight: '1px solid var(--border)',
      background: 'var(--bg)', whiteSpace: 'nowrap', userSelect: 'none',
      ...extra,
    });
    const TD = (extra?: React.CSSProperties): React.CSSProperties => ({
      padding: '11px 14px', fontSize: 13,
      borderBottom: '1px solid var(--border)',
      borderRight: '1px solid var(--border)',
      ...extra,
    });

    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {/* Header toolbar */}
        <div style={{ padding: '14px 20px', borderBottom: '2px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>Customer Summary — {monthLabel}</span>

          {/* Period toggle button */}
          <button onClick={() => setShowPeriodCols(s => !s)}
            style={{ padding: '5px 14px', borderRadius: 8, border: `1px solid ${showPeriodCols ? 'var(--brand)' : 'var(--border)'}`, background: showPeriodCols ? 'var(--brand)' : 'var(--surface)', color: showPeriodCols ? '#fff' : 'var(--text2)', cursor: 'pointer', fontSize: 12, fontWeight: showPeriodCols ? 600 : 400, display: 'flex', alignItems: 'center', gap: 6 }}>
            📅 {showPeriodCols ? 'Hide Period View' : 'Period View'}
          </button>

          {/* Period type toggle — only visible when period cols are shown */}
          {showPeriodCols && renderPeriodToggle()}

          {/* KAM filter */}
          {(isAdminView || isRH) && (
            <select value={summaryKamFilter} onChange={e => setSummaryKamFilter(e.target.value)}
              style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12 }}>
              <option value="">All KAMs</option>
              {allKamNames.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          )}
          {hasFilters && (
            <button onClick={() => { setSummaryKamFilter(''); setSummarySort({ col: 'shortfall', dir: 'desc' }); setShowPeriodCols(false); }}
              style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: 12 }}>
              ✕ Clear
            </button>
          )}
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>{sorted.length} customers</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {/* Customer */}
                <th onClick={() => sortSummary('customer')} style={{ ...TH({ textAlign: 'left', cursor: 'pointer', minWidth: 160 }) }}>
                  Customer <SortBtn col="customer" />
                </th>
                {/* KAM */}
                {(isAdminView || isRH) && (
                  <th onClick={() => sortSummary('kamName')} style={{ ...TH({ textAlign: 'left', cursor: 'pointer' }) }}>
                    KAM <SortBtn col="kamName" />
                  </th>
                )}

                {/* Period columns — shown only when toggled */}
                {showPeriodCols && pLabels.map(pl => (
                  <React.Fragment key={pl}>
                    <th style={{ ...TH({ textAlign: 'right', background: '#eff6ff', borderLeft: '2px solid #bfdbfe' }) }}>
                      <div style={{ color: '#1d4ed8' }}>Target</div>
                      <div style={{ fontWeight: 500, fontSize: 10, color: '#3b82f6' }}>({pl})</div>
                    </th>
                    <th style={{ ...TH({ textAlign: 'right', background: '#f0fdf4' }) }}>
                      <div style={{ color: '#15803d' }}>Actual</div>
                      <div style={{ fontWeight: 500, fontSize: 10, color: '#22c55e' }}>({pl})</div>
                    </th>
                    <th style={{ ...TH({ textAlign: 'right', background: '#f9fafb', borderRight: '2px solid var(--border)' }) }}>%</th>
                  </React.Fragment>
                ))}

                {/* Always-visible totals */}
                <th onClick={() => sortSummary('target')} style={{ ...TH({ textAlign: 'right', cursor: 'pointer', background: '#eff6ff', borderLeft: showPeriodCols ? '2px solid #bfdbfe' : undefined }) }}>
                  <div style={{ color: '#1d4ed8' }}>Target</div>
                  <div style={{ fontWeight: 500, fontSize: 10, color: '#3b82f6' }}>(Total) <SortBtn col="target" /></div>
                </th>
                <th onClick={() => sortSummary('actual')} style={{ ...TH({ textAlign: 'right', cursor: 'pointer', background: '#f0fdf4' }) }}>
                  <div style={{ color: '#15803d' }}>Actual</div>
                  <div style={{ fontWeight: 500, fontSize: 10, color: '#22c55e' }}>(Total) <SortBtn col="actual" /></div>
                </th>
                <th onClick={() => sortSummary('shortfall')} style={{ ...TH({ textAlign: 'right', cursor: 'pointer' }) }}>
                  Shortfall <SortBtn col="shortfall" />
                </th>
                <th onClick={() => sortSummary('shortfallPct')} style={{ ...TH({ textAlign: 'right', cursor: 'pointer' }) }}>
                  Shortfall % <SortBtn col="shortfallPct" />
                </th>
                <th style={{ ...TH({ textAlign: 'center', borderRight: 'none' }) }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg)' }}>
                  <td style={{ ...TD({ fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }), textAlign: 'left' }} title={r.customer}>{r.customer}</td>
                  {(isAdminView || isRH) && <td style={{ ...TD({ color: 'var(--text2)', fontSize: 12, whiteSpace: 'nowrap' }), textAlign: 'left' }}>{r.kamName}</td>}

                  {showPeriodCols && r.periodStats.map((ps, gi) => (
                    <React.Fragment key={gi}>
                      <td style={{ ...TD({ background: '#eff6ff33', borderLeft: '2px solid #bfdbfe' }), textAlign: 'right', color: '#1d4ed8', fontWeight: 600 }}>{fmtL(ps.target)}</td>
                      <td style={{ ...TD({ background: '#f0fdf433' }), textAlign: 'right', color: '#15803d', fontWeight: 600 }}>{fmtL(ps.actual)}</td>
                      <td style={{ ...TD({ borderRight: '2px solid var(--border)' }), textAlign: 'right' }}>
                        <span style={{ fontWeight: 700, color: achieveColor(ps.pct), fontSize: 11 }}>{ps.pct.toFixed(0)}%</span>
                      </td>
                    </React.Fragment>
                  ))}

                  <td style={{ ...TD({ background: '#eff6ff33', borderLeft: showPeriodCols ? '2px solid #bfdbfe' : undefined }), textAlign: 'right', color: '#1d4ed8', fontWeight: 700 }}>{fmtL(r.target)}</td>
                  <td style={{ ...TD({ background: '#f0fdf433' }), textAlign: 'right', color: '#15803d', fontWeight: 700 }}>{fmtL(r.actual)}</td>
                  <td style={{ ...TD(), textAlign: 'right', fontWeight: 700, color: r.shortfall > 0 ? '#ef4444' : '#22c55e' }}>{r.shortfall > 0 ? fmtL(r.shortfall) : '—'}</td>
                  <td style={{ ...TD(), textAlign: 'right', fontWeight: 700, color: r.shortfall > 0 ? '#ef4444' : '#22c55e' }}>{r.shortfall > 0 ? `${r.shortfallPct.toFixed(1)}%` : '—'}</td>
                  <td style={{ ...TD({ borderRight: 'none' }), textAlign: 'center' }}>
                    <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: achieveColor(r.achievePct) + '22', color: achieveColor(r.achievePct), border: `1px solid ${achieveColor(r.achievePct)}55` }}>
                      {statusLabel(r.achievePct)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {untrackedTotal > 0 && (
                <tr style={{ background: '#fefce8', borderTop: '2px solid #fbbf24' }}>
                  <td style={{ ...TD({ borderBottom: 'none', fontWeight: 700, color: '#92400e' }), textAlign: 'left' }}>
                    Untracked Collections
                    <span style={{ fontSize: 11, fontWeight: 400, color: '#a16207', marginLeft: 8 }}>
                      {untrackedCustCount} customer{untrackedCustCount !== 1 ? 's' : ''} · no target set
                    </span>
                  </td>
                  {(isAdminView || isRH) && <td style={{ ...TD({ borderBottom: 'none' }) }} />}
                  {showPeriodCols && pLabels.map((_, gi) => (
                    <React.Fragment key={gi}>
                      <td style={{ ...TD({ borderBottom: 'none' }) }} />
                      <td style={{ ...TD({ borderBottom: 'none' }) }} />
                      <td style={{ ...TD({ borderBottom: 'none' }) }} />
                    </React.Fragment>
                  ))}
                  <td style={{ ...TD({ borderBottom: 'none' }), textAlign: 'right', color: '#a16207' }}>—</td>
                  <td style={{ ...TD({ background: '#fef9c3', borderBottom: 'none' }), textAlign: 'right', fontWeight: 700, color: '#a16207' }}>{fmtL(untrackedTotal)}</td>
                  <td style={{ ...TD({ borderBottom: 'none' }), textAlign: 'right', color: '#a16207' }}>—</td>
                  <td style={{ ...TD({ borderBottom: 'none' }), textAlign: 'right', color: '#a16207' }}>—</td>
                  <td style={{ ...TD({ borderRight: 'none', borderBottom: 'none' }), textAlign: 'center' }}>
                    <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: '#fef08a', color: '#854d0e', border: '1px solid #fbbf24' }}>No Target</span>
                  </td>
                </tr>
              )}
              <tr style={{ background: 'var(--bg)', borderTop: '3px solid var(--border)' }}>
                <td style={{ ...TD({ fontWeight: 800, borderBottom: 'none' }), textAlign: 'left' }}>Grand Total</td>
                {(isAdminView || isRH) && <td style={{ ...TD({ borderBottom: 'none' }) }} />}
                {showPeriodCols && pLabels.map((_, gi) => (
                  <React.Fragment key={gi}>
                    <td style={{ ...TD({ background: '#eff6ff33', borderLeft: '2px solid #bfdbfe', borderBottom: 'none' }), textAlign: 'right', fontWeight: 800, color: '#1d4ed8' }}>{fmtL(gtPeriodTargets[gi])}</td>
                    <td style={{ ...TD({ background: '#f0fdf433', borderBottom: 'none' }), textAlign: 'right', fontWeight: 800, color: '#15803d' }}>{fmtL(gtPeriodActuals[gi])}</td>
                    <td style={{ ...TD({ borderRight: '2px solid var(--border)', borderBottom: 'none' }), textAlign: 'right' }}>
                      <span style={{ fontWeight: 700, color: achieveColor(gtPeriodTargets[gi] > 0 ? (gtPeriodActuals[gi] / gtPeriodTargets[gi]) * 100 : 0), fontSize: 11 }}>
                        {gtPeriodTargets[gi] > 0 ? `${((gtPeriodActuals[gi] / gtPeriodTargets[gi]) * 100).toFixed(0)}%` : '—'}
                      </span>
                    </td>
                  </React.Fragment>
                ))}
                <td style={{ ...TD({ background: '#eff6ff33', borderLeft: showPeriodCols ? '2px solid #bfdbfe' : undefined, borderBottom: 'none' }), textAlign: 'right', fontWeight: 800, color: '#1d4ed8' }}>{fmtL(gtTarget)}</td>
                <td style={{ ...TD({ background: '#f0fdf433', borderBottom: 'none' }), textAlign: 'right', fontWeight: 800, color: '#15803d' }}>{fmtL(gtActual)}</td>
                <td style={{ ...TD({ borderBottom: 'none' }), textAlign: 'right', fontWeight: 800, color: gtShortfall > 0 ? '#ef4444' : '#22c55e' }}>{gtShortfall > 0 ? fmtL(gtShortfall) : '—'}</td>
                <td style={{ ...TD({ borderBottom: 'none' }), textAlign: 'right', fontWeight: 800, color: gtShortfall > 0 ? '#ef4444' : '#22c55e' }}>
                  {gtTarget > 0 ? `${((gtShortfall / gtTarget) * 100).toFixed(1)}%` : '—'}
                </td>
                <td style={{ ...TD({ borderRight: 'none', borderBottom: 'none' }) }} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

  function renderKamView() {
    const kam = kamViewKam || (isKAM ? myKam : '');
    const data = kam ? kamDataMap[kam] : null;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {(isAdminView || isRH) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Select KAM:</span>
            <select value={kamViewKam} onChange={e => setKamViewKam(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }}>
              <option value="">-- Choose KAM --</option>
              {allKamNames.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            {kamViewKam && kamRhMap[kamViewKam] && <span style={{ fontSize: 13, color: 'var(--text3)' }}>RH: {kamRhMap[kamViewKam]}</span>}
          </div>
        )}
        {!kam && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>Select a KAM to view their customers.</div>}
        {kam && !data?.meta && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>No target uploaded for {kam} — {monthLabel}.</div>}
        {kam && data?.meta && (
          <>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              {[
                { label: 'Target', val: fmtL(data.totalTarget), color: '#6366f1' },
                { label: 'Actual', val: fmtL(data.totalActual), color: '#22c55e' },
                { label: data.totalGap <= 0 ? 'Surplus' : 'Shortfall', val: fmtL(Math.abs(data.totalGap)), color: data.totalGap <= 0 ? '#22c55e' : '#ef4444' },
                { label: 'Achievement', val: `${data.totalPct.toFixed(1)}%`, color: achieveColor(data.totalPct) },
              ].map(card => (
                <div key={card.label}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{card.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: card.color }}>{card.val}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>Period view:</span>
              {renderPeriodToggle()}
            </div>
            {renderPeriodTimeline(data)}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>All Customers — {kam}</div>
              {renderCustomerTable(data)}
            </div>
          </>
        )}
      </div>
    );
  }

  function renderUploadSection() {
    const uploadedCount = allKamNames.length - missingKams.length;
    const hasUploaded   = uploadedCount > 0;
    const firstMeta     = hasUploaded ? getTargetMeta(allKamNames.find(k => getTargetMeta(k, selMonth)) ?? '', selMonth) : null;

    return (
      <div style={{ background: 'var(--surface)', border: `1px solid ${hasUploaded ? '#bbf7d0' : 'var(--border)'}`, borderRadius: 12, overflow: 'hidden' }}>
        {/* Header bar */}
        <div onClick={() => setShowUploadSection(s => !s)} style={{ padding: '14px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, borderBottom: showUploadSection ? '2px solid var(--border)' : 'none' }}>
          <span style={{ fontSize: 20 }}>{hasUploaded ? '✅' : '📂'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Target File — {monthLabel}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>
              {uploadedCount}/{allKamNames.length} KAMs loaded
              {firstMeta && <span style={{ marginLeft: 8 }}>· Uploaded by {firstMeta.uploadedBy} on {new Date(firstMeta.uploadedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' } as Intl.DateTimeFormatOptions)}</span>}
            </div>
          </div>

          {/* Action buttons — stop propagation so they don't toggle collapse */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
            {hasUploaded && (
              <button onClick={downloadMasterFile}
                style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #16a34a', background: '#f0fdf4', color: '#15803d', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                ⬇ Download
              </button>
            )}
            <button onClick={() => { setShowUploadSection(true); setShowMasterUpload(s => !s); setMasterPendingRows(null); setMasterPendingFile(null); setMasterParseError(''); setMasterParseWarn(''); if (masterFileRef.current) masterFileRef.current.value = ''; }}
              style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
              {hasUploaded ? (showMasterUpload ? '✕ Cancel' : '↺ Replace') : '↑ Upload'}
            </button>
          </div>

          {uploadOverdue && missingKams.length > 0 && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', whiteSpace: 'nowrap', flexShrink: 0 }}>Overdue</span>
          )}
          <span style={{ fontSize: 13, color: 'var(--text3)', flexShrink: 0 }}>{showUploadSection ? '▲' : '▼'}</span>
        </div>

        {showUploadSection && (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>
              Upload one Excel file with a <strong>KAM Name</strong> column — targets are automatically split per KAM.{' '}
              <span style={{ color: 'var(--brand)', cursor: 'pointer', fontWeight: 500 }} onClick={() => downloadTemplate(true)}>Download template</span>
            </div>

            {/* Upload form (shown when Replace / Upload button was clicked) */}
            {showMasterUpload && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ padding: '14px 20px', borderRadius: 8, border: '2px dashed var(--brand)', cursor: 'pointer', fontSize: 13, color: 'var(--text2)', display: 'inline-flex', alignItems: 'center', gap: 8, width: 'fit-content', background: 'var(--bg)' }}>
                  <i className="ti ti-upload" />
                  {masterPendingFile ? masterPendingFile.name : 'Choose Excel file (.xlsx / .xls)'}
                  <input ref={masterFileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleMasterFileChange} />
                </label>
                {masterParseError && <div style={{ color: '#ef4444', fontSize: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 8 }}>{masterParseError}</div>}
                {masterParseWarn  && <div style={{ color: '#92400e', fontSize: 12, padding: '8px 12px', background: '#fef3c7', borderRadius: 8 }}>⚠ {masterParseWarn}</div>}
                {masterPendingRows && (
                  <div style={{ padding: '14px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                    <div style={{ fontSize: 13, color: '#166534', marginBottom: 10 }}>
                      <strong>{Object.keys(masterPendingRows).length} KAMs detected:</strong>{' '}
                      {Object.entries(masterPendingRows).map(([k, r]) => `${k} (${r.length} customers)`).join(' · ')}
                    </div>
                    {hasUploaded && <div style={{ fontSize: 12, color: '#92400e', marginBottom: 10 }}>⚠ This will replace the existing target file for all KAMs.</div>}
                    <button onClick={confirmMasterUpload} style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                      {hasUploaded ? 'Confirm Replace' : 'Confirm Upload'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* KAM status chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {allKamNames.map(kam => {
                const meta = getTargetMeta(kam, selMonth);
                return (
                  <div key={kam} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 999, border: `1px solid ${meta ? '#bbf7d0' : '#fecaca'}`, background: meta ? '#f0fdf4' : '#fef2f2', fontSize: 12 }}>
                    <span style={{ color: meta ? '#16a34a' : '#ef4444', fontWeight: 700 }}>{meta ? '✓' : '✗'}</span>
                    <span style={{ fontWeight: 600 }}>{kam}</span>
                    {meta && <span style={{ color: '#6b7280', fontSize: 11 }}>{meta.rowCount} rows</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderRiskView() {
    const kamsWithData = displayKams.filter(k => kamDataMap[k]?.meta);
    const critical = kamsWithData.filter(k => kamDataMap[k].totalPct < 50).length;
    const atRisk   = kamsWithData.filter(k => kamDataMap[k].totalPct >= 50 && kamDataMap[k].totalPct < 80).length;
    const onTrack  = kamsWithData.filter(k => kamDataMap[k].totalPct >= 80).length;
    const allSorted = [...displayKams].sort((a, b) => (kamDataMap[b]?.totalGap ?? 0) - (kamDataMap[a]?.totalGap ?? 0));
    const sorted = riskFilter === 'critical' ? allSorted.filter(k => { const d = kamDataMap[k]; return d?.meta && d.totalPct < 50; })
      : riskFilter === 'atrisk' ? allSorted.filter(k => { const d = kamDataMap[k]; return d?.meta && d.totalPct >= 50 && d.totalPct < 80; })
      : riskFilter === 'ontrack' ? allSorted.filter(k => { const d = kamDataMap[k]; return d?.meta && d.totalPct >= 80; })
      : allSorted;

    function riskBadge(d: KamData | undefined) {
      if (!d?.meta) return { label: 'No Data', bg: '#f3f4f6', color: '#6b7280', border: '#d1d5db' };
      if (d.totalPct < 50) return { label: 'Critical', bg: '#fef2f2', color: '#ef4444', border: '#fecaca' };
      if (d.totalPct < 80) return { label: 'At Risk',  bg: '#fef3c7', color: '#92400e', border: '#fde68a' };
      return { label: 'On Track', bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' };
    }

    function topMiss(d: KamData): string | null {
      const all: Record<string, number> = {};
      for (const period of d.byPeriod) for (const c of period) all[c.customer] = (all[c.customer] ?? 0) + c.remaining;
      const entries = Object.entries(all).filter(([, r]) => r >= 1000).sort((a, b) => b[1] - a[1]);
      if (!entries.length) return null;
      return `${entries[0][0]}: ${fmtL(entries[0][1])}`;
    }

    const rhNames = [...new Set(Object.values(kamRhMap).filter(Boolean))].sort();
    const rhGroups = rhNames.map(rh => {
      const kams = displayKams.filter(k => kamRhMap[k] === rh && kamDataMap[k]?.meta);
      const target = kams.reduce((a, k) => a + kamDataMap[k].totalTarget, 0);
      const actual = kams.reduce((a, k) => a + kamDataMap[k].totalActual, 0);
      return { rh, kams: kams.length, target, actual, gap: target - actual, pct: target > 0 ? (actual / target) * 100 : 0 };
    }).filter(g => g.target > 0);

    const RTH = (align: 'left' | 'right' = 'right'): React.CSSProperties => ({
      padding: '10px 14px', textAlign: align, fontWeight: 700, fontSize: 11,
      color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5,
      background: 'var(--bg)', borderBottom: '2px solid var(--border)',
      borderRight: '1px solid var(--border)', whiteSpace: 'nowrap',
    });
    const RTD = (extra?: React.CSSProperties): React.CSSProperties => ({
      padding: '11px 14px', borderBottom: '1px solid var(--border)',
      borderRight: '1px solid var(--border)', ...extra,
    });

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Clickable filter cards */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { key: 'critical' as const, label: 'Critical KAMs', count: critical, bg: '#fef2f2', activeBg: '#ef4444', color: '#ef4444', border: '#fecaca', hint: '< 50% achievement' },
            { key: 'atrisk'   as const, label: 'At Risk KAMs',  count: atRisk,   bg: '#fef3c7', activeBg: '#f59e0b', color: '#92400e', border: '#fde68a', hint: '50–80% achievement' },
            { key: 'ontrack'  as const, label: 'On Track KAMs', count: onTrack,  bg: '#f0fdf4', activeBg: '#22c55e', color: '#16a34a', border: '#bbf7d0', hint: '≥ 80% achievement' },
          ].map(chip => {
            const isActive = riskFilter === chip.key;
            return (
              <div key={chip.key} onClick={() => setRiskFilter(isActive ? 'all' : chip.key)}
                style={{ padding: '12px 20px', borderRadius: 12, background: isActive ? chip.activeBg : chip.bg, border: `2px solid ${isActive ? chip.activeBg : chip.border}`, display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', transition: 'all 0.15s', minWidth: 160 }}>
                <div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: isActive ? '#fff' : chip.color, lineHeight: 1 }}>{chip.count}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: isActive ? '#fff' : chip.color, marginTop: 2 }}>{chip.label}</div>
                  <div style={{ fontSize: 10, color: isActive ? 'rgba(255,255,255,0.75)' : chip.color + '99', marginTop: 2 }}>{chip.hint}</div>
                </div>
                {isActive && <span style={{ marginLeft: 'auto', fontSize: 18, color: '#fff' }}>✓</span>}
              </div>
            );
          })}
          {riskFilter !== 'all' && (
            <button onClick={() => setRiskFilter('all')} style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text2)', alignSelf: 'center' }}>
              ✕ Show All
            </button>
          )}
        </div>

        {/* Risk table */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '2px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>
              KAM Risk Table — {monthLabel}
              {riskFilter !== 'all' && <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: 'var(--text3)' }}>({sorted.length} KAMs shown)</span>}
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...RTH('left'), minWidth: 140 }}>KAM</th>
                  <th style={{ ...RTH('left') }}>Risk</th>
                  <th style={{ ...RTH(), background: '#eff6ff' }}>
                    <div style={{ color: '#1d4ed8' }}>Target</div>
                  </th>
                  <th style={{ ...RTH(), background: '#f0fdf4' }}>
                    <div style={{ color: '#15803d' }}>Actual</div>
                  </th>
                  <th style={{ ...RTH() }}>Gap</th>
                  <th style={{ ...RTH() }}>Achievement</th>
                  <th style={{ ...RTH() }}>MoM</th>
                  <th style={{ ...RTH('left'), borderRight: 'none' }}>Top Miss</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((kam, idx) => {
                  const d = kamDataMap[kam];
                  const p = prevKamDataMap[kam];
                  const badge = riskBadge(d);
                  const mom = d?.meta && p?.meta ? d.totalPct - p.totalPct : null;
                  return (
                    <tr key={kam} style={{ background: idx % 2 === 0 ? 'transparent' : 'var(--bg)' }}>
                      <td style={{ ...RTD(), textAlign: 'left', fontWeight: 600 }}>
                        {kam}
                        {kamRhMap[kam] && <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>{kamRhMap[kam]}</div>}
                      </td>
                      <td style={{ ...RTD(), textAlign: 'left' }}>
                        <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>{badge.label}</span>
                      </td>
                      <td style={{ ...RTD({ background: '#eff6ff22' }), textAlign: 'right', color: '#1d4ed8', fontWeight: 600 }}>{d?.meta ? fmtL(d.totalTarget) : '—'}</td>
                      <td style={{ ...RTD({ background: '#f0fdf422' }), textAlign: 'right', color: '#15803d', fontWeight: 600 }}>{d?.meta ? fmtL(d.totalActual) : '—'}</td>
                      <td style={{ ...RTD(), textAlign: 'right', fontWeight: 600, color: d?.meta ? (d.totalGap > 0 ? '#ef4444' : '#22c55e') : 'var(--text3)' }}>
                        {d?.meta ? (d.totalGap > 0 ? `-${fmtL(d.totalGap)}` : `+${fmtL(Math.abs(d.totalGap))}`) : '—'}
                      </td>
                      <td style={{ ...RTD(), textAlign: 'right' }}>
                        {d?.meta ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                            <div style={{ width: 60, height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(100, d.totalPct)}%`, height: '100%', background: achieveColor(d.totalPct), borderRadius: 99 }} />
                            </div>
                            <span style={{ fontWeight: 700, color: achieveColor(d.totalPct), fontSize: 12, minWidth: 40 }}>{d.totalPct.toFixed(1)}%</span>
                          </div>
                        ) : '—'}
                      </td>
                      <td style={{ ...RTD(), textAlign: 'right', fontWeight: 600, fontSize: 12, color: mom === null ? 'var(--text3)' : mom >= 0 ? '#16a34a' : '#dc2626' }}>
                        {mom !== null ? `${mom >= 0 ? '▲' : '▼'} ${Math.abs(mom).toFixed(1)}%` : '—'}
                      </td>
                      <td style={{ ...RTD({ borderRight: 'none' }), textAlign: 'left', fontSize: 12 }}>
                        {d?.meta ? (topMiss(d) ? <span style={{ color: '#ef4444' }}>{topMiss(d)}</span> : <span style={{ color: '#22c55e' }}>All collected</span>) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {rhGroups.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '2px solid var(--border)', fontWeight: 700, fontSize: 14 }}>RH Aggregation</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['RH', 'KAMs', 'Target', 'Actual', 'Gap', 'Achievement'].map((h, hi) => (
                      <th key={h} style={{ ...RTH(hi < 2 ? 'left' : 'right'), borderRight: hi === 5 ? 'none' : '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rhGroups.map((g, idx) => (
                    <tr key={g.rh} style={{ background: idx % 2 === 0 ? 'transparent' : 'var(--bg)' }}>
                      <td style={{ ...RTD({ fontWeight: 600 }), textAlign: 'left' }}>{g.rh}</td>
                      <td style={{ ...RTD(), textAlign: 'left', color: 'var(--text2)' }}>{g.kams}</td>
                      <td style={{ ...RTD({ background: '#eff6ff22' }), textAlign: 'right', color: '#1d4ed8', fontWeight: 600 }}>{fmtL(g.target)}</td>
                      <td style={{ ...RTD({ background: '#f0fdf422' }), textAlign: 'right', color: '#15803d', fontWeight: 600 }}>{fmtL(g.actual)}</td>
                      <td style={{ ...RTD(), textAlign: 'right', fontWeight: 600, color: g.gap > 0 ? '#ef4444' : '#22c55e' }}>{g.gap > 0 ? `-${fmtL(g.gap)}` : `+${fmtL(Math.abs(g.gap))}`}</td>
                      <td style={{ ...RTD({ borderRight: 'none' }), textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                          <div style={{ width: 60, height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, g.pct)}%`, height: '100%', background: achieveColor(g.pct), borderRadius: 99 }} />
                          </div>
                          <span style={{ fontWeight: 700, color: achieveColor(g.pct), fontSize: 12 }}>{g.pct.toFixed(1)}%</span>
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
    );
  }

  function renderShortfallPanel() {
    if (!shortfallPanel) return null;
    const { kamName, period } = shortfallPanel;
    const data = kamDataMap[kamName];
    if (!data?.meta) return null;
    const p = data.periods[period - 1];
    const custList = [...data.byPeriod[period - 1]].sort((a, b) => b.remaining - a.remaining);
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '4px solid #ef4444', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Shortfall — {kamName} · P{period} ({p.label})</div>
          <button onClick={() => setShortfallPanel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text3)', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Customer', 'Target', 'Collected', 'Remaining', '%'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Customer' ? 'left' : 'right', fontWeight: 600, color: 'var(--text3)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {custList.map((c, ci) => (
                <tr key={ci} style={{ borderBottom: '1px solid var(--border)', background: ci % 2 === 0 ? 'transparent' : 'var(--bg)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{c.customer}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text2)' }}>{fmtL(c.target)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{fmtL(c.actual)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: c.remaining > 0 ? '#ef4444' : 'var(--text3)' }}>{c.remaining > 0 ? fmtL(c.remaining) : '—'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: achieveColor(c.pct) }}>{c.pct.toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderMasterShortfallPanel() {
    const [yr, mo] = selMonth.split('-').map(Number);
    const dim = new Date(yr, mo, 0).getDate();
    const periodEnds = [new Date(yr, mo - 1, 10), new Date(yr, mo - 1, 20), new Date(yr, mo - 1, dim)];
    const periodLabels = ['1–10', '11–20', `21–${dim}`];
    const today = new Date();
    type SE = { customer: string; kamName: string; rh: string; period: number; periodLabel: string; target: number; actual: number; remaining: number; daysOverdue: number; status: string };
    const entries: SE[] = [];
    for (const kamName of displayKams) {
      const data = kamDataMap[kamName]; if (!data?.meta) continue;
      const rh = kamRhMap[kamName] ?? 'Unassigned';
      for (let pi = 0; pi < 3; pi++) {
        for (const c of data.byPeriod[pi]) {
          if (c.remaining <= 0) continue;
          entries.push({ customer: c.customer, kamName, rh, period: pi + 1, periodLabel: periodLabels[pi], target: c.target, actual: c.actual, remaining: c.remaining, daysOverdue: Math.max(0, Math.floor((today.getTime() - periodEnds[pi].getTime()) / 86400000)), status: c.actual === 0 ? 'Not Paid' : 'Partial' });
        }
      }
    }
    const sfKams = [...new Set(entries.map(e => e.kamName))].sort();
    const sfRhs  = [...new Set(entries.map(e => e.rh))].sort();
    let filtered = sfKamFilter ? entries.filter(e => e.kamName === sfKamFilter) : entries;
    filtered = sfRhFilter ? filtered.filter(e => e.rh === sfRhFilter) : filtered;
    filtered = sfSortDir === 'asc' ? [...filtered].reverse() : [...filtered].sort((a, b) => b.remaining - a.remaining);

    return (
      <div style={{ background: 'var(--surface)', border: '1px solid #fecaca', borderLeft: '4px solid #ef4444', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Shortfall Breakdown — {monthLabel}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>All customers with pending collections</div>
          </div>
          <button onClick={() => { setMasterShortfall(false); setSfKamFilter(''); setSfRhFilter(''); setSfSortDir('desc'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text3)', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ padding: '4px 12px', borderRadius: 999, background: '#fef2f2', color: '#ef4444', fontSize: 13, fontWeight: 600, border: '1px solid #fecaca' }}>Total Remaining: {fmtL(entries.reduce((a, e) => a + e.remaining, 0))}</span>
          <span style={{ padding: '4px 12px', borderRadius: 999, background: '#f3f4f6', color: '#374151', fontSize: 13, fontWeight: 600, border: '1px solid #d1d5db' }}>{entries.length} pending</span>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {(['desc', 'asc'] as const).map(d => (
              <button key={d} onClick={() => setSfSortDir(d)} style={{ padding: '5px 12px', border: 'none', fontSize: 12, cursor: 'pointer', background: sfSortDir === d ? 'var(--brand)' : 'var(--surface)', color: sfSortDir === d ? '#fff' : 'var(--text2)' }}>
                {d === 'desc' ? '↓ Highest' : '↑ Lowest'}
              </button>
            ))}
          </div>
          {sfKams.length > 1 && <select value={sfKamFilter} onChange={e => setSfKamFilter(e.target.value)} style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12 }}><option value="">All KAMs</option>{sfKams.map(k => <option key={k} value={k}>{k}</option>)}</select>}
          {sfRhs.length > 1 && <select value={sfRhFilter} onChange={e => setSfRhFilter(e.target.value)} style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12 }}><option value="">All RH</option>{sfRhs.map(r => <option key={r} value={r}>{r}</option>)}</select>}
          {(sfKamFilter || sfRhFilter) && <button onClick={() => { setSfKamFilter(''); setSfRhFilter(''); }} style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12 }}>Clear</button>}
          <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 'auto' }}>Showing {filtered.length} of {entries.length}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Customer', 'KAM', 'RH', 'Period', 'Target', 'Collected', 'Remaining', 'Days Overdue', 'Status'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: ['Target','Collected','Remaining','Days Overdue'].includes(h) ? 'right' : 'left', fontWeight: 600, color: 'var(--text3)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, idx) => {
                const overdueColor = e.daysOverdue > 30 ? '#b91c1c' : e.daysOverdue > 15 ? '#ef4444' : '#f59e0b';
                const badge = e.status === 'Not Paid' ? { bg: '#fef2f2', color: '#ef4444', border: '#fecaca' } : { bg: '#fef3c7', color: '#92400e', border: '#fde68a' };
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'var(--bg)' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.customer}>{e.customer}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--text2)' }}>{e.kamName}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--text3)', fontSize: 12 }}>{e.rh}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--text3)', fontSize: 12 }}>P{e.period} ({e.periodLabel})</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--text2)' }}>{fmtL(e.target)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{fmtL(e.actual)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#ef4444' }}>{fmtL(e.remaining)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: overdueColor }}>{e.daysOverdue > 0 ? `${e.daysOverdue}d` : 'Current'}</td>
                    <td style={{ padding: '9px 12px' }}><span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>{e.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // KAM role upload section
  function renderKamUpload() {
    const meta = getTargetMeta(myKam, selMonth);
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: showUpload ? '1px solid var(--border)' : 'none' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>My Target — {monthLabel}</div>
            {meta ? (
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Uploaded {new Date(meta.uploadedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' } as Intl.DateTimeFormatOptions)} · {meta.rowCount} rows</div>
            ) : uploadOverdue ? (
              <div style={{ fontSize: 12, color: '#ef4444', marginTop: 2 }}>Upload overdue — due by the 7th</div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Not uploaded yet — due by the 7th</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {meta && <button onClick={() => downloadOriginal(myKam)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 13 }}>Download</button>}
            <button onClick={() => { setUploadFor(myKam); setShowUpload(s => !s); if (!showUpload) { setPendingRows(null); setPendingFile(null); setParseError(''); setParseWarn(''); } }}
              style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {meta ? 'Replace' : 'Upload Target'}
            </button>
          </div>
        </div>
        {showUpload && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ padding: '8px 16px', borderRadius: 8, border: '2px dashed var(--border)', cursor: 'pointer', fontSize: 13, color: 'var(--text2)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-upload" />
              {pendingFile ? pendingFile.name : 'Choose Excel file (.xlsx)'}
              <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFileChange} />
            </label>
            {parseError && <div style={{ color: '#ef4444', fontSize: 12, padding: '7px 12px', background: '#fef2f2', borderRadius: 8 }}>{parseError}</div>}
            {parseWarn  && <div style={{ color: '#92400e', fontSize: 12, padding: '7px 12px', background: '#fef3c7', borderRadius: 8 }}>⚠ {parseWarn}</div>}
            {pendingRows && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                <span style={{ fontSize: 13, color: '#166534', flex: 1 }}><strong>{pendingRows.length} rows</strong> · Total {fmtL(pendingRows.reduce((a, r) => a + r.totalAmount, 0))}</span>
                <button onClick={confirmUpload} style={{ padding: '7px 20px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Confirm</button>
                <button onClick={cancelUpload} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────────

  const tabs: { id: ViewTab; label: string; show: boolean }[] = [
    { id: 'summary',     label: 'Summary Table', show: true },
    { id: 'performance', label: 'Performance',   show: true },
    { id: 'kamview',     label: 'KAM View',      show: true },
    { id: 'risk',        label: 'Risk View',      show: isAdminView || isRH },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 40 }}>

      {/* Controls bar */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={selMonth} onChange={e => { setSelMonth(e.target.value); localStorage.setItem('target_selMonth', e.target.value); setExpandedKam(null); }}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, cursor: 'pointer' }}>
          {getMonthOptions().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {(isAdminView || isRH) && (
          <select value={selKam} onChange={e => { setSelKam(e.target.value); setExpandedKam(null); }}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, cursor: 'pointer' }}>
            <option value="all">All KAMs</option>
            {allKamNames.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {tabs.filter(t => t.show).map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{ padding: '7px 16px', border: 'none', background: activeTab === t.id ? 'var(--brand)' : 'var(--surface)', color: activeTab === t.id ? '#fff' : 'var(--text2)', cursor: 'pointer', fontSize: 13, fontWeight: activeTab === t.id ? 600 : 400 }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {exportWarn && <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>No data to export</span>}
          <button onClick={exportExcel} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--brand)', background: 'var(--brand-light)', color: 'var(--brand)', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-table-export" /> Export
          </button>
        </div>
      </div>

      {/* Admin — Target upload always at top */}
      {isAdmin && renderUploadSection()}

      {/* KAM — own upload section */}
      {isKAM && renderKamUpload()}

      {/* Overdue alert */}
      {renderOverdueBanner()}

      {/* Tab content */}
      {activeTab === 'performance' && (
        <>
          {renderOverviewBanner()}
          {renderKamGrid()}
        </>
      )}
      {activeTab === 'summary'  && renderSummaryTable()}
      {activeTab === 'kamview'  && renderKamView()}
      {activeTab === 'risk'     && (isAdminView || isRH) && renderRiskView()}

      {/* Shortfall panels */}
      {shortfallPanel  && renderShortfallPanel()}
      {masterShortfall && renderMasterShortfallPanel()}
    </div>
  );
}
