export interface Rule {
  id: string;
  customer: string;
  keywords: string[];
  compoundRules?: { allOf: string[] }[];
  excludeKeywords?: string[];
  note?: string;
  source: 'system' | 'manual';
  createdAt: string;
}

export interface ExcludePattern {
  pattern: string;
  reason: string;
}

export interface CompanyScopedExclude {
  id: string;
  pattern: string;
  company: string;
  reason: string;
}

export const COMPANY_SCOPED_EXCLUDES: CompanyScopedExclude[] = [
  { id: 'CSE-001', pattern: 'SUNFLAG', company: 'Transin', reason: 'Sunflag Iron & Steel Co Ltd is not a Transin collection customer' },
  { id: 'CSE-002', pattern: 'VAISHNO WIRE', company: 'Transin', reason: 'Vaishno Wire PVT LTD is not a Transin collection customer' },
  { id: 'CSE-003', pattern: 'GRO DIGITAL', company: 'Transin', reason: 'GRO Digital Platforms Limited is not a Transin collection customer' },
];

export const EXCLUDE_PATTERNS: ExcludePattern[] = [
  { pattern: 'BRN', reason: 'Branch transfer' },
  { pattern: 'RTGS', reason: 'RTGS internal' },
  { pattern: 'INB', reason: 'Internet banking transfer' },
  { pattern: 'TERM DEPOSIT', reason: 'Term Deposit' },
  { pattern: 'Int.Coll', reason: 'Bank interest' },
  { pattern: 'Escrow Trf', reason: 'Internal escrow transfer' },
  { pattern: 'REFUND OF ESCROW', reason: 'Internal escrow refund' },
  { pattern: 'ZAST LOGISOLUT-Transin', reason: 'Internal inter-account transfer' },
  { pattern: 'ZAST LOGISOLUT-Zast', reason: 'Internal transfer' },
  { pattern: 'REV-IMPS', reason: 'Reversal of IMPS' },
  { pattern: 'NEFT RETURN', reason: 'Bounced NEFT' },
  { pattern: 'DELHIVERY', reason: 'Delhivery Limited - not a customer' },
  { pattern: 'VENTURA TRADIN', reason: 'Ventura Trading - not a customer' },
  { pattern: 'SCORPION EXPRESS', reason: 'Scorpion Express - not a customer' },
  { pattern: 'SHRI NEEL MADHAV', reason: 'Shri Neel Madhav Industries - not a customer' },
  { pattern: 'NANDAN STEELS', reason: 'Nandan Steels and Power - not a customer' },
];

