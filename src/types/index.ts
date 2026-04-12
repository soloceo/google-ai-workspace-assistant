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
