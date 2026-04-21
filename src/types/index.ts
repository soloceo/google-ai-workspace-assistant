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
