import { query } from './db.js';
import bcrypt from 'bcryptjs';

const EXCLUDE_PATTERNS = [
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
  { pattern: 'NEFT RETURN', reason: 'NEFT return' },
  { pattern: 'IMPS RETURN', reason: 'IMPS return' },
  { pattern: 'LOAN', reason: 'Loan disbursement/repayment' },
  { pattern: 'INSURANCE', reason: 'Insurance premium' },
  { pattern: 'TAX', reason: 'Tax payment' },
  { pattern: 'GST', reason: 'GST payment' },
];

const COMPANY_SCOPED_EXCLUDES = [
  { id: 'CSE-001', pattern: 'SUNFLAG', company: 'Transin', reason: 'Sunflag Iron & Steel Co Ltd is not a Transin collection customer' },
  { id: 'CSE-002', pattern: 'VAISHNO WIRE', company: 'Transin', reason: 'Vaishno Wire PVT LTD is not a Transin collection customer' },
  { id: 'CSE-003', pattern: 'GRO DIGITAL', company: 'Transin', reason: 'GRO Digital Platforms Limited is not a Transin collection customer' },
];

const USERS = [
  { id: 'U001', name: 'Admin User', email: 'admin@delta.in', role: 'admin', kam_name: null, rh_name: null },
  { id: 'U002', name: 'Latha', email: 'latha@delta.in', role: 'kam', kam_name: 'Latha', rh_name: null },
  { id: 'U003', name: 'Karn (RH)', email: 'karn@delta.in', role: 'rh', kam_name: null, rh_name: 'Karn' },
  { id: 'U004', name: 'Vikash (RH)', email: 'vikash@delta.in', role: 'rh', kam_name: null, rh_name: 'Vikash' },
  { id: 'U005', name: 'Pratik', email: 'pratik@delta.in', role: 'kam', kam_name: 'Pratik', rh_name: null },
  { id: 'U006', name: 'Parul', email: 'parul@delta.in', role: 'kam', kam_name: 'Parul', rh_name: null },
  { id: 'U007', name: 'Ritika', email: 'ritika@delta.in', role: 'kam', kam_name: 'Ritika', rh_name: null },
  { id: 'U008', name: 'Nikita', email: 'nikita@delta.in', role: 'kam', kam_name: 'Nikita', rh_name: null },
  { id: 'U009', name: 'Kamal', email: 'kamal@delta.in', role: 'kam', kam_name: 'Kamal', rh_name: null },
  { id: 'U010', name: 'Deepak', email: 'deepak@delta.in', role: 'kam', kam_name: 'Deepak', rh_name: null },
  { id: 'U011', name: 'Kunal', email: 'kunal@delta.in', role: 'kam', kam_name: 'Kunal', rh_name: null },
  { id: 'U012', name: 'Parvinder', email: 'parvinder@delta.in', role: 'founder', kam_name: null, rh_name: null },
  { id: 'U013', name: 'Praveen', email: 'praveen@delta.in', role: 'founder', kam_name: null, rh_name: null },
];

