/**
 * Notes API client — talks to the Cloudflare Worker's /notes endpoints.
 * Requires the Worker backend to be deployed (VITE_AUTH_BACKEND_URL set);
 * notes are tied to the browser session, not any Google account.
 */
import { AUTH_BACKEND_URL, USE_AUTH_BACKEND } from '../config';
import type { Note, NoteCategory, NoteTxType, NoteTaxMode, NotePayment } from '../types';

export class NotesUnavailableError extends Error {
  constructor() {
    super('Notes require the Cloudflare Worker backend (VITE_AUTH_BACKEND_URL).');
    this.name = 'NotesUnavailableError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!USE_AUTH_BACKEND) throw new NotesUnavailableError();
  const res = await fetch(`${AUTH_BACKEND_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body.error || body.detail || '';
    } catch {
      /* ignore */
    }
    throw new Error(`${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`);
  }
  return res.json() as Promise<T>;
}

export interface NotesListResult {
  notes: Note[];
  ownerCounts: Record<string, number>; // email → note count
  connectedEmails: string[];            // every Google account connected in this session
  primaryOwner: string | null;          // email that new notes will be saved under
}

export async function listNotes(): Promise<NotesListResult> {
  const res = await request<Partial<NotesListResult>>('/notes');
  return {
    notes: res.notes || [],
    ownerCounts: res.ownerCounts || {},
    connectedEmails: res.connectedEmails || [],
    primaryOwner: res.primaryOwner || null,
  };
}

export interface NoteWriteInput {
  title?: string;
  text?: string;
  category?: NoteCategory;
  photos?: string[];
  photoTexts?: string[];
  // Accounting fields — optional, sent only when category is 'accounting'.
  // TS-level declaration so future callers don't silently drop them.
  amount?: number;
  txType?: NoteTxType;
  taxMode?: NoteTaxMode;
  taxRate?: number;
  payment?: NotePayment;
  txDate?: string;
}

export async function createNote(input: NoteWriteInput): Promise<Note> {
  const res = await request<{ note: Note }>('/notes', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.note;
}

export async function updateNote(id: string, patch: NoteWriteInput): Promise<Note> {
  const res = await request<{ note: Note }>(`/notes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return res.note;
}

export async function deleteNote(id: string): Promise<void> {
  await request(`/notes/${id}`, { method: 'DELETE' });
}

/**
 * Consolidate every note in the session under a single Google email.
 * Target must be an email that's currently authenticated in the session;
 * the Worker will reject otherwise.
 */
export async function migrateNotes(toEmail: string): Promise<{ moved: number; target: string }> {
  const res = await request<{ moved: number; target: string }>('/notes/migrate', {
    method: 'POST',
    body: JSON.stringify({ to: toEmail }),
  });
  return res;
}

/**
 * Local keyword search across title, text, and OCR'd photo text.
 * Called by both the UI search bar and the AI `search_notes` tool.
 */
export function searchNotes(notes: Note[], query: string): Note[] {
  const q = query.trim().toLowerCase();
  if (!q) return notes;
  const terms = q.split(/\s+/).filter(Boolean);
  return notes.filter((n) => {
    const haystack = [
      n.title,
      n.text,
      ...(n.photoTexts || []),
    ].join(' ').toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
}

/**
 * Export all notes as a downloadable JSON file. Includes photos (base64)
 * and OCR text so the backup is self-contained and can be re-imported
 * into any compatible instance.
 */
export function exportNotesToFile(notes: Note[]): void {
  // Strip the `owner` email before writing the file — the backup doesn't
  // need to disclose which Google account stored each note, and the
  // server re-assigns an owner on import anyway.
  const sanitized = notes.map(({ owner, ...rest }) => rest);
  const payload = {
    version: 1,
    exported_at: Date.now(),
    count: sanitized.length,
    notes: sanitized,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const date = new Date().toISOString().slice(0, 10);
  a.download = `notes-backup-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Parse a previously-exported JSON file and upload each note to the
 * backend. Returns the number of notes successfully imported.
 *
 * NOTE: Each imported note gets a fresh ID server-side, so re-importing
 * the same file creates duplicates rather than overwriting. Simple and
 * predictable — users who want dedup should export → clear → import.
 */
export async function importNotesFromFile(file: File): Promise<number> {
  const text = await file.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON file');
  }
  const notes: any[] = Array.isArray(parsed?.notes) ? parsed.notes : Array.isArray(parsed) ? parsed : [];
  if (notes.length === 0) throw new Error('No notes found in file');

  let imported = 0;
  for (const n of notes) {
    try {
      // Forward every field including accounting ones, so backups with
      // amount/tax/payment restore losslessly. The server re-validates
      // and assigns a fresh id + owner.
      await createNote({
        title: n.title || '',
        text: n.text || '',
        category: n.category || 'other',
        photos: Array.isArray(n.photos) ? n.photos : [],
        photoTexts: Array.isArray(n.photoTexts) ? n.photoTexts : [],
        amount: typeof n.amount === 'number' ? n.amount : undefined,
        txType: n.txType,
        taxMode: n.taxMode,
        taxRate: typeof n.taxRate === 'number' ? n.taxRate : undefined,
        payment: n.payment,
        txDate: typeof n.txDate === 'string' ? n.txDate : undefined,
      });
      imported += 1;
    } catch (e) {
      console.error('Failed to import note:', e);
    }
  }
  return imported;
}
