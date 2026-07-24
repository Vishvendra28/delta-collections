import type { Rule, ExcludePattern, CompanyScopedExclude } from '../data/rules';

export interface MatchResult {
  matched: boolean;
  customer?: string;
  ruleId?: string;
  excluded?: boolean;
  excludeReason?: string;
  fuzzyCustomer?: string;
  fuzzyRuleId?: string;
}

export interface DetectedColumns {
  date?: string;
  narration?: string;
  amount?: string;      // generic single amount column
  deposit?: string;     // separate credit/deposit amount column
  withdrawal?: string;  // separate debit/withdrawal amount column
  creditFlag?: string;  // C/D flag column
  ref?: string;
}

export interface ColumnOverride {
  date?: string;
  narration?: string;
  amount?: string;
  deposit?: string;
  creditFlag?: string;
  creditValues?: string; // comma-separated values treated as credit, e.g. "C,CR,Credit"
  ref?: string;
}

// ─── Column detection patterns ────────────────────────────────────────────────

const COL_PATTERNS: Array<{ role: keyof DetectedColumns; pattern: RegExp }> = [
  // Deposit/credit amount column — check BEFORE generic amount
  // ^cr$ catches plain "CR" column (Axis Bank); ^credit$ catches "Credit"
  { role: 'deposit',      pattern: /deposit|^cr$|^credit$|cr[\s_-]*amt|credit[\s_-]*amount|received[\s_-]*amt|^in$|receipt|money[\s_-]*in/i },
  // Withdrawal/debit amount column — check BEFORE generic amount
  // ^dr$ catches plain "DR" column (Axis Bank); ^debit$ catches "Debit"
  { role: 'withdrawal',   pattern: /withdrawal|^dr$|^debit$|dr[\s_-]*amt|debit[\s_-]*amount|paid[\s_-]*amt|^out$|money[\s_-]*out/i },
  // Credit/debit flag column — \bmode\b restricted to ^mode$ to avoid matching "Mode Of Payment"
  // debit\s*[\/|]\s*credit catches HDFC "Debit / Credit" column (values: D/C)
  { role: 'creditFlag',   pattern: /c\.d\.|cr[\s\/]dr|dr[\s\/]cr|debit\s*[\/|]\s*credit|credit\s*[\/|]\s*debit|\bflag\b|\bfalg\b|\btype\b|^mode$|indicator|txn[\s_-]*type|tran[\s_-]*type/i },
  // Generic amount — \bvalue\b blocked when followed by date-like suffix (Value Date, Value Dt, Value Day)
  { role: 'amount',       pattern: /\bamount\b|\bamt\b|\bvalue(?!\s*d[ait])\b|amount[\s_-]*inr|inr[\s_-]*amount|tran[\s_-]*amount/i },
  // Date
  { role: 'date',         pattern: /\bdate\b|^dt$|val[\s_-]*date|txn[\s_-]*date|trans[\s_-]*date|posting[\s_-]*date|book[\s_-]*date/i },
  // Narration
  { role: 'narration',    pattern: /narration|description|particulars|details|remarks|^desc$|particular|transaction[\s_-]*details|tran[\s_-]*desc/i },
  // Reference
  { role: 'ref',          pattern: /\bref\b|cheque|chq|\butr\b|trans[\s_-]*id|txn[\s_-]*id|tran[\s_-]*id|reference[\s_-]*no|ref[\s_-]*no|instrument/i },
];

export function detectColumns(headers: string[]): DetectedColumns {
  const result: DetectedColumns = {};
  for (const h of headers) {
    const hTrim = h.trim();
    for (const { role, pattern } of COL_PATTERNS) {
      if (!result[role] && pattern.test(hTrim)) {
        result[role] = hTrim;
        break;
      }
    }
  }
  return result;
}

// ─── Credit values ────────────────────────────────────────────────────────────

const CREDIT_VALUES = new Set(['C', 'CR', 'CREDIT', 'CRE', 'IN', 'RECEIPT', 'RECEIVED', 'DEP', 'DEPOSIT', '+', 'INWARD']);
const DEBIT_VALUES  = new Set(['D', 'DR', 'DEBIT', 'DEB', 'OUT', 'PAID', 'WITHDRAWAL', 'WD', 'WIT', '-', 'OUTWARD']);

