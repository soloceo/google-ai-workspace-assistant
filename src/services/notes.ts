/**
 * Notes API client — talks to the Cloudflare Worker's /notes endpoints.
 * Requires the Worker backend to be deployed (VITE_AUTH_BACKEND_URL set);
 * notes are tied to the browser session, not any Google account.
 */
import { AUTH_BACKEND_URL, USE_AUTH_BACKEND } from '../config';
import type { Note, NoteCategory } from '../types';

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

export async function listNotes(): Promise<Note[]> {
  const res = await request<{ notes: Note[] }>('/notes');
  return res.notes || [];
}

export async function createNote(input: {
  title?: string;
  text?: string;
  category?: NoteCategory;
  photos?: string[];
  photoTexts?: string[];
}): Promise<Note> {
  const res = await request<{ note: Note }>('/notes', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.note;
}

export async function updateNote(id: string, patch: {
  title?: string;
  text?: string;
  category?: NoteCategory;
  photos?: string[];
  photoTexts?: string[];
}): Promise<Note> {
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