const CUSTOMERS = [
  { id: 'C001', name: 'AKZO NOBEL INDIA LIMITED', kam: 'Latha', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C002', name: 'ASIAN PAINTS LIMITED', kam: 'Latha', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C003', name: 'STEEL INFRA SOLUTIONS PRIVATE LIMITED', kam: 'Parul', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C004', name: 'Hindustan Unilever Limited', kam: 'Pratik', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C005', name: 'Ultratech Cement Ltd', kam: 'Kunal', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C006', name: 'ITC-ABD-Transin', kam: 'Latha', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C007', name: 'SAINT - GOBAIN INDIA PRIVATE LIMITED', kam: 'Latha', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C008', name: 'SHRI BAJRANG POWER AND ISPAT LIMITED', kam: 'Parul', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C009', name: 'ITC Spices', kam: 'Latha', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C010', name: 'Shyam Metallics and Energy Ltd', kam: 'Parul', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C011', name: 'BERGER PAINTS LIMITED', kam: 'Latha', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C012', name: 'ORIGAMI CELLULO PRIVATE LIMITED', kam: 'Ritika', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C013', name: 'Bunge India Pvt Ltd', kam: 'Ritika', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C014', name: 'LARSEN & TOUBRO LIMITED', kam: 'Pratik', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C015', name: 'PASSIVE INFRA PROJECTS PRIVATE LIMITED', kam: 'Parul', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C016', name: 'N.RANGA RAO & SONS PRIVATE LIMITED', kam: 'Latha', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C017', name: 'HINDUSTAN COCA COLA BEVERAGES PRIVATE LIMITED', kam: 'Vikash', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C018', name: 'Epsilon Carbon Pvt Limited', kam: 'Ritika', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C019', name: 'FINOLEX CABLES LTD', kam: 'Nikita', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C020', name: 'SOMANY CERAMICS LIMITED', kam: 'Ritika', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C021', name: 'PIDILITE INDUSTRIES LIMITED', kam: 'Latha', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C022', name: 'VALVOLINE CUMMINS PRIVATE LIMITED', kam: 'Nikita', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C023', name: 'GRO DIGITAL PLATFORMS LIMITED', kam: 'Latha', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C024', name: 'BALAJI ACTION BUILDWELL PRIVATE LIMITED', kam: 'Nikita', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C025', name: 'H VIKAS PIPE AND STEEL PRIVATE LIMITED (To Pay- Steel Infra)', kam: 'Parul', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C026', name: 'RHI MAGNESITA INDIA REFRACTORIES LIMITED', kam: 'Parul', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C027', name: 'PARLE AGRO PVT LTD', kam: 'Latha', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C028', name: 'COLGATE PALMOLIVE INDIA LTD', kam: 'Ritika', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C029', name: 'British Paints', kam: 'Latha', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C030', name: 'UFLEX LIMITED', kam: 'Nikita', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C031', name: 'SOUTHERN CARGO LOGISTICS PRIVATE LIMITED', kam: 'Pratik', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C032', name: 'Miura Infrastructure Pvt. Ltd', kam: 'Parul', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C033', name: 'VESUVIUS INDIA LIMITED', kam: 'Latha', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C034', name: 'TRANSRAIL LIGHTING LTD_Transin', kam: 'Pratik', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C035', name: 'HINDUSTAN PENCILS PRIVATE LIMITED', kam: 'Pratik', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C036', name: 'AGROHAAT RETAIL PRIVATE LIMITED', kam: 'Latha', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C037', name: 'K.P. ASSOCIATES', kam: 'Nikita', rh: 'Vikash', to_pay_flag: true, active: true },
  { id: 'C038', name: 'IVL Dhunseri Petrochem Industries Private Limited', kam: 'Vikash', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C039', name: 'JINDAL STEEL & POWER LTD.', kam: 'Vikash', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C040', name: 'POLYCAB INDIA LIMITED', kam: 'Pratik', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C041', name: 'JINDAL STAINLESS LIMITED', kam: 'Vikash', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C042', name: 'TRANSRAIL LIGHTING LIMITED', kam: 'Nikita', rh: 'Vikash', to_pay_flag: true, active: true },
  { id: 'C043', name: 'Birla Opus', kam: 'Latha', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C044', name: 'CENTURY PLYBOARDS (INDIA) LIMITED', kam: 'Ritika', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C045', name: 'JYOTHY LABS LIMITED', kam: 'Latha', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C046', name: 'JSW PAINTS LIMITED', kam: 'Latha', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C047', name: 'PERFETTI VAN MELLE', kam: 'Nikita', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C048', name: 'Everest Buildpro Private Limited', kam: 'Pratik', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C049', name: 'MATOD INDUSTRIES PRIVATE LIMITED', kam: 'Nikita', rh: 'Vikash', to_pay_flag: true, active: true },
  { id: 'C050', name: 'JTL INDUSTRIES LIMITED', kam: 'Nikita', rh: 'Vikash', to_pay_flag: true, active: true },
  { id: 'C051', name: 'NIVEA INDIA PRIVATE LIMITED', kam: 'Latha', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C052', name: 'Qwik Supply Chain Private Limited', kam: 'Pratik', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C053', name: 'REGAAL RESOURCES LIMITED', kam: 'Kamal', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C054', name: 'Prince Pipes And Fittings Ltd', kam: 'Ritika', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C055', name: 'Godawari Power And Ispat Limited', kam: 'Parul', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C056', name: 'SRISHTI METALS PRIVATE LIMITED_Zast', kam: 'Parul', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C057', name: 'TATA STEEL LIMITED', kam: 'Pratik', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C058', name: 'GRAVITA INDIA LIMITED', kam: 'Pratik', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C059', name: 'SINGHANIA RESOURCES PRIVATE LIMITED', kam: 'Nikita', rh: 'Vikash', to_pay_flag: true, active: true },
  { id: 'C060', name: 'SKS ISPAT & POWER LIMITED', kam: 'Parul', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C061', name: 'DG CORPORATE INDIA MFG. PRIVATE LIMITED', kam: 'Nikita', rh: 'Vikash', to_pay_flag: true, active: true },
  { id: 'C062', name: 'SJV INFRA PROJECTS PRIVATE LIMITED', kam: 'Nikita', rh: 'Vikash', to_pay_flag: true, active: true },
  { id: 'C063', name: 'J P Traders', kam: 'Pratik', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C064', name: 'INDORAMA YARNS PRIVATE LIMITED', kam: 'Pratik', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C065', name: 'LIVGUARD ENERGY TECHNOLOGIES PRIVATE LIMITED', kam: 'Nikita', rh: 'Vikash', to_pay_flag: true, active: true },
  { id: 'C066', name: 'RUKMANI ELECTRICAL AND COMPONENTS PVT. LTD.', kam: 'Nikita', rh: 'Vikash', to_pay_flag: true, active: true },
  { id: 'C067', name: 'SYSTEMATIC INDUSTRIES PRIVATE LIMITED', kam: 'Nikita', rh: 'Vikash', to_pay_flag: true, active: true },
  { id: 'C068', name: 'NAVEEN JAIN METAL UDYOG', kam: 'Nikita', rh: 'Vikash', to_pay_flag: true, active: true },
  { id: 'C069', name: 'Century Panels Limited', kam: 'Ritika', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C070', name: 'CENTURY PLYBOARDS (INDIA) LIMITED ( AD-37)', kam: 'Ritika', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C071', name: 'GARG TUBE EXPORT LLP', kam: 'Nikita', rh: 'Vikash', to_pay_flag: true, active: true },
  { id: 'C072', name: 'Mittal Steels', kam: 'Nikita', rh: 'Vikash', to_pay_flag: true, active: true },
  { id: 'C073', name: 'Sunflag Iron & Steel Co Ltd', kam: 'Pratik', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C074', name: 'AMARJIT & SONS', kam: 'Nikita', rh: 'Vikash', to_pay_flag: true, active: true },
  { id: 'C075', name: 'MOHIT Enterprises', kam: 'Nikita', rh: 'Vikash', to_pay_flag: true, active: true },
  { id: 'C076', name: 'ASMI METAL PRODUCTS', kam: 'Nikita', rh: 'Vikash', to_pay_flag: true, active: true },
  { id: 'C077', name: 'Bright Metals India Pvt Ltd', kam: 'Nikita', rh: 'Vikash', to_pay_flag: true, active: true },
  { id: 'C078', name: 'Nav Bharat Metalic Oxide', kam: 'Nikita', rh: 'Vikash', to_pay_flag: true, active: true },
  { id: 'C079', name: 'PARAS METALS', kam: 'Nikita', rh: 'Vikash', to_pay_flag: true, active: true },
  { id: 'C080', name: 'SHREE METAL TRADERS (RJ-08)', kam: 'Nikita', rh: 'Vikash', to_pay_flag: true, active: true },
  { id: 'C081', name: 'DANIELI CORUS REFRACTORY SOLUTIONS PVT LTD', kam: 'Vikash', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C082', name: 'TOPWARTH STEEL AND POWER', kam: 'Parul', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C083', name: 'ORIENT ELECTRIC LIMITED', kam: 'Kamal', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C084', name: 'NESTLE INDIA LIMITED', kam: 'Kamal', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C085', name: 'THE BOMBAY SEEDS SUPPLY COMPANY', kam: 'Vikash', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C086', name: 'TVS Supply Chain Solutions Ltd.', kam: 'Kamal', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C087', name: 'DEL MONTE FOODS PRIVATE LIMITED', kam: 'Nikita', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C088', name: 'ITC LIMITED', kam: 'Deepak', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C089', name: 'ALKEM LABORATORIES LTD', kam: 'Vikash', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C090', name: 'BAJAJ ELECTRICALS LIMITED', kam: 'Nikita', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C091', name: 'BAREERA FOOD INDUSTRIES', kam: 'Vikash', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C092', name: 'BATA INDIA LIMITED', kam: 'Parul', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C093', name: 'BISLERI INTERNATIONAL PVT LTD', kam: 'Nikita', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C094', name: 'WALKAROO INTERNATIONAL PVT. LTD.', kam: 'Vikash', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C095', name: 'D F M FOODS LTD', kam: 'Vikash', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C096', name: 'DROOLS PET FOOD PRIVATE LIMITED', kam: 'Vikash', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C097', name: 'GLENMARK PHARMACEUTICALS LTD', kam: 'Nikita', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C098', name: 'IB MONOTARO PRIVATE LIMITED', kam: 'Vikash', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C099', name: 'MARICO LIMITED', kam: 'Vikash', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C100', name: 'NCUBATE INDIA SERVICES PRIVATE LIMITED', kam: 'Kamal', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C101', name: 'STREAMBOX MEDIA PRIVATE LIMITED', kam: 'Vikash', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C102', name: 'VIJAI ELECTRICALS LIMITED', kam: 'Vikash', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C103', name: 'VOLTAS LIMITED', kam: 'Parul', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C104', name: 'WINGREENS FARMS PVT LTD', kam: 'Vikash', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C105', name: 'G.D.FOODS MANUFACTURING (INDIA) PRIVATE LIMITED', kam: 'Parul', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C106', name: 'ITC LIMITED-ABD', kam: 'Latha', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C107', name: 'MRF LIMITED (DAHEJ)', kam: 'Nikita', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C108', name: 'Keventer Agro Limited', kam: 'Nikita', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C109', name: 'Apar industries limited', kam: 'Parul', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C110', name: 'Havells India Ltd', kam: 'Deepak', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C111', name: 'Octolife Climate Solutions Private Limited', kam: 'Parul', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C112', name: 'Exide Industries Limited', kam: 'Kunal', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C113', name: 'Blue Star Limited', kam: 'Deepak', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C114', name: 'KINGSPAN JINDAL PRIVATE LIMITED', kam: 'Pratik', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C115', name: 'Yuantai International Supply Chain Management Private Limited', kam: 'Kamal', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C116', name: 'VoltBek Home Appliances Pvt. Ltd.', kam: 'Parul', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C117', name: 'Bridge Track and Tower Pvt Ltd', kam: 'Parul', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C118', name: 'SAMBHV STEEL TUBES LIMITED', kam: 'Parul', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C119', name: 'SWASTIK PIPE LIMITED', kam: 'Nikita', rh: 'Vikash', to_pay_flag: true, active: true },
  { id: 'C120', name: 'REELOTEK METALS', kam: 'Nikita', rh: 'Vikash', to_pay_flag: true, active: true },
  { id: 'C121', name: 'LS CABLE INDIA PVT. LTD.', kam: 'Nikita', rh: 'Vikash', to_pay_flag: true, active: true },
  { id: 'C122', name: 'REELOTEK ESTATES', kam: 'Nikita', rh: 'Vikash', to_pay_flag: true, active: true },
  { id: 'C123', name: 'Ayansh Global Private Limited', kam: 'Nikita', rh: 'Vikash', to_pay_flag: true, active: true },
  { id: 'C124', name: 'Hector Beverages Pvt Ltd', kam: 'Latha', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C125', name: 'Shivam Hi tech Steels Pvt Ltd', kam: 'Parul', rh: 'Vikash', to_pay_flag: false, active: true },
  { id: 'C126', name: 'Vaishno Wire PVT LTD', kam: 'Nikita', rh: 'Vikash', to_pay_flag: true, active: true },
  { id: 'C127', name: 'HECTOR BEVERAGES (P) LTD', kam: 'Latha', rh: 'Karn', to_pay_flag: false, active: true },
  { id: 'C128', name: 'Modenik Lifestyle Private Limited', kam: 'Nikita', rh: 'Vikash', to_pay_flag: false, active: true },
];

const RULES = [
  { id: 'R-001', customer: 'HINDUSTAN UNILEVER LIMITED', keywords: ['HINDUSTAN UNILEVER', 'HINDUNILVR'], compound_rules: [{ allOf: ['CITIN266', 'HINDUSTAN UNILEVER'] }], exclude_keywords: [], note: 'CITIN266 alone is NOT enough — must also contain company name', source: 'system', created_at: '2026-07-01' },
  { id: 'R-002', customer: 'ASIAN PAINTS LIMITED', keywords: ['ASIAN PAINTS', 'ASIANPAINT'], compound_rules: [{ allOf: ['HDFCH010', 'ASIAN PAINTS'] }], exclude_keywords: [], note: 'HDFCH010 is an HDFC branch code shared by multiple companies — must appear alongside ASIAN PAINTS', source: 'system', created_at: '2026-07-01' },
  { id: 'R-003', customer: 'ITC LIMITED', keywords: ['ITC LIMITED', 'ITC LTD', 'ITC-ABD'], compound_rules: [], exclude_keywords: [], note: 'Never use ITC alone — too short', source: 'system', created_at: '2026-07-01' },
  { id: 'R-004', customer: 'PERFETTI VAN MELLE INDIA PRIVATE LIMITED', keywords: ['PERFETTI', 'PVMIL', 'PERFETTI VAN MELLE', 'PMVBRY'], compound_rules: [], exclude_keywords: [], note: "PMVBRY is Perfetti's ACH clearing code — unique to them in this bank", source: 'system', created_at: '2026-07-01' },
  { id: 'R-005', customer: 'VOLTAS LIMITED', keywords: ['VOLTAS'], compound_rules: [{ allOf: ['CITIN266', 'VOLTAS'] }], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-006', customer: 'PIDILITE INDUSTRIES LIMITED', keywords: ['PIDILITE'], compound_rules: [{ allOf: ['CITIN266', 'PIDILITE'] }], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-007', customer: 'SAINT-GOBAIN INDIA PRIVATE LIMITED', keywords: ['SGIPL', 'GYPROC', 'SAINT GOBAIN', 'SGIPLN'], compound_rules: [{ allOf: ['CITIN266', 'SGIPL'] }], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-008', customer: 'JINDAL STEEL & POWER LTD.', keywords: ['JINDAL STEEL', 'JINDAL STEEL AND POWER', 'JINDAL STEEL & POWER'], compound_rules: [{ allOf: ['JSWP', 'JINDAL'] }], exclude_keywords: [], note: 'JSWP is a short code — must appear alongside JINDAL', source: 'system', created_at: '2026-07-01' },
  { id: 'R-009', customer: 'Nestle India Ltd', keywords: ['NESTLE', 'NESTL', 'DEUT0796DEL'], compound_rules: [], exclude_keywords: ['DULUX', 'AKZO', 'JSW DULUX'], note: 'DEUT0796DEL is Deutsche Bank branch code — exclude DULUX/AKZO to avoid matching AkzoNobel (JSW Dulux) transactions', source: 'system', created_at: '2026-07-01' },
  { id: 'R-010', customer: 'VALVOLINE CUMMINS PRIVATE LIMITED', keywords: ['VALVOLINE', 'VALVOLINE CUMMINS'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-011', customer: 'Apar Industries Limited', keywords: ['APAR INDUSTRIES', 'APAR IND', 'VALOR INNOVATIONS'], compound_rules: [], exclude_keywords: [], note: 'Apar pays via Valor Innovations Private Limited as intermediary — narration never says APAR', source: 'system', created_at: '2026-07-01' },
  { id: 'R-012', customer: 'Epsilon Carbon Pvt Limited', keywords: ['EPSILON', 'EPSILON CARBON'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-013', customer: 'Colgate-Palmolive (India) Limited', keywords: ['COLGATE', 'COLGATE-PALMOLIVE', 'COLGATE PALMOLIVE'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-014', customer: 'Qwik Supply Chain Pvt Ltd', keywords: ['QWIK', 'QWIK SUPPLY', 'HDF0231522'], compound_rules: [], exclude_keywords: [], note: "HDF0231522 is Qwik's HDFC payer code — unique to them; ACH/HDFC payments omit the company name", source: 'system', created_at: '2026-07-01' },
  { id: 'R-015', customer: 'BUNGE INDIA PRIVATE LIMITED', keywords: ['BUNGE INDIA', 'BUNGE'], compound_rules: [{ allOf: ['DEUTH00', 'BUNGE'] }], exclude_keywords: [], note: 'DEUTH00 is a Deutsche Bank clearing code — must appear alongside BUNGE', source: 'system', created_at: '2026-07-01' },
  { id: 'R-016', customer: 'Balaji Action Buildwell Pvt LTD', keywords: ['BALAJI ACTION', 'BALAJIACTION', 'BALAJI ACTION BUILDWELL'], compound_rules: [{ allOf: ['SELCR', 'ACH/CR'] }], exclude_keywords: [], note: 'SELCR+ACH/CR = Balaji ACH/NACH format; BALAJIACTION (no space) = RTGS truncated format', source: 'system', created_at: '2026-07-01' },
  { id: 'R-017', customer: 'TATA STEEL LIMITED', keywords: ['TATA STEEL', 'FINANCIAL SUPPLY CHAIN MANAGEMENT'], compound_rules: [], exclude_keywords: [], note: 'Tata Steel SCF payments routed via Financial Supply Chain Management (ICIC0099999) — narration never says TATA STEEL', source: 'system', created_at: '2026-07-01' },
  { id: 'R-018', customer: 'AKZO NOBEL INDIA LIMITED', keywords: ['AKZO NOBEL', 'AKZONOBEL', 'JSW DULUX LIMITED'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-019', customer: 'Parle Agro Pvt Ltd', keywords: ['PARLE AGRO'], compound_rules: [{ allOf: ['0811OP', 'PARLE'] }], exclude_keywords: [], note: '0811OP is an ACH/NACH code — must appear alongside PARLE', source: 'system', created_at: '2026-07-01' },
  { id: 'R-020', customer: 'STEEL INFRA SOLUTIONS PRIVATE LIMITED', keywords: ['STEEL INFRA', 'STEEL INFRA SOLUTIONS'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-021', customer: 'Prince Pipes And Fittings Ltd', keywords: ['PRINCE PIPES', 'PRINCE PIPE'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-022', customer: 'TVS Supply Chain Solutions Ltd.', keywords: ['TVS SUPPLY', 'TVS SUPPLY CHAIN'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-023', customer: 'GRAVITA INDIA LIMITED', keywords: ['GRAVITA INDIA', 'GRAVITA'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-024', customer: 'Exide Industries Limited', keywords: ['EXIDE INDUSTRIES', 'EXIDE IND'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-025', customer: 'JSW PAINTS LIMITED', keywords: ['JSW PAINTS'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-026', customer: 'BERGER PAINTS LIMITED', keywords: ['BERGER PAINTS', 'BERGER'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-027', customer: 'ORIENT ELECTRIC LIMITED', keywords: ['ORIENT ELECTRIC'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-028', customer: 'LIVGUARD ENERGY TECHNOLOGIES PRIVATE LIMITED', keywords: ['LIVGUARD'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-029', customer: 'JTL INDUSTRIES LIMITED', keywords: ['JTL INDUSTRIES', 'JTL IND'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-030', customer: 'GARG TUBE EXPORT LLP', keywords: ['GARG TUBE'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-031', customer: 'SYSTEMATIC INDUSTRIES PRIVATE LIMITED', keywords: ['SYSTEMATIC INDUSTRIES', 'SYSTEMATIC IND'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-032', customer: 'IVL Dhunseri Petrochem Industries Private Limited', keywords: ['IVL DHUNSERI', 'DHUNSERI'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-033', customer: 'SINGHANIA RESOURCES PRIVATE LIMITED', keywords: ['SINGHANIA RESOURCES', 'SINGHANIA'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-034', customer: 'INDORAMA YARNS PRIVATE LIMITED', keywords: ['INDORAMA YARNS', 'INDORAMA'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-035', customer: 'SOUTHERN CARGO LOGISTICS PRIVATE LIMITED', keywords: ['SOUTHERN CARGO'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-036', customer: 'NCUBATE INDIA SERVICES PRIVATE LIMITED', keywords: ['NCUBATE'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-037', customer: 'Ayansh Global Private Limited', keywords: ['AYANSH GLOBAL', 'AYANSH'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-038', customer: 'NAVEEN JAIN METAL UDYOG', keywords: ['NAVEEN JAIN METAL', 'NAVEEN JAIN'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-039', customer: 'RUKMANI ELECTRICAL AND COMPONENTS PVT. LTD.', keywords: ['RUKMANI ELECTRICAL', 'RUKMANI'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-040', customer: 'J P Traders', keywords: ['J P TRADERS', 'JP TRADERS'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-041', customer: 'THE BOMBAY SEEDS SUPPLY COMPANY', keywords: ['BOMBAY SEEDS', 'THE BOMBAY SEEDS'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-042', customer: 'MOHIT Enterprises', keywords: ['MOHIT ENTERPRISES'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-043', customer: 'Bright Metals India Pvt Ltd', keywords: ['BRIGHT METALS'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-044', customer: 'Mittal Steels', keywords: ['MITTAL STEELS'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-045', customer: 'SHREE METAL TRADERS', keywords: ['SHREE METAL TRADERS', 'SHREE METAL'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-01' },
  { id: 'R-046', customer: 'Birla Opus', keywords: ['BIRLA OPUS', 'GRASIM IND', 'GRASIM'], compound_rules: [], exclude_keywords: [], note: 'Grasim Ind Ltd-Paints Div is the legal sender name; rebranded to Birla Opus', source: 'system', created_at: '2026-07-21' },
  { id: 'R-047', customer: 'Keventer Agro Limited', keywords: ['KEVENTER AGRO', 'KEVENTER'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-21' },
  { id: 'R-048', customer: 'AMARJIT & SONS', keywords: ['AMARJIT AND SONS', 'AMARJIT & SONS', 'AMARJIT'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-21' },
  { id: 'R-049', customer: 'SRISHTI METALS PRIVATE LIMITED_Zast', keywords: ['SRISHTI METALS', 'SRISHTI'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-21' },
  { id: 'R-050', customer: 'TRANSRAIL LIGHTING LIMITED', keywords: ['TRANSRAIL LIGHTING', 'TRANSRAIL'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-21' },
  { id: 'R-051', customer: 'Godawari Power And Ispat Limited', keywords: ['GODAWARI POWER', 'GODAWARI', 'R.R. ISPAT'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-21' },
  { id: 'R-052', customer: 'MRF LIMITED (DAHEJ)', keywords: ['MRF LIMITED'], compound_rules: [], exclude_keywords: [], note: 'Use MRF LIMITED not MRF alone — too short', source: 'system', created_at: '2026-07-21' },
  { id: 'R-053', customer: 'DANIELI CORUS REFRACTORY SOLUTIONS PVT LTD', keywords: ['DANIELI CORUS', 'DANIELI'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-21' },
  { id: 'R-054', customer: 'REGAAL RESOURCES LIMITED', keywords: ['REGAAL RESOURCES', 'REGAAL'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-21' },
  { id: 'R-055', customer: 'ASMI METAL PRODUCTS', keywords: ['ASMI METAL PRODUCTS', 'ASMI METAL'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-21' },
  { id: 'R-056', customer: 'BAJAJ ELECTRICALS LIMITED', keywords: ['BAJAJ ELECTRICALS'], compound_rules: [], exclude_keywords: [], note: 'BAJAJ alone is too generic — must use full BAJAJ ELECTRICALS', source: 'system', created_at: '2026-07-21' },
  { id: 'R-057', customer: 'PARAS METALS', keywords: ['PARAS METALS'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-21' },
  { id: 'R-058', customer: 'Bridge Track and Tower Pvt Ltd', keywords: ['BRIDGE TRACK AND TOWER', 'BRIDGE TRACK'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-21' },
  { id: 'R-059', customer: 'Yuantai International Supply Chain Management Private Limited', keywords: ['YUANTAI'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-21' },
  { id: 'R-060', customer: 'CENTURY PLYBOARDS (INDIA) LIMITED', keywords: ['CENTURY PLYBOARDS', 'CENTURY PLY'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-21' },
  { id: 'R-061', customer: 'BATA INDIA LIMITED', keywords: ['BATA INDIA', 'BATA'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-21' },
  { id: 'R-062', customer: 'DG CORPORATE INDIA MFG. PRIVATE LIMITED', keywords: ['DG CORPORATE INDIA', 'DG CORPORATE'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-21' },
  { id: 'R-066', customer: 'Octolife Climate Solutions Private Limited', keywords: ['OCTOLIFE'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-21' },
  { id: 'R-067', customer: 'REELOTEK METALS', keywords: ['REELOTEK METALS'], compound_rules: [], exclude_keywords: [], note: 'Use full name — REELOTEK alone would also match REELOTEK ESTATES (R-068)', source: 'system', created_at: '2026-07-21' },
  { id: 'R-068', customer: 'REELOTEK ESTATES', keywords: ['REELOTEK ESTATES'], compound_rules: [], exclude_keywords: [], note: 'Use full name — REELOTEK alone would also match REELOTEK METALS (R-067)', source: 'system', created_at: '2026-07-21' },
  { id: 'R-069', customer: 'Vaishno Wire PVT LTD', keywords: ['VAISHNO WIRE'], compound_rules: [], exclude_keywords: [], note: 'VAISHNO alone removed — matched SHRI MATA VAISHNO DEVI TRANSPORT (debit IMPS outflow)', source: 'system', created_at: '2026-07-21' },
  { id: 'R-070', customer: 'Ultratech Cement Ltd', keywords: ['ULTRATECH CEMENT', 'ULTRATECH'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-071', customer: 'ITC-ABD-Transin', keywords: [], compound_rules: [{ allOf: ['ITC', 'TRANSIN'] }], exclude_keywords: [], note: 'Compound rule: ITC + TRANSIN to distinguish from ITC LIMITED (R-003)', source: 'system', created_at: '2026-07-22' },
  { id: 'R-072', customer: 'SAINT - GOBAIN INDIA PRIVATE LIMITED', keywords: ['SGIPL', 'GYPROC', 'SAINT GOBAIN', 'SGIPLN'], compound_rules: [], exclude_keywords: [], note: 'Alternate name for SAINT-GOBAIN INDIA PRIVATE LIMITED (R-007)', source: 'system', created_at: '2026-07-22' },
  { id: 'R-073', customer: 'SHRI BAJRANG POWER AND ISPAT LIMITED', keywords: ['SHRI BAJRANG', 'BAJRANG POWER', 'BAJRANG ISPAT'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-074', customer: 'ITC Spices', keywords: [], compound_rules: [{ allOf: ['ITC', 'SPICES'] }], exclude_keywords: [], note: 'Compound rule: ITC + SPICES to distinguish from ITC LIMITED (R-003)', source: 'system', created_at: '2026-07-22' },
  { id: 'R-075', customer: 'Shyam Metallics and Energy Ltd', keywords: ['SHYAM METALLICS', 'SHYAM METAL'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-076', customer: 'ORIGAMI CELLULO PRIVATE LIMITED', keywords: ['ORIGAMI CELLULO', 'ORIGAMI'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-077', customer: 'Bunge India Pvt Ltd', keywords: ['BUNGE INDIA', 'BUNGE'], compound_rules: [], exclude_keywords: [], note: 'Alternate name for BUNGE INDIA PRIVATE LIMITED (R-015)', source: 'system', created_at: '2026-07-22' },
  { id: 'R-078', customer: 'LARSEN & TOUBRO LIMITED', keywords: ['LARSEN TOUBRO', 'LARSEN & TOUBRO', 'L&T LIMITED', 'L & T LIMITED'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-079', customer: 'PASSIVE INFRA PROJECTS PRIVATE LIMITED', keywords: ['PASSIVE INFRA PROJECTS', 'PASSIVE INFRA'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-080', customer: 'N.RANGA RAO & SONS PRIVATE LIMITED', keywords: ['RANGA RAO', 'N RANGA RAO', 'N.RANGA RAO'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-081', customer: 'HINDUSTAN COCA COLA BEVERAGES PRIVATE LIMITED', keywords: ['HINDUSTAN COCA COLA', 'COCA COLA', 'HCCB'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-082', customer: 'FINOLEX CABLES LTD', keywords: ['FINOLEX CABLES', 'FINOLEX'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-083', customer: 'SOMANY CERAMICS LIMITED', keywords: ['SOMANY CERAMICS', 'SOMANY'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-084', customer: 'GRO DIGITAL PLATFORMS LIMITED', keywords: ['GRO DIGITAL PLATFORMS', 'GRO DIGITAL'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-085', customer: 'BALAJI ACTION BUILDWELL PRIVATE LIMITED', keywords: ['BALAJI ACTION', 'BALAJI ACTION BUILDWELL'], compound_rules: [], exclude_keywords: [], note: 'Alternate name for Balaji Action Buildwell Pvt LTD (R-016)', source: 'system', created_at: '2026-07-22' },
  { id: 'R-086', customer: 'H VIKAS PIPE AND STEEL PRIVATE LIMITED (To Pay- Steel Infra)', keywords: ['H VIKAS PIPE', 'VIKAS PIPE AND STEEL'], compound_rules: [], exclude_keywords: [], note: 'Use full phrase — VIKAS alone is too generic', source: 'system', created_at: '2026-07-22' },
  { id: 'R-087', customer: 'RHI MAGNESITA INDIA REFRACTORIES LIMITED', keywords: ['RHI MAGNESITA', 'MAGNESITA'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-088', customer: 'COLGATE PALMOLIVE INDIA LTD', keywords: ['COLGATE', 'COLGATE PALMOLIVE'], compound_rules: [], exclude_keywords: [], note: 'Alternate name for Colgate-Palmolive (India) Limited (R-013)', source: 'system', created_at: '2026-07-22' },
  { id: 'R-089', customer: 'British Paints', keywords: ['BRITISH PAINTS'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-090', customer: 'UFLEX LIMITED', keywords: ['UFLEX'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-091', customer: 'Miura Infrastructure Pvt. Ltd', keywords: ['MIURA INFRA', 'MIURA INFRASTRUCTURE', 'MIURA'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-092', customer: 'VESUVIUS INDIA LIMITED', keywords: ['VESUVIUS'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-093', customer: 'TRANSRAIL LIGHTING LTD_Transin', keywords: ['TRANSRAIL LIGHTING', 'TRANSRAIL'], compound_rules: [], exclude_keywords: [], note: 'Alternate name for TRANSRAIL LIGHTING LIMITED (R-050)', source: 'system', created_at: '2026-07-22' },
  { id: 'R-094', customer: 'HINDUSTAN PENCILS PRIVATE LIMITED', keywords: ['HINDUSTAN PENCILS', 'DOMS PENCILS'], compound_rules: [], exclude_keywords: [], note: 'NACH-TRE format is shared with Epsilon Carbon — cannot auto-match, goes to Manual Review', source: 'system', created_at: '2026-07-22' },
  { id: 'R-095', customer: 'AGROHAAT RETAIL PRIVATE LIMITED', keywords: ['AGROHAAT'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-096', customer: 'K.P. ASSOCIATES', keywords: ['K P ASSOCIATES', 'KP ASSOCIATES', 'K.P. ASSOCIATES'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-097', customer: 'POLYCAB INDIA LIMITED', keywords: ['POLYCAB'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-098', customer: 'JINDAL STAINLESS LIMITED', keywords: ['JINDAL STAINLESS'], compound_rules: [], exclude_keywords: [], note: 'Must use JINDAL STAINLESS — JINDAL alone conflicts with R-008 (JINDAL STEEL & POWER)', source: 'system', created_at: '2026-07-22' },
  { id: 'R-099', customer: 'JYOTHY LABS LIMITED', keywords: ['JYOTHY LABS', 'JYOTHY'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-100', customer: 'PERFETTI VAN MELLE', keywords: ['PERFETTI', 'PERFETTI VAN MELLE'], compound_rules: [], exclude_keywords: [], note: 'Alternate name for PERFETTI VAN MELLE INDIA PRIVATE LIMITED (R-004)', source: 'system', created_at: '2026-07-22' },
  { id: 'R-101', customer: 'Everest Buildpro Private Limited', keywords: ['EVEREST BUILDPRO'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-102', customer: 'MATOD INDUSTRIES PRIVATE LIMITED', keywords: ['MATOD INDUSTRIES', 'MATOD'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-103', customer: 'NIVEA INDIA PRIVATE LIMITED', keywords: ['NIVEA'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-104', customer: 'Qwik Supply Chain Private Limited', keywords: ['QWIK', 'QWIK SUPPLY', 'HDF0231522'], compound_rules: [], exclude_keywords: [], note: 'Alternate name for Qwik Supply Chain Pvt Ltd (R-014)', source: 'system', created_at: '2026-07-22' },
  { id: 'R-105', customer: 'SKS ISPAT & POWER LIMITED', keywords: ['SKS ISPAT', 'SKS POWER'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-106', customer: 'SJV INFRA PROJECTS PRIVATE LIMITED', keywords: ['SJV INFRA PROJECTS', 'SJV INFRA'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-107', customer: 'Century Panels Limited', keywords: ['CENTURY PANELS'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-108', customer: 'CENTURY PLYBOARDS (INDIA) LIMITED ( AD-37)', keywords: ['CENTURY PLYBOARDS', 'CENTURY PLY'], compound_rules: [], exclude_keywords: [], note: 'Alternate name for CENTURY PLYBOARDS (INDIA) LIMITED (R-060)', source: 'system', created_at: '2026-07-22' },
  { id: 'R-109', customer: 'Sunflag Iron & Steel Co Ltd', keywords: ['SUNFLAG'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-110', customer: 'Nav Bharat Metalic Oxide', keywords: ['NAV BHARAT METALIC', 'NAV BHARAT', 'NAVBHARAT'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-111', customer: 'SHREE METAL TRADERS (RJ-08)', keywords: ['SHREE METAL TRADERS', 'SHREE METAL'], compound_rules: [], exclude_keywords: [], note: 'Alternate name for SHREE METAL TRADERS (R-045)', source: 'system', created_at: '2026-07-22' },
  { id: 'R-112', customer: 'TOPWARTH STEEL AND POWER', keywords: ['TOPWARTH'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-113', customer: 'NESTLE INDIA LIMITED', keywords: ['NESTLE', 'NESTL'], compound_rules: [], exclude_keywords: [], note: 'Alternate name for Nestle India Ltd (R-009)', source: 'system', created_at: '2026-07-22' },
  { id: 'R-114', customer: 'DEL MONTE FOODS PRIVATE LIMITED', keywords: ['DEL MONTE'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-115', customer: 'ALKEM LABORATORIES LTD', keywords: ['ALKEM LABORATORIES', 'ALKEM'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-116', customer: 'BAREERA FOOD INDUSTRIES', keywords: ['BAREERA'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-117', customer: 'BISLERI INTERNATIONAL PVT LTD', keywords: ['BISLERI'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-118', customer: 'WALKAROO INTERNATIONAL PVT. LTD.', keywords: ['WALKAROO'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-119', customer: 'D F M FOODS LTD', keywords: ['DFM FOODS', 'D F M FOODS', 'DFMFOODS'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-120', customer: 'DROOLS PET FOOD PRIVATE LIMITED', keywords: ['DROOLS'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-121', customer: 'GLENMARK PHARMACEUTICALS LTD', keywords: ['GLENMARK'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-122', customer: 'IB MONOTARO PRIVATE LIMITED', keywords: ['IB MONOTARO', 'MONOTARO'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-123', customer: 'MARICO LIMITED', keywords: ['MARICO'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-124', customer: 'STREAMBOX MEDIA PRIVATE LIMITED', keywords: ['STREAMBOX'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-125', customer: 'VIJAI ELECTRICALS LIMITED', keywords: ['VIJAI ELECTRICALS', 'VIJAI ELECTRIC'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-126', customer: 'WINGREENS FARMS PVT LTD', keywords: ['WINGREENS'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-127', customer: 'G.D.FOODS MANUFACTURING (INDIA) PRIVATE LIMITED', keywords: ['GD FOODS', 'G D FOODS', 'GDFOODS', 'G.D.FOODS'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-128', customer: 'ITC LIMITED-ABD', keywords: ['ITC LIMITED-ABD'], compound_rules: [{ allOf: ['ITC', 'ABD'] }], exclude_keywords: [], note: 'Compound ITC + ABD also catches RTGS format', source: 'system', created_at: '2026-07-22' },
  { id: 'R-129', customer: 'Havells India Ltd', keywords: ['HAVELLS'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-130', customer: 'Blue Star Limited', keywords: ['BLUE STAR LIMITED', 'BLUESTAR'], compound_rules: [], exclude_keywords: [], note: 'Use BLUE STAR LIMITED — BLUE STAR alone may match unrelated narrations', source: 'system', created_at: '2026-07-22' },
  { id: 'R-131', customer: 'KINGSPAN JINDAL PRIVATE LIMITED', keywords: ['KINGSPAN JINDAL', 'KINGSPAN'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-132', customer: 'VoltBek Home Appliances Pvt. Ltd.', keywords: ['VOLTBEK'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-133', customer: 'SAMBHV STEEL TUBES LIMITED', keywords: ['SAMBHV STEEL', 'SAMBHV'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-134', customer: 'SWASTIK PIPE LIMITED', keywords: ['SWASTIK PIPE', 'SWASTIK'], compound_rules: [], exclude_keywords: [], note: 'Prefer SWASTIK PIPE — SWASTIK alone may be generic in some regions', source: 'system', created_at: '2026-07-22' },
  { id: 'R-135', customer: 'LS CABLE INDIA PVT. LTD.', keywords: ['LS CABLE'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-136', customer: 'Hector Beverages Pvt Ltd', keywords: ['HECTOR BEVERAGES', 'HECTOR BEV'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-137', customer: 'Shivam Hi tech Steels Pvt Ltd', keywords: ['SHIVAM HI TECH', 'SHIVAM HITECH', 'SHIVAM HI-TECH'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
  { id: 'R-138', customer: 'HECTOR BEVERAGES (P) LTD', keywords: ['HECTOR BEVERAGES', 'HECTOR BEV'], compound_rules: [], exclude_keywords: [], note: 'Alternate name for Hector Beverages Pvt Ltd (R-136)', source: 'system', created_at: '2026-07-22' },
  { id: 'R-139', customer: 'Modenik Lifestyle Private Limited', keywords: ['MODENIK'], compound_rules: [], exclude_keywords: [], note: null, source: 'system', created_at: '2026-07-22' },
];

export async function ensureFounders() {
  const placeholder = await bcrypt.hash('unused', 10);
  await query(`
    INSERT INTO users (id, name, email, role, active, password_hash)
    VALUES ('U012', 'Parvinder', 'parvinder@delta.in', 'founder', true, $1)
    ON CONFLICT (id) DO NOTHING
  `, [placeholder]);
  await query(`
    INSERT INTO users (id, name, email, role, active, password_hash)
    VALUES ('U013', 'Praveen', 'praveen@delta.in', 'founder', true, $1)
    ON CONFLICT (id) DO NOTHING
  `, [placeholder]);
  console.log('Founder accounts ensured.');
}

export async function ensureAdmin() {
  const defaultHash = await bcrypt.hash('Delta@123', 10);
  await query(`
    INSERT INTO users (id, name, email, role, active, password_hash)
    VALUES ('U001', 'Admin User', 'admin@delta.in', 'admin', true, $1)
    ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash, active = true
  `, [defaultHash]);
  console.log('Admin account ensured.');
}

export async function seedDatabase() {
  const meta = await query(`SELECT value FROM seed_meta WHERE key = 'seeded_v2'`);
  if (meta.rows.length > 0) {
    console.log('Database already seeded — skipping.');
    return;
  }

  console.log('Seeding database...');

  // Exclude patterns
  for (const ep of EXCLUDE_PATTERNS) {
    await query(`INSERT INTO exclude_patterns (pattern, reason) VALUES ($1, $2) ON CONFLICT (pattern) DO NOTHING`, [ep.pattern, ep.reason]);
  }

  // Company-scoped excludes
  for (const cse of COMPANY_SCOPED_EXCLUDES) {
    await query(`INSERT INTO company_scoped_excludes (id, pattern, company, reason) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`, [cse.id, cse.pattern, cse.company, cse.reason]);
  }

  // Users
  const defaultHash = await bcrypt.hash('Delta@123', 10);
  for (const u of USERS) {
    await query(`INSERT INTO users (id, name, email, role, kam_name, rh_name, password_hash) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`, [u.id, u.name, u.email, u.role, u.kam_name, u.rh_name, defaultHash]);
  }
  await query(`UPDATE users SET password_hash = $1 WHERE password_hash = ''`, [defaultHash]);

  // Customers
  for (const c of CUSTOMERS) {
    await query(`INSERT INTO customers (id, name, kam, rh, to_pay_flag, active) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`, [c.id, c.name, c.kam, c.rh, c.to_pay_flag, c.active]);
  }

  // Rules
  for (const r of RULES) {
    await query(
      `INSERT INTO rules (id, customer, keywords, compound_rules, exclude_keywords, note, source, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.customer, JSON.stringify(r.keywords), JSON.stringify(r.compound_rules), JSON.stringify(r.exclude_keywords), r.note, r.source, r.created_at]
    );
  }

  await query(`INSERT INTO seed_meta (key, value) VALUES ('seeded_v2', 'true') ON CONFLICT (key) DO NOTHING`);
  console.log('Database seeded successfully.');
}