function isCredit(val: string, customCreditValues?: string): boolean {
  const v = val.trim().toUpperCase();
  if (customCreditValues) {
    const customs = customCreditValues.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (customs.includes(v)) return true;
    // also check if none of the debit values match → still a credit
  }
  if (CREDIT_VALUES.has(v)) return true;
  if (DEBIT_VALUES.has(v))  return false;
  // Partial match fallback
  if (v.startsWith('CR') || v.endsWith('CR')) return true;
  if (v.startsWith('DR') || v.endsWith('DR')) return false;
  return false;
}

function getVal(row: Record<string, string>, col: string | undefined): string {
  if (!col) return '';
  // exact match first
  if (col in row) return row[col] ?? '';
  // case-insensitive fallback
  const key = Object.keys(row).find(k => k.trim().toLowerCase() === col.toLowerCase());
  return key ? (row[key] ?? '') : '';
}

function parseNum(raw: string): number {
  // Strip currency symbols, commas, spaces; handle "(1234)" as negative
  const s = raw.replace(/[₹$,\s]/g, '').replace(/\((\d+\.?\d*)\)/, '-$1').trim();
  // Handle "1000CR" or "1000DR" suffix
  if (/\d(CR)$/i.test(s))  return parseFloat(s);
  if (/\d(DR)$/i.test(s))  return -parseFloat(s);
  return parseFloat(s) || 0;
}

// ─── Smart row parsers ────────────────────────────────────────────────────────

export function smartIsCreditRow(
  row: Record<string, string>,
  cols: DetectedColumns,
  override?: ColumnOverride,
): boolean {
  const ov = override ?? {};

  // 1. Flag column (C.D.Falg, Type, CR/DR etc.)
  const flagCol = ov.creditFlag ?? cols.creditFlag;
  if (flagCol) {
    return isCredit(getVal(row, flagCol), ov.creditValues);
  }

  // 2. Separate deposit column
  const depCol = ov.deposit ?? cols.deposit;
  if (depCol) {
    const v = parseNum(getVal(row, depCol));
    return v > 0;
  }

  // 3. Generic amount column — check for CR/DR suffix or positive sign
  const amtCol = ov.amount ?? cols.amount;
  if (amtCol) {
    const raw = getVal(row, amtCol).trim();
    if (/cr$/i.test(raw)) return true;
    if (/dr$/i.test(raw)) return false;
    // If there's also a withdrawal column, treat positive amount as credit
    const wdCol = cols.withdrawal;
    if (wdCol) {
      const wdVal = parseNum(getVal(row, wdCol));
      return wdVal <= 0;
    }
    // Signed amount: positive = credit
    return parseNum(raw) > 0;
  }

  return false;
}

export function smartParseAmount(
  row: Record<string, string>,
  cols: DetectedColumns,
  override?: ColumnOverride,
): number {
  const ov = override ?? {};

  // Deposit column
  const depCol = ov.deposit ?? cols.deposit;
  if (depCol) {
    const v = parseNum(getVal(row, depCol));
    if (v > 0) return Math.round((v + Number.EPSILON) * 100) / 100;
  }

  // Generic amount (absolute value — sign already determined by isCreditRow)
  const amtCol = ov.amount ?? cols.amount;
  if (amtCol) {
    const raw = Math.abs(parseNum(getVal(row, amtCol).replace(/[CcDdRr]+$/, '')));
    return Math.round((raw + Number.EPSILON) * 100) / 100;
  }

  return 0;
}

export function smartGetNarration(
  row: Record<string, string>,
  cols: DetectedColumns,
  override?: ColumnOverride,
): string {
  const col = override?.narration ?? cols.narration;
  return getVal(row, col).trim();
}

export function smartGetRefNo(
  row: Record<string, string>,
  cols: DetectedColumns,
  override?: ColumnOverride,
): string {
  const col = override?.ref ?? cols.ref;
  return getVal(row, col).trim();
}

// ─── Smart date parser ────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

