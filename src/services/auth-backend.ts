/**
 * Client for the optional Cloudflare Worker OAuth token service.
 *
 * When VITE_AUTH_BACKEND_URL is set, the frontend delegates refresh-token
 * management to the backend. Access tokens are still used directly with
 * Google APIs from the browser (same as before) — only the long-lived
 * refresh tokens stay server-side.
 *
 * All requests use `credentials: 'include'` so the session cookie (set by
 * the Worker on first auth) is sent along.
 */
import { AUTH_BACKEND_URL } from '../config';

export interface BackendAccount {
  email: string;
  name: string;
  picture?: string;
}

export interface TokenResponse {
  access_token: string;
  expires_at: number;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!AUTH_BACKEND_URL) throw new Error('AUTH_BACKEND_URL not configured');
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

/**
 * Kick off the OAuth consent flow. Returns the Google authorize URL; the
 * caller should navigate the browser to it. On success, Google redirects
 * back to the Worker, which then redirects to `returnTo` with
 * `?auth=success&email=...`.
 */
export async function startAuth(returnTo: string): Promise<string> {
  const url = new URL('/auth/start', AUTH_BACKEND_URL);
  url.searchParams.set('return_to', returnTo);
  const res = await request<{ authorize_url: string }>(url.pathname + url.search, {
    method: 'POST',
  });
  return res.authorize_url;
}

/**
 * List all accounts the current session has connected.
 */
export async function listAccounts(): Promise<BackendAccount[]> {
  const res = await request<{ accounts: BackendAccount[] }>('/auth/accounts');
  return res.accounts || [];
}

/**
 * Get a fresh access token for the given account. The Worker uses its
 * stored refresh_token to mint a new one. Access tokens are valid ~1 hour.
 */
export async function getAccessToken(email: string): Promise<TokenResponse> {
  return request<TokenResponse>('/auth/token', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

/**
 * Disconnect an account — revokes the refresh token with Google and
 * deletes it from KV.
 */
export async function revokeAccount(email: string): Promise<void> {
  await request('/auth/revoke', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}