export const DEFAULT_RULES: Rule[] = [
  {
    id: 'R-001', customer: 'HINDUSTAN UNILEVER LIMITED',
    keywords: ['HINDUSTAN UNILEVER', 'HINDUNILVR'],
    compoundRules: [{ allOf: ['CITIN266', 'HINDUSTAN UNILEVER'] }],
    note: 'CITIN266 alone is NOT enough — must also contain company name',
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-002', customer: 'ASIAN PAINTS LIMITED',
    keywords: ['ASIAN PAINTS', 'ASIANPAINT'],
    compoundRules: [{ allOf: ['HDFCH010', 'ASIAN PAINTS'] }],
    note: 'HDFCH010 is an HDFC branch code shared by multiple companies — must appear alongside ASIAN PAINTS',
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-003', customer: 'ITC LIMITED',
    keywords: ['ITC LIMITED', 'ITC LTD', 'ITC-ABD'],
    note: 'Never use ITC alone — too short',
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-004', customer: 'PERFETTI VAN MELLE INDIA PRIVATE LIMITED',
    keywords: ['PERFETTI', 'PVMIL', 'PERFETTI VAN MELLE', 'PMVBRY'],
    note: 'PMVBRY is Perfetti\'s ACH clearing code — unique to them in this bank',
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-005', customer: 'VOLTAS LIMITED',
    keywords: ['VOLTAS'],
    compoundRules: [{ allOf: ['CITIN266', 'VOLTAS'] }],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-006', customer: 'PIDILITE INDUSTRIES LIMITED',
    keywords: ['PIDILITE'],
    compoundRules: [{ allOf: ['CITIN266', 'PIDILITE'] }],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-007', customer: 'SAINT-GOBAIN INDIA PRIVATE LIMITED',
    keywords: ['SGIPL', 'GYPROC', 'SAINT GOBAIN', 'SGIPLN'],
    compoundRules: [{ allOf: ['CITIN266', 'SGIPL'] }],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-008', customer: 'JINDAL STEEL & POWER LTD.',
    keywords: ['JINDAL STEEL', 'JINDAL STEEL AND POWER', 'JINDAL STEEL & POWER'],
    compoundRules: [{ allOf: ['JSWP', 'JINDAL'] }],
    note: 'JSWP is a short code — must appear alongside JINDAL',
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-009', customer: 'Nestle India Ltd',
    keywords: ['NESTLE', 'NESTL', 'DEUT0796DEL'],
    note: 'DEUT0796DEL is Deutsche Bank branch code unique to Nestle in Zast HDFC — different from DEUTH00 (Bunge)',
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-010', customer: 'VALVOLINE CUMMINS PRIVATE LIMITED',
    keywords: ['VALVOLINE', 'VALVOLINE CUMMINS'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-011', customer: 'Apar Industries Limited',
    keywords: ['APAR INDUSTRIES', 'APAR IND', 'VALOR INNOVATIONS'],
    note: 'Apar pays via Valor Innovations Private Limited as intermediary — narration never says APAR',
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-012', customer: 'Epsilon Carbon Pvt Limited',
    keywords: ['EPSILON', 'EPSILON CARBON'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-013', customer: 'Colgate-Palmolive (India) Limited',
    keywords: ['COLGATE', 'COLGATE-PALMOLIVE', 'COLGATE PALMOLIVE'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-014', customer: 'Qwik Supply Chain Pvt Ltd',
    keywords: ['QWIK', 'QWIK SUPPLY', 'HDF0231522'],
    note: 'HDF0231522 is Qwik\'s HDFC payer code — unique to them; ACH/HDFC payments omit the company name',
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-015', customer: 'BUNGE INDIA PRIVATE LIMITED',
    keywords: ['BUNGE INDIA', 'BUNGE'],
    compoundRules: [{ allOf: ['DEUTH00', 'BUNGE'] }],
    note: 'DEUTH00 is a Deutsche Bank clearing code — must appear alongside BUNGE',
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-016', customer: 'Balaji Action Buildwell Pvt LTD',
    keywords: ['BALAJI ACTION', 'BALAJIACTION', 'BALAJI ACTION BUILDWELL'],
    compoundRules: [{ allOf: ['SELCR', 'ACH/CR'] }],
    note: 'SELCR+ACH/CR = Balaji ACH/NACH format; BALAJIACTION (no space) = RTGS truncated format',
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-017', customer: 'TATA STEEL LIMITED',
    keywords: ['TATA STEEL', 'FINANCIAL SUPPLY CHAIN MANAGEMENT'],
    note: 'Tata Steel SCF payments routed via Financial Supply Chain Management (ICIC0099999) — narration never says TATA STEEL',
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-018', customer: 'AKZO NOBEL INDIA LIMITED',
    keywords: ['AKZO NOBEL', 'AKZONOBEL'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-019', customer: 'Parle Agro Pvt Ltd',
    keywords: ['PARLE AGRO'],
    compoundRules: [{ allOf: ['0811OP', 'PARLE'] }],
    note: '0811OP is an ACH/NACH code — must appear alongside PARLE',
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-020', customer: 'STEEL INFRA SOLUTIONS PRIVATE LIMITED',
    keywords: ['STEEL INFRA', 'STEEL INFRA SOLUTIONS'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-021', customer: 'Prince Pipes And Fittings Ltd',
    keywords: ['PRINCE PIPES', 'PRINCE PIPE'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-022', customer: 'TVS Supply Chain Solutions Ltd.',
    keywords: ['TVS SUPPLY', 'TVS SUPPLY CHAIN'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-023', customer: 'GRAVITA INDIA LIMITED',
    keywords: ['GRAVITA INDIA', 'GRAVITA'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-024', customer: 'Exide Industries Limited',
    keywords: ['EXIDE INDUSTRIES', 'EXIDE IND'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-025', customer: 'JSW PAINTS LIMITED',
    keywords: ['JSW PAINTS'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-026', customer: 'BERGER PAINTS LIMITED',
    keywords: ['BERGER PAINTS', 'BERGER'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-027', customer: 'ORIENT ELECTRIC LIMITED',
    keywords: ['ORIENT ELECTRIC'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-028', customer: 'LIVGUARD ENERGY TECHNOLOGIES PRIVATE LIMITED',
    keywords: ['LIVGUARD'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-029', customer: 'JTL INDUSTRIES LIMITED',
    keywords: ['JTL INDUSTRIES', 'JTL IND'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-030', customer: 'GARG TUBE EXPORT LLP',
    keywords: ['GARG TUBE'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-031', customer: 'SYSTEMATIC INDUSTRIES PRIVATE LIMITED',
    keywords: ['SYSTEMATIC INDUSTRIES', 'SYSTEMATIC IND'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-032', customer: 'IVL Dhunseri Petrochem Industries Private Limited',
    keywords: ['IVL DHUNSERI', 'DHUNSERI'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-033', customer: 'SINGHANIA RESOURCES PRIVATE LIMITED',
    keywords: ['SINGHANIA RESOURCES', 'SINGHANIA'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-034', customer: 'INDORAMA YARNS PRIVATE LIMITED',
    keywords: ['INDORAMA YARNS', 'INDORAMA'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-035', customer: 'SOUTHERN CARGO LOGISTICS PRIVATE LIMITED',
    keywords: ['SOUTHERN CARGO'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-036', customer: 'NCUBATE INDIA SERVICES PRIVATE LIMITED',
    keywords: ['NCUBATE'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-037', customer: 'Ayansh Global Private Limited',
    keywords: ['AYANSH GLOBAL', 'AYANSH'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-038', customer: 'NAVEEN JAIN METAL UDYOG',
    keywords: ['NAVEEN JAIN METAL', 'NAVEEN JAIN'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-039', customer: 'RUKMANI ELECTRICAL AND COMPONENTS PVT. LTD.',
    keywords: ['RUKMANI ELECTRICAL', 'RUKMANI'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-040', customer: 'J P Traders',
    keywords: ['J P TRADERS', 'JP TRADERS'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-041', customer: 'THE BOMBAY SEEDS SUPPLY COMPANY',
    keywords: ['BOMBAY SEEDS', 'THE BOMBAY SEEDS'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-042', customer: 'MOHIT Enterprises',
    keywords: ['MOHIT ENTERPRISES'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-043', customer: 'Bright Metals India Pvt Ltd',
    keywords: ['BRIGHT METALS'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-044', customer: 'Mittal Steels',
    keywords: ['MITTAL STEELS'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-045', customer: 'SHREE METAL TRADERS',
    keywords: ['SHREE METAL TRADERS', 'SHREE METAL'],
    source: 'system', createdAt: '2026-07-01',
  },
  {
    id: 'R-046', customer: 'Birla Opus',
    keywords: ['BIRLA OPUS', 'GRASIM IND', 'GRASIM'],
    note: 'Grasim Ind Ltd-Paints Div is the legal sender name; rebranded to Birla Opus',
    source: 'system', createdAt: '2026-07-21',
  },
  {
    id: 'R-047', customer: 'Keventer Agro Limited',
    keywords: ['KEVENTER AGRO', 'KEVENTER'],
    source: 'system', createdAt: '2026-07-21',
  },
  {
    id: 'R-048', customer: 'AMARJIT & SONS',
    keywords: ['AMARJIT AND SONS', 'AMARJIT & SONS', 'AMARJIT'],
    source: 'system', createdAt: '2026-07-21',
  },
  {
    id: 'R-049', customer: 'SRISHTI METALS PRIVATE LIMITED_Zast',
    keywords: ['SRISHTI METALS', 'SRISHTI'],
    source: 'system', createdAt: '2026-07-21',
  },
  {
    id: 'R-050', customer: 'TRANSRAIL LIGHTING LIMITED',
    keywords: ['TRANSRAIL LIGHTING', 'TRANSRAIL'],
    source: 'system', createdAt: '2026-07-21',
  },
  {
    id: 'R-051', customer: 'Godawari Power And Ispat Limited',
    keywords: ['GODAWARI POWER', 'GODAWARI', 'R.R. ISPAT'],
    source: 'system', createdAt: '2026-07-21',
  },
  {
    id: 'R-052', customer: 'MRF LIMITED (DAHEJ)',
    keywords: ['MRF LIMITED'],
    note: 'Use MRF LIMITED not MRF alone — too short',
    source: 'system', createdAt: '2026-07-21',
  },
  {
    id: 'R-053', customer: 'DANIELI CORUS REFRACTORY SOLUTIONS PVT LTD',
    keywords: ['DANIELI CORUS', 'DANIELI'],
    source: 'system', createdAt: '2026-07-21',
  },
  {
    id: 'R-054', customer: 'REGAAL RESOURCES LIMITED',
    keywords: ['REGAAL RESOURCES', 'REGAAL'],
    source: 'system', createdAt: '2026-07-21',
  },
  {
    id: 'R-055', customer: 'ASMI METAL PRODUCTS',
    keywords: ['ASMI METAL PRODUCTS', 'ASMI METAL'],
    source: 'system', createdAt: '2026-07-21',
  },
  {
    id: 'R-056', customer: 'BAJAJ ELECTRICALS LIMITED',
    keywords: ['BAJAJ ELECTRICALS'],
    note: 'BAJAJ alone is too generic — must use full BAJAJ ELECTRICALS',
    source: 'system', createdAt: '2026-07-21',
  },
  {
    id: 'R-057', customer: 'PARAS METALS',
    keywords: ['PARAS METALS'],
    source: 'system', createdAt: '2026-07-21',
  },
  {
    id: 'R-058', customer: 'Bridge Track and Tower Pvt Ltd',
    keywords: ['BRIDGE TRACK AND TOWER', 'BRIDGE TRACK'],
    source: 'system', createdAt: '2026-07-21',
  },
  {
    id: 'R-059', customer: 'Yuantai International Supply Chain Management Private Limited',
    keywords: ['YUANTAI'],
    source: 'system', createdAt: '2026-07-21',
  },
  {
    id: 'R-060', customer: 'CENTURY PLYBOARDS (INDIA) LIMITED',
    keywords: ['CENTURY PLYBOARDS', 'CENTURY PLY'],
    source: 'system', createdAt: '2026-07-21',
  },
  {
    id: 'R-061', customer: 'BATA INDIA LIMITED',
    keywords: ['BATA INDIA', 'BATA'],
    source: 'system', createdAt: '2026-07-21',
  },
  {
    id: 'R-062', customer: 'DG CORPORATE INDIA MFG. PRIVATE LIMITED',
    keywords: ['DG CORPORATE INDIA', 'DG CORPORATE'],
    source: 'system', createdAt: '2026-07-21',
  },
  {
    id: 'R-066', customer: 'Octolife Climate Solutions Private Limited',
    keywords: ['OCTOLIFE'],
    source: 'system', createdAt: '2026-07-21',
  },
  {
    id: 'R-067', customer: 'REELOTEK METALS',
    keywords: ['REELOTEK METALS'],
    note: 'Use full name — REELOTEK alone would also match REELOTEK ESTATES (R-068)',
    source: 'system', createdAt: '2026-07-21',
  },
  {
    id: 'R-068', customer: 'REELOTEK ESTATES',
    keywords: ['REELOTEK ESTATES'],
    note: 'Use full name — REELOTEK alone would also match REELOTEK METALS (R-067)',
    source: 'system', createdAt: '2026-07-21',
  },
  {
    id: 'R-069', customer: 'Vaishno Wire PVT LTD',
    keywords: ['VAISHNO WIRE', 'VAISHNO'],
    source: 'system', createdAt: '2026-07-21',
  },
  {
    id: 'R-070', customer: 'Ultratech Cement Ltd',
    keywords: ['ULTRATECH CEMENT', 'ULTRATECH'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-071', customer: 'ITC-ABD-Transin',
    keywords: [],
    compoundRules: [{ allOf: ['ITC', 'TRANSIN'] }],
    note: 'Compound rule: ITC + TRANSIN to distinguish from ITC LIMITED (R-003)',
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-072', customer: 'SAINT - GOBAIN INDIA PRIVATE LIMITED',
    keywords: ['SGIPL', 'GYPROC', 'SAINT GOBAIN', 'SGIPLN'],
    note: 'Alternate name for SAINT-GOBAIN INDIA PRIVATE LIMITED (R-007) — R-007 will match first for identical narrations',
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-073', customer: 'SHRI BAJRANG POWER AND ISPAT LIMITED',
    keywords: ['SHRI BAJRANG', 'BAJRANG POWER', 'BAJRANG ISPAT'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-074', customer: 'ITC Spices',
    keywords: [],
    compoundRules: [{ allOf: ['ITC', 'SPICES'] }],
    note: 'Compound rule: ITC + SPICES to distinguish from ITC LIMITED (R-003)',
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-075', customer: 'Shyam Metallics and Energy Ltd',
    keywords: ['SHYAM METALLICS', 'SHYAM METAL'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-076', customer: 'ORIGAMI CELLULO PRIVATE LIMITED',
    keywords: ['ORIGAMI CELLULO', 'ORIGAMI'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-077', customer: 'Bunge India Pvt Ltd',
    keywords: ['BUNGE INDIA', 'BUNGE'],
    note: 'Alternate name for BUNGE INDIA PRIVATE LIMITED (R-015) — R-015 will match first for identical narrations',
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-078', customer: 'LARSEN & TOUBRO LIMITED',
    keywords: ['LARSEN TOUBRO', 'LARSEN & TOUBRO', 'L&T LIMITED', 'L & T LIMITED'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-079', customer: 'PASSIVE INFRA PROJECTS PRIVATE LIMITED',
    keywords: ['PASSIVE INFRA PROJECTS', 'PASSIVE INFRA'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-080', customer: 'N.RANGA RAO & SONS PRIVATE LIMITED',
    keywords: ['RANGA RAO', 'N RANGA RAO', 'N.RANGA RAO'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-081', customer: 'HINDUSTAN COCA COLA BEVERAGES PRIVATE LIMITED',
    keywords: ['HINDUSTAN COCA COLA', 'COCA COLA', 'HCCB'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-082', customer: 'FINOLEX CABLES LTD',
    keywords: ['FINOLEX CABLES', 'FINOLEX'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-083', customer: 'SOMANY CERAMICS LIMITED',
    keywords: ['SOMANY CERAMICS', 'SOMANY'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-084', customer: 'GRO DIGITAL PLATFORMS LIMITED',
    keywords: ['GRO DIGITAL PLATFORMS', 'GRO DIGITAL'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-085', customer: 'BALAJI ACTION BUILDWELL PRIVATE LIMITED',
    keywords: ['BALAJI ACTION', 'BALAJI ACTION BUILDWELL'],
    note: 'Alternate name for Balaji Action Buildwell Pvt LTD (R-016) — R-016 will match first for identical narrations',
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-086', customer: 'H VIKAS PIPE AND STEEL PRIVATE LIMITED (To Pay- Steel Infra)',
    keywords: ['H VIKAS PIPE', 'VIKAS PIPE AND STEEL'],
    note: 'Use full phrase — VIKAS alone is too generic',
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-087', customer: 'RHI MAGNESITA INDIA REFRACTORIES LIMITED',
    keywords: ['RHI MAGNESITA', 'MAGNESITA'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-088', customer: 'COLGATE PALMOLIVE INDIA LTD',
    keywords: ['COLGATE', 'COLGATE PALMOLIVE'],
    note: 'Alternate name for Colgate-Palmolive (India) Limited (R-013) — R-013 will match first for identical narrations',
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-089', customer: 'British Paints',
    keywords: ['BRITISH PAINTS'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-090', customer: 'UFLEX LIMITED',
    keywords: ['UFLEX'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-091', customer: 'Miura Infrastructure Pvt. Ltd',
    keywords: ['MIURA INFRA', 'MIURA INFRASTRUCTURE', 'MIURA'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-092', customer: 'VESUVIUS INDIA LIMITED',
    keywords: ['VESUVIUS'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-093', customer: 'TRANSRAIL LIGHTING LTD_Transin',
    keywords: ['TRANSRAIL LIGHTING', 'TRANSRAIL'],
    note: 'Alternate name for TRANSRAIL LIGHTING LIMITED (R-050) — R-050 will match first for identical narrations',
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-094', customer: 'HINDUSTAN PENCILS PRIVATE LIMITED',
    keywords: ['HINDUSTAN PENCILS', 'DOMS PENCILS'],
    note: 'NACH-TRE format is shared with Epsilon Carbon — cannot auto-match, goes to Manual Review',
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-095', customer: 'AGROHAAT RETAIL PRIVATE LIMITED',
    keywords: ['AGROHAAT'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-096', customer: 'K.P. ASSOCIATES',
    keywords: ['K P ASSOCIATES', 'KP ASSOCIATES', 'K.P. ASSOCIATES'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-097', customer: 'POLYCAB INDIA LIMITED',
    keywords: ['POLYCAB'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-098', customer: 'JINDAL STAINLESS LIMITED',
    keywords: ['JINDAL STAINLESS'],
    note: 'Must use JINDAL STAINLESS — JINDAL alone conflicts with R-008 (JINDAL STEEL & POWER)',
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-099', customer: 'JYOTHY LABS LIMITED',
    keywords: ['JYOTHY LABS', 'JYOTHY'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-100', customer: 'PERFETTI VAN MELLE',
    keywords: ['PERFETTI', 'PERFETTI VAN MELLE'],
    note: 'Alternate name for PERFETTI VAN MELLE INDIA PRIVATE LIMITED (R-004) — R-004 will match first for identical narrations',
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-101', customer: 'Everest Buildpro Private Limited',
    keywords: ['EVEREST BUILDPRO'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-102', customer: 'MATOD INDUSTRIES PRIVATE LIMITED',
    keywords: ['MATOD INDUSTRIES', 'MATOD'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-103', customer: 'NIVEA INDIA PRIVATE LIMITED',
    keywords: ['NIVEA'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-104', customer: 'Qwik Supply Chain Private Limited',
    keywords: ['QWIK', 'QWIK SUPPLY', 'HDF0231522'],
    note: 'Alternate name for Qwik Supply Chain Pvt Ltd (R-014) — R-014 will match first for identical narrations',
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-105', customer: 'SKS ISPAT & POWER LIMITED',
    keywords: ['SKS ISPAT', 'SKS POWER'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-106', customer: 'SJV INFRA PROJECTS PRIVATE LIMITED',
    keywords: ['SJV INFRA PROJECTS', 'SJV INFRA'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-107', customer: 'Century Panels Limited',
    keywords: ['CENTURY PANELS'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-108', customer: 'CENTURY PLYBOARDS (INDIA) LIMITED ( AD-37)',
    keywords: ['CENTURY PLYBOARDS', 'CENTURY PLY'],
    note: 'Alternate name for CENTURY PLYBOARDS (INDIA) LIMITED (R-060) — R-060 will match first for identical narrations',
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-109', customer: 'Sunflag Iron & Steel Co Ltd',
    keywords: ['SUNFLAG'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-110', customer: 'Nav Bharat Metalic Oxide',
    keywords: ['NAV BHARAT METALIC', 'NAV BHARAT', 'NAVBHARAT'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-111', customer: 'SHREE METAL TRADERS (RJ-08)',
    keywords: ['SHREE METAL TRADERS', 'SHREE METAL'],
    note: 'Alternate name for SHREE METAL TRADERS (R-045) — R-045 will match first for identical narrations',
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-112', customer: 'TOPWARTH STEEL AND POWER',
    keywords: ['TOPWARTH'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-113', customer: 'NESTLE INDIA LIMITED',
    keywords: ['NESTLE', 'NESTL'],
    note: 'Alternate name for Nestle India Ltd (R-009) — R-009 will match first for identical narrations',
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-114', customer: 'DEL MONTE FOODS PRIVATE LIMITED',
    keywords: ['DEL MONTE'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-115', customer: 'ALKEM LABORATORIES LTD',
    keywords: ['ALKEM LABORATORIES', 'ALKEM'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-116', customer: 'BAREERA FOOD INDUSTRIES',
    keywords: ['BAREERA'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-117', customer: 'BISLERI INTERNATIONAL PVT LTD',
    keywords: ['BISLERI'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-118', customer: 'WALKAROO INTERNATIONAL PVT. LTD.',
    keywords: ['WALKAROO'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-119', customer: 'D F M FOODS LTD',
    keywords: ['DFM FOODS', 'D F M FOODS', 'DFMFOODS'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-120', customer: 'DROOLS PET FOOD PRIVATE LIMITED',
    keywords: ['DROOLS'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-121', customer: 'GLENMARK PHARMACEUTICALS LTD',
    keywords: ['GLENMARK'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-122', customer: 'IB MONOTARO PRIVATE LIMITED',
    keywords: ['IB MONOTARO', 'MONOTARO'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-123', customer: 'MARICO LIMITED',
    keywords: ['MARICO'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-124', customer: 'STREAMBOX MEDIA PRIVATE LIMITED',
    keywords: ['STREAMBOX'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-125', customer: 'VIJAI ELECTRICALS LIMITED',
    keywords: ['VIJAI ELECTRICALS', 'VIJAI ELECTRIC'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-126', customer: 'WINGREENS FARMS PVT LTD',
    keywords: ['WINGREENS'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-127', customer: 'G.D.FOODS MANUFACTURING (INDIA) PRIVATE LIMITED',
    keywords: ['GD FOODS', 'G D FOODS', 'GDFOODS', 'G.D.FOODS'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-128', customer: 'ITC LIMITED-ABD',
    keywords: ['ITC LIMITED-ABD'],
    compoundRules: [{ allOf: ['ITC', 'ABD'] }],
    note: 'Compound ITC + ABD also catches RTGS format; ITC-ABD keyword in R-003 may match first',
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-129', customer: 'Havells India Ltd',
    keywords: ['HAVELLS'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-130', customer: 'Blue Star Limited',
    keywords: ['BLUE STAR LIMITED', 'BLUESTAR'],
    note: 'Use BLUE STAR LIMITED — BLUE STAR alone may match unrelated narrations',
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-131', customer: 'KINGSPAN JINDAL PRIVATE LIMITED',
    keywords: ['KINGSPAN JINDAL', 'KINGSPAN'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-132', customer: 'VoltBek Home Appliances Pvt. Ltd.',
    keywords: ['VOLTBEK'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-133', customer: 'SAMBHV STEEL TUBES LIMITED',
    keywords: ['SAMBHV STEEL', 'SAMBHV'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-134', customer: 'SWASTIK PIPE LIMITED',
    keywords: ['SWASTIK PIPE', 'SWASTIK'],
    note: 'Prefer SWASTIK PIPE — SWASTIK alone may be generic in some regions',
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-135', customer: 'LS CABLE INDIA PVT. LTD.',
    keywords: ['LS CABLE'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-136', customer: 'Hector Beverages Pvt Ltd',
    keywords: ['HECTOR BEVERAGES', 'HECTOR BEV'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-137', customer: 'Shivam Hi tech Steels Pvt Ltd',
    keywords: ['SHIVAM HI TECH', 'SHIVAM HITECH', 'SHIVAM HI-TECH'],
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-138', customer: 'HECTOR BEVERAGES (P) LTD',
    keywords: ['HECTOR BEVERAGES', 'HECTOR BEV'],
    note: 'Alternate name for Hector Beverages Pvt Ltd (R-136) — R-136 will match first for identical narrations',
    source: 'system', createdAt: '2026-07-22',
  },
  {
    id: 'R-139', customer: 'Modenik Lifestyle Private Limited',
    keywords: ['MODENIK'],
    source: 'system', createdAt: '2026-07-22',
  },
];