export function smartParseDate(raw: string): string {
  if (!raw) return new Date().toISOString().slice(0, 10);

  // Strip time suffix and trim
  const s = raw.trim().split(/\s+/)[0].replace(/T.*$/, '').trim();

  // ISO: YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  const iso = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (Indian default)
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${year}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
  }

  // "01 Jun 2026" or "01-Jun-26" or "01/Jun/2026"
  const dMonY = s.match(/^(\d{1,2})[\s\-\/]([A-Za-z]{3,})[\s\-\/,]*(\d{2,4})$/);
  if (dMonY) {
    const m = MONTH_MAP[dMonY[2].toLowerCase().slice(0, 3)];
    if (m) {
      const year = dMonY[3].length === 2 ? `20${dMonY[3]}` : dMonY[3];
      return `${year}-${m}-${dMonY[1].padStart(2,'0')}`;
    }
  }

  // "Jun 01, 2026" or "Jun 01 2026"
  const monDY = s.match(/^([A-Za-z]{3,})[\s\-\/,]+(\d{1,2})[\s\-\/,]+(\d{2,4})$/);
  if (monDY) {
    const m = MONTH_MAP[monDY[1].toLowerCase().slice(0, 3)];
    if (m) {
      const year = monDY[3].length === 2 ? `20${monDY[3]}` : monDY[3];
      return `${year}-${m}-${monDY[2].padStart(2,'0')}`;
    }
  }

  return s;
}

// ─── Legacy: kept for backward compat (not used in new Import) ────────────────

function normalize(s: string): string { return s.toUpperCase().trim(); }

export function matchNarration(
  narration: string,
  rules: Rule[],
  excludePatterns: ExcludePattern[],
  companyScopedExcludes: CompanyScopedExclude[] = [],
  company = '',
): MatchResult {
  const n = normalize(narration);

  // Company-scoped excludes fire first — override even a matching customer rule
  if (company) {
    for (const cse of companyScopedExcludes) {
      if (cse.company === company && n.includes(normalize(cse.pattern))) {
        return { matched: false, excluded: true, excludeReason: cse.reason };
      }
    }
  }

  // Customer match first — a known customer always wins over any exclude pattern
  for (const rule of rules) {
    if (rule.compoundRules) {
      for (const cr of rule.compoundRules) {
        if (cr.allOf.every(k => n.includes(normalize(k)))) {
          return { matched: true, customer: rule.customer, ruleId: rule.id };
        }
      }
    }
  }
  for (const rule of rules) {
    for (const kw of rule.keywords) {
      if (n.includes(normalize(kw))) {
        return { matched: true, customer: rule.customer, ruleId: rule.id };
      }
    }
  }

  // Fuzzy safety net — catch RTGS truncated / concatenated names before exclude patterns
  // Strips spaces from the narration to handle "BALAJIACTIONBUILDWELLP" style RTGS narrations.
  // Needs 2+ significant words to hit (or 1 if the customer has only 1 significant word).
  const SKIP = new Set(['LIMITED', 'PRIVATE', 'INDIA', 'PVT', 'LTD', 'AND', 'THE',
    'INDUSTRIES', 'SOLUTIONS', 'SERVICES', 'COMPANY', 'SUPPLY', 'CHAIN']);
  const nNoSpace = n.replace(/\s+/g, '');
  for (const rule of rules) {
    const sigWords = rule.customer.toUpperCase().split(/\s+/)
      .filter(w => w.length > 4 && !SKIP.has(w));
    if (sigWords.length === 0) continue;
    const hits = sigWords.filter(w => nNoSpace.includes(w));
    const threshold = sigWords.length === 1 ? 1 : 2;
    if (hits.length >= threshold) {
      return { matched: false, fuzzyCustomer: rule.customer, fuzzyRuleId: rule.id };
    }
  }

  // Exclude patterns — only reached if no customer matched (exact or fuzzy)
  for (const ep of excludePatterns) {
    if (n.includes(normalize(ep.pattern))) {
      return { matched: false, excluded: true, excludeReason: ep.reason };
    }
  }

  return { matched: false };
}

// Legacy stubs — kept so nothing else breaks
export function isCreditRow(row: Record<string, string>): boolean {
  const cols = detectColumns(Object.keys(row));
  return smartIsCreditRow(row, cols);
}
export function parseAmount(row: Record<string, string>): number {
  const cols = detectColumns(Object.keys(row));
  return smartParseAmount(row, cols);
}
export function getNarration(row: Record<string, string>): string {
  const cols = detectColumns(Object.keys(row));
  return smartGetNarration(row, cols);
}
export function getRefNo(row: Record<string, string>): string {
  const cols = detectColumns(Object.keys(row));
  return smartGetRefNo(row, cols);
}
