export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

export interface Email {
  id: string;
  threadId?: string;
  snippet: string;
  labelIds?: string[];
  payload: {
    headers: { name: string; value: string }[];
    body?: { data?: string };
    parts?: any[];
    mimeType?: string;
  };
  accountEmail?: string;
  accountColor?: string;
  internalDate?: string;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  description?: string;
  location?: string;
  accountEmail?: string;
  accountColor?: string;
}

export interface AccountSummary {
  email: string;
  name: string;
  picture?: string;
  color: string;
}

export interface UserProfile {
  name: string;
  email: string;
  picture?: string;
  accounts?: AccountSummary[];
}

export interface StoredAccount {
  email: string;
  name: string;
  picture?: string;
  access_token: string;
  token_expiry: number;
  color: string;
}

export type NoteCategory = 'product' | 'idea' | 'task' | 'accounting' | 'other';
export type NoteTxType = 'income' | 'expense';
export type NoteTaxMode = 'exclusive' | 'inclusive' | 'exempt';
export type NotePayment = 'cash' | 'credit' | 'bank' | 'cheque' | 'other';

export interface Note {
  id: string;
  created_at: number;
  updated_at: number;
  title: string;
  text: string;
  category: NoteCategory;
  photos: string[];      // base64 data URLs (JPEG)
  photoTexts: string[];  // parallel: OCR-extracted text per photo (for search)

  // Accounting fields — optional, only populated when category === 'accounting'.
  amount?: number;
  txType?: NoteTxType;
  taxMode?: NoteTaxMode;
  taxRate?: number;      // percent
  payment?: NotePayment;
  txDate?: string;       // YYYY-MM-DD

  owner?: string;         // Google email that owns this note
}

/** Derive subtotal / tax / total from an accounting note's fields. */
export function computeNoteTaxBreakdown(n: { amount?: number; taxMode?: NoteTaxMode; taxRate?: number }) {
  const amount = n.amount ?? 0;
  const rate = Math.max(0, n.taxRate ?? 0) / 100;
  const mode = n.taxMode ?? 'exclusive';
  if (mode === 'exempt') return { subtotal: amount, tax: 0, total: amount };
  if (mode === 'inclusive') {
    const subtotal = rate > 0 ? amount / (1 + rate) : amount;
    return { subtotal, tax: amount - subtotal, total: amount };
  }
  // exclusive
  const tax = amount * rate;
  return { subtotal: amount, tax, total: amount + tax };
}
