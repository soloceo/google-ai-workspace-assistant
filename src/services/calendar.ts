/**
 * Direct Google Calendar REST API calls.
 * Replaces all server-side Calendar routes from server.ts.
 */
import { googleFetch } from './apiHelpers';
import { CALENDAR_API } from '../config';
import type { StoredAccount } from '../types';

/**
 * Ensure datetime strings are valid RFC 3339 for the Calendar API.
 * Converts datetime-local format ("YYYY-MM-DDThh:mm") to full ISO 8601.
 */
function toRfc3339(dt: string): string {
  // If already ISO (contains Z or timezone offset), use as-is
  if (/[Z+-]/.test(dt.slice(10))) return dt;
  // datetime-local format "YYYY-MM-DDThh:mm" → parse as local and convert
  const d = new Date(dt);
  if (isNaN(d.getTime())) throw new Error(`Invalid datetime: ${dt}`);
  return d.toISOString();
}

// ── Single-Account Operations ───────────────────────────────

/**
 * List calendar events for one account.
 */
export async function listEvents(
  token: string,
  params?: {
    timeMin?: string;
    maxResults?: number;
    pageToken?: string;
    q?: string;
    signal?: AbortSignal;
  }
): Promise<{ items: any[]; nextPageToken?: string }> {
  const searchParams = new URLSearchParams();
  searchParams.set('singleEvents', 'true');
  searchParams.set('orderBy', 'startTime');
  // Default to start of today (local) so events earlier today still show up.
  // Previously used `new Date().toISOString()` which excluded any event
  // whose start time was before "now" — hiding events created earlier today.
  const defaultTimeMin = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  })();
  searchParams.set('timeMin', params?.timeMin || defaultTimeMin);
  searchParams.set('maxResults', String(params?.maxResults || 50));
  if (params?.pageToken) searchParams.set('pageToken', params.pageToken);
  if (params?.q) searchParams.set('q', params.q);

  const url = `${CALENDAR_API}/calendars/primary/events?${searchParams.toString()}`;
  const data = await googleFetch<{
    items?: any[];
    nextPageToken?: string;
  }>(url, token, params?.signal ? { signal: params.signal } : {});

  return {
    items: data.items || [],
    nextPageToken: data.nextPageToken,
  };
}

/**
 * Create a new calendar event.
 */
export async function createEvent(
  token: string,
  event: {
    summary: string;
    description?: string;
    location?: string;
    start: string;
    end: string;
  }
): Promise<any> {
  if (!event.summary?.trim()) throw new Error('Summary required');

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return googleFetch(`${CALENDAR_API}/calendars/primary/events`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: event.summary,
      description: event.description,
      location: event.location,
      start: { dateTime: toRfc3339(event.start), timeZone },
      end: { dateTime: toRfc3339(event.end), timeZone },
    }),
  });
}

/**
 * Update (patch) an existing calendar event.
 * Only sends fields that are provided — avoids overwriting omitted fields.
 */
export async function updateEvent(
  token: string,
  eventId: string,
  event: {
    summary?: string;
    description?: string;
    location?: string;
    start?: string;
    end?: string;
  }
): Promise<any> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const body: Record<string, any> = {};
  if (event.summary !== undefined) body.summary = event.summary;
  if (event.description !== undefined) body.description = event.description;
  if (event.location !== undefined) body.location = event.location;
  if (event.start !== undefined) body.start = { dateTime: toRfc3339(event.start), timeZone };
  if (event.end !== undefined) body.end = { dateTime: toRfc3339(event.end), timeZone };

  return googleFetch(
    `${CALENDAR_API}/calendars/primary/events/${eventId}`,
    token,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

/**
 * Delete a calendar event.
 */
export async function deleteEvent(
  token: string,
  eventId: string
): Promise<void> {
  await googleFetch(
    `${CALENDAR_API}/calendars/primary/events/${eventId}`,
    token,
    { method: 'DELETE' }
  );
}

// ── Multi-Account Operations ────────────────────────────────

/**
 * Fetch calendar events from all accounts, merged and sorted by start time.
 */
export async function fetchAllAccountEvents(
  accounts: StoredAccount[],
  params?: {
    q?: string;
    pageTokens?: Record<string, string | null>;
    accountFilter?: string;
    signal?: AbortSignal;
  }
): Promise<{ items: any[]; pageTokens: Record<string, string | null>; hasMore: boolean; failedAccounts: string[] }> {
  const targets = params?.accountFilter
    ? accounts.filter((a) => a.email === params.accountFilter)
    : accounts;

  const perAccountTokens = params?.pageTokens || {};
  const allEvents: any[] = [];
  const nextPageTokens: Record<string, string | null> = {};
  const failedAccounts: string[] = [];

  await Promise.all(
    targets.map(async (account) => {
      // Skip accounts that returned null (no more results) on a previous page
      const accountPageToken = perAccountTokens[account.email];
      if (Object.keys(perAccountTokens).length > 0 && accountPageToken === null) {
        nextPageTokens[account.email] = null;
        return;
      }

      try {
        // Bumped from 15/20 → 30/50: surface more of the user's upcoming
        // events in one fetch. Calendar API max is 2500; 50 is a safe
        // balance of coverage vs latency.
        const maxResults = targets.length > 1 ? 30 : 50;
        const result = await listEvents(account.access_token, {
          maxResults,
          pageToken: accountPageToken || undefined,
          q: params?.q || undefined,
          signal: params?.signal,
        });

        const events = result.items.map((ev: any) => ({
          ...ev,
          accountEmail: account.email,
          accountColor: account.color,
        }));

        allEvents.push(...events);
        nextPageTokens[account.email] = result.nextPageToken || null;
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
          console.error(`Calendar API error for ${account.email}:`, e);
          failedAccounts.push(account.email);
        }
        nextPageTokens[account.email] = null;
      }
    })
  );

  // Sort by start time (earliest first)
  allEvents.sort((a, b) => {
    const tA = new Date(a.start?.dateTime || a.start?.date || 0).getTime();
    const tB = new Date(b.start?.dateTime || b.start?.date || 0).getTime();
    return tA - tB;
  });

  const hasMore = Object.values(nextPageTokens).some(t => t !== null);

  return {
    items: allEvents,
    pageTokens: nextPageTokens,
    hasMore,
    failedAccounts,
  };
}
