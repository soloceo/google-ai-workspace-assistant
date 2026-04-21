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

export type NoteCategory = 'product' | 'idea' | 'task' | 'other';

export interface Note {
  id: string;
  created_at: number;
  updated_at: number;
  title: string;
  text: string;
  category: NoteCategory;
  photos: string[];      // base64 data URLs (JPEG)
  photoTexts: string[];  // parallel: OCR-extracted text per photo (for search)
  owner?: string;         // Google email that owns this note
}

export type TxType = 'income' | 'expense';
export type TxTaxMode = 'exclusive' | 'inclusive' | 'exempt';
export type TxPayment = 'cash' | 'credit' | 'bank' | 'cheque' | 'other';

export interface Transaction {
  id: string;
  created_at: number;
  updated_at: number;
  date: string;              // YYYY-MM-DD
  type: TxType;
  amount: number;            // headline amount entered by user
  taxMode: TxTaxMode;
  taxRate: number;           // percent
  payment: TxPayment;
  category: string;          // free string; preset in UI
  description?: string;
  dealId?: string;           // optional link to a Deal
  owner?: string;
}

/** Derive the canonical subtotal / tax / total amounts from a transaction. */
export function computeTaxBreakdown(tx: { amount: number; taxMode: TxTaxMode; taxRate: number }) {
  const rate = Math.max(0, tx.taxRate) / 100;
  if (tx.taxMode === 'exempt') {
    return { subtotal: tx.amount, tax: 0, total: tx.amount };
  }
  if (tx.taxMode === 'inclusive') {
    const subtotal = rate > 0 ? tx.amount / (1 + rate) : tx.amount;
    const tax = tx.amount - subtotal;
    return { subtotal, tax, total: tx.amount };
  }
  // exclusive
  const tax = tx.amount * rate;
  return { subtotal: tx.amount, tax, total: tx.amount + tax };
}

export type DealType = 'sell' | 'buy' | 'rent' | 'other';
export type DealStatus = 'active' | 'archived';

export interface Deal {
  id: string;
  created_at: number;
  updated_at: number;
  type: DealType;
  status: DealStatus;
  archivedReason?: string;
  stageIndex: number;           // 0-based, max = stage count - 1 per type
  address: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  listingPrice?: number;
  offerPrice?: number;
  finalPrice?: number;
  commission?: number;
  targetCloseDate?: string;     // YYYY-MM-DD
  notes?: string;
  tags: string[];
  owner?: string;
}
