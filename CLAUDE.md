# Delta Collections — Project Guide

## Stack
- **Frontend**: React + TypeScript + Vite (`npm run dev`)
- **Backend**: Express (`npm run dev:server`)
- **Database**: Neon PostgreSQL
- **Auth**: custom context, roles: `admin`, `rh`, `kam`

## Key commands
```bash
npm run dev          # Vite frontend (port 5173)
npm run dev:server   # Express backend
npx tsc --noEmit     # Type-check (no output = clean)
```

## Roles
- `admin` — full access, uploads master target file, sees all KAMs/RHs
- `rh` — sees their KAMs only
- `kam` — sees own data only, uploads their own target file

## Important files
| File | Purpose |
|------|---------|
| `src/pages/Target.tsx` | Target vs Actual page — main working file |
| `src/context/TargetContext.tsx` | Target upload/cache logic (`uploadMasterTarget`, `uploadTarget`) |
| `src/context/AuthContext.tsx` | Auth, user roles, `demoUsers` list |
| `src/context/TransactionsContext.tsx` | Matched transactions |
| `src/context/CustomersContext.tsx` | Customer→KAM→RH mapping |
| `src/api.ts` | API calls (`apiTargets.upload/getRows/getMeta/delete`) |
| `server/index.js` | Express routes |

## Target vs Actual page — architecture

### Types
```ts
type ViewTab = 'performance' | 'summary' | 'kamview' | 'risk';
type PeriodView = '10day' | '20day-p1p2' | '20day-p2p3';
```

### Default tab: `summary`
Tab order: Summary Table → Performance → KAM View → Risk View (admin/RH only)

### Period logic
- 3 periods per month: P1 (1–10), P2 (11–20), P3 (21–end)
- Unmet target carries forward: P1 gap → P2 effective target, P2 gap → P3
- 3 period view modes: 10-Day (P1/P2/P3) | 20-Day (P1+P2 | P3) | 20-Day (P1 | P2+P3)
- `getPeriodGroups(p3Label)` returns `{ piGroups, labels }` for any mode

### Upload flow
- **Admin**: single master Excel file with `KAM Name` column → `parseMasterTargetFile()` → `uploadMasterTarget()` loops per KAM
- **KAM**: individual Excel without KAM column → `parseTargetFile()` → `uploadTarget()`
- Upload section for admin is **always at the top of the page** (before tabs)
- Admin upload section has: Download (original file) + Replace buttons

### Summary table
- Default shows only Total Target + Actual columns
- "Period View" button (`showPeriodCols` state) reveals per-period columns
- Two-line column headers: name on top, date range `(1-10)` below
- Blue tint (`#eff6ff`) for Target cols, green tint (`#f0fdf4`) for Actual cols
- Sortable by any column; KAM filter dropdown for admin/RH
- `TH()` / `TD()` style helpers with `borderRight` for clear grid lines

### Export (`exportExcel`)
- Mirrors the Summary Table **exactly**: same columns, period view, sort, KAM filter
- Includes grand total row at bottom

### KAM View (Performance tab)
- Cards grouped by RH
- Click a card → full-width detail panel expands below the entire RH group
- Detail shows period timeline + customer breakdown table

### Risk View (admin/RH only)
- 3 clickable cards: Critical (<50%) | At Risk (50–80%) | On Track (≥80%)
- Clicking a card filters the KAM Risk Table; click again or "Show All" to reset
- `riskFilter` state: `'all' | 'critical' | 'atrisk' | 'ontrack'`
- Table uses `RTH()` / `RTD()` style helpers (same border pattern as Summary)

### Month-over-month comparison
- `prevKamDataMap` computed via `prevMonthOf(selMonth)`
- MoM delta shown on KAM cards and in Risk table

### Key state
```ts
const [activeTab, setActiveTab]       = useState<ViewTab>('summary');
const [periodView, setPeriodView]     = useState<PeriodView>('10day');
const [showPeriodCols, setShowPeriodCols] = useState(false);
const [expandedKam, setExpandedKam]   = useState<string | null>(null);
const [riskFilter, setRiskFilter]     = useState<'all'|'critical'|'atrisk'|'ontrack'>('all');
const [summarySort, setSummarySort]   = useState<{col:string;dir:'asc'|'desc'}>({col:'shortfall',dir:'desc'});
const [summaryKamFilter, setSummaryKamFilter] = useState('');
```

## Coding conventions
- Inline styles only (no CSS files / Tailwind in this page)
- CSS variables: `var(--surface)`, `var(--bg)`, `var(--border)`, `var(--brand)`, `var(--text)`, `var(--text2)`, `var(--text3)`
- Color helpers: `achieveColor(pct)` → green/amber/red; `statusLabel(pct)` → On Track/At Risk/Critical
- `fmtL(n)` formats numbers as ₹ Lakhs / Crores
- `borderCollapse: 'collapse'` on all tables
- No comments unless the WHY is non-obvious
