/**
 * Accounting ledger — simple income / expense transactions with tax and
 * payment method. Designed for Canadian real estate agents who need to
 * track commissions, marketing spend, mileage, dues, etc. and export
 * a year-end CSV for their accountant.
 */
import { AUTH_BACKEND_URL, USE_AUTH_BACKEND } from '../config';
import type { Transaction, TxType, TxTaxMode, TxPayment } from '../types';
import { computeTaxBreakdown } from '../types';

export const TX_INCOME_CATEGORIES = [
  { id: 'commission',  labelKey: 'txCatCommission' },
  { id: 'referral',    labelKey: 'txCatReferral' },
  { id: 'bonus',       labelKey: 'txCatBonus' },
  { id: 'otherIncome', labelKey: 'txCatOtherIncome' },
];

export const TX_EXPENSE_CATEGORIES = [
  { id: 'advertising',  labelKey: 'txCatAdvertising' },
  { id: 'staging',      labelKey: 'txCatStaging' },
  { id: 'vehicle',      labelKey: 'txCatVehicle' },
  { id: 'meals',        labelKey: 'txCatMeals' },
  { id: 'dues',         labelKey: 'txCatDues' },
  { id: 'brokerage',    labelKey: 'txCatBrokerageSplit' },
  { id: 'licensing',    labelKey: 'txCatLicensing' },
  { id: 'insurance',    labelKey: 'txCatInsurance' },
  { id: 'software',     labelKey: 'txCatSoftware' },
  { id: 'office',       labelKey: 'txCatOffice' },
  { id: 'otherExpense', labelKey: 'txCatOtherExpense' },
];

export const TX_PAYMENT_METHODS: { id: TxPayment; labelKey: string }[] = [
  { id: 'cash',   labelKey: 'txPayCash' },
  { id: 'credit', labelKey: 'txPayCredit' },
  { id: 'bank',   labelKey: 'txPayBank' },
  { id: 'cheque', labelKey: 'txPayCheque' },
  { id: 'other',  labelKey: 'txPayOther' },
];

export const TX_TAX_MODES: { id: TxTaxMode; labelKey: string }[] = [
  { id: 'exclusive', labelKey: 'txTaxExclusive' },
  { id: 'inclusive', labelKey: 'txTaxInclusive' },
  { id: 'exempt',    labelKey: 'txTaxExempt' },
];

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!USE_AUTH_BACKEND) throw new Error('Accounting requires the Worker backend');
  const res = await fetch(`${AUTH_BACKEND_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error || ''; } catch {/*ignore*/}
    throw new Error(`${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`);
  }
  return res.json() as Promise<T>;
}

export async function listTransactions(): Promise<Transaction[]> {
  const res = await request<{ transactions: Transaction[] }>('/transactions');
  return res.transactions || [];
}

export type TxCreateInput = Partial<Omit<Transaction, 'id' | 'created_at' | 'updated_at' | 'owner'>>;

export async function createTransaction(input: TxCreateInput): Promise<Transaction> {
  const res = await request<{ transaction: Transaction }>('/transactions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.transaction;
}

export async function updateTransaction(id: string, patch: Partial<Transaction>): Promise<Transaction> {
  const res = await request<{ transaction: Transaction }>(`/transactions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return res.transaction;
}

export async function deleteTransaction(id: string): Promise<void> {
  await request(`/transactions/${id}`, { method: 'DELETE' });
}

/** Summarize income, expense, tax collected, and net for a transaction list. */
export interface TxSummary {
  incomeSubtotal: number;
  incomeTax: number;
  incomeTotal: number;
  expenseSubtotal: number;
  expenseTax: number;
  expenseTotal: number;
  net: number;                   // incomeTotal - expenseTotal
  netPreTax: number;             // incomeSubtotal - expenseSubtotal
  taxCollected: number;          // income tax - expense tax (ITC-eligible)
  byCategory: { category: string; type: TxType; total: number }[];
}

export function summarize(txs: Transaction[]): TxSummary {
  const s: TxSummary = {
    incomeSubtotal: 0, incomeTax: 0, incomeTotal: 0,
    expenseSubtotal: 0, expenseTax: 0, expenseTotal: 0,
    net: 0, netPreTax: 0, taxCollected: 0,
    byCategory: [],
  };
  const cats = new Map<string, number>();
  for (const t of txs) {
    const { subtotal, tax, total } = computeTaxBreakdown(t);
    if (t.type === 'income') {
      s.incomeSubtotal += subtotal;
      s.incomeTax += tax;
      s.incomeTotal += total;
    } else {
      s.expenseSubtotal += subtotal;
      s.expenseTax += tax;
      s.expenseTotal += total;
    }
    const key = `${t.type}:${t.category || 'other'}`;
    cats.set(key, (cats.get(key) || 0) + total);
  }
  s.net = s.incomeTotal - s.expenseTotal;
  s.netPreTax = s.incomeSubtotal - s.expenseSubtotal;
  s.taxCollected = s.incomeTax - s.expenseTax;
  s.byCategory = [...cats.entries()]
    .map(([k, total]) => {
      const [type, category] = k.split(':');
      return { type: type as TxType, category, total };
    })
    .sort((a, b) => b.total - a.total);
  return s;
}

/** Filter by date range YYYY-MM-DD inclusive. Empty ends = no bound. */
export function filterByRange(txs: Transaction[], from?: string, to?: string): Transaction[] {
  return txs.filter((t) => (!from || t.date >= from) && (!to || t.date <= to));
}

/** Produce a CSV blob. Columns match what most Canadian accountants expect. */
export function exportTransactionsCSV(txs: Transaction[]): void {
  const rows: string[][] = [[
    'Date', 'Type', 'Category', 'Description',
    'Amount (entered)', 'Tax mode', 'Tax rate %',
    'Subtotal', 'Tax', 'Total',
    'Payment', 'Deal ID',
  ]];
  for (const t of txs) {
    const b = computeTaxBreakdown(t);
    rows.push([
      t.date, t.type, t.category, t.description || '',
      String(t.amount), t.taxMode, String(t.taxRate),
      b.subtotal.toFixed(2), b.tax.toFixed(2), b.total.toFixed(2),
      t.payment, t.dealId || '',
    ]);
  }
  const csv = rows.map((r) => r.map((c) => {
    // Quote any cell containing a quote, comma, or newline
    const needs = /[",\n]/.test(c);
    const esc = c.replace(/"/g, '""');
    return needs ? `"${esc}"` : esc;
  }).join(',')).join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const date = new Date().toISOString().slice(0, 10);
  a.download = `transactions-${date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export { computeTaxBreakdown };
