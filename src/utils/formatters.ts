// Always show exact rupees and paise in Indian number format — no Cr/L shorthand
export function formatCr(amount: number): string {
  return '₹' + roundToP(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatAmount(amount: number): string {
  return '₹' + roundToP(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Round to 2 decimal places (paise) using banker-safe arithmetic
function roundToP(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function sumExact(amounts: number[]): number {
  return roundToP(amounts.reduce((s, a) => s + a, 0));
}

// Parse a YYYY-MM-DD string as LOCAL midnight — avoids UTC timezone shift in IST
function localDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(dateStr: string): string {
  return localDate(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function daysPending(dateStr: string): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today.getTime() - localDate(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

export function monthLabel(dateStr: string): string {
  return localDate(dateStr).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // "2026-06"
}

// Dashboard-only: round to nearest whole rupee, no paise
export function formatCrRounded(amount: number): string {
  const n = Math.round(amount);
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
