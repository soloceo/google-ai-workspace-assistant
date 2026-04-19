/**
 * Client-side auth using Google Identity Services (GIS) token flow.
 * Replaces all server-side OAuth logic from server.ts.
 */
import { GOOGLE_CLIENT_ID, OAUTH_SCOPES, ACCOUNT_COLORS } from '../config';
import type { StoredAccount } from '../types';

const STORAGE_KEY = 'workspace_accounts';
const TOKEN_EXPIRY_BUFFER_MS = 60_000; // Treat tokens as expired 60s before actual expiry

// ── GIS Script Loading ──────────────────────────────────────

let gisLoadPromise: Promise<void> | null = null;

/**
 * Dynamically load the Google Identity Services library.
 * Returns a promise that resolves when `google.accounts.oauth2` is available.
 */
export function loadGIS(): Promise<void> {
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise<void>((resolve, reject) => {
    // Already loaded
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.oauth2) {
        resolve();
      } else {
        reject(new Error('GIS loaded but google.accounts.oauth2 not available'));
      }
    };
    script.onerror = () => {
      gisLoadPromise = null;
      reject(new Error('Failed to load Google Identity Services script'));
    };
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

// ── Token Request ───────────────────────────────────────────

/**
 * Request an access token via the GIS popup consent flow.
 */
export function requestToken(options?: {
  hint?: string;
  selectAccount?: boolean;
}): Promise<google.accounts.oauth2.TokenResponse> {
  return new Promise((resolve, reject) => {
    if (!GOOGLE_CLIENT_ID) {
      reject(new Error('VITE_GOOGLE_CLIENT_ID is not configured'));
      return;
    }

    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: OAUTH_SCOPES,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        resolve(response);
      },
      error_callback: (error) => {
        reject(new Error(error.message || 'Token request failed'));
      },
    });

    const overrides: {
      hint?: string;
      prompt?: '' | 'none' | 'consent' | 'select_account';
    } = {};

    if (options?.hint) {
      overrides.hint = options.hint;
    }
    if (options?.selectAccount) {
      overrides.prompt = 'select_account';
    }

    tokenClient.requestAccessToken(overrides);
  });
}

// ── User Profile ────────────────────────────────────────────

/**
 * Fetch user profile information from Google using an access token.
 */
export async function fetchUserProfile(
  accessToken: string
): Promise<{ email: string; name: string; picture?: string }> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error('Failed to fetch user profile');
  }
  const data = await res.json();
  return {
    email: data.email || 'unknown',
    name: data.name || data.email || 'Unknown',
    picture: data.picture || undefined,
  };
}

// ── Account Storage (localStorage) ──────────────────────────

/**
 * Get all stored accounts from localStorage.
 */
export function getAccounts(): StoredAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredAccount[];
  } catch {
    return [];
  }
}

/**
 * Save the accounts array to localStorage.
 */
function saveAccounts(accounts: StoredAccount[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}

/**
 * Add a new account or update an existing one (matched by email).
 */
export function addOrUpdateAccount(account: StoredAccount): void {
  const accounts = getAccounts();
  const idx = accounts.findIndex((a) => a.email === account.email);
  if (idx >= 0) {
    accounts[idx] = account;
  } else {
    accounts.push(account);
  }
  saveAccounts(accounts);
}

/**
 * Remove an account by email. Returns the remaining accounts.
 */
export function removeAccount(email: string): StoredAccount[] {
  const accounts = getAccounts().filter((a) => a.email !== email);
  saveAccounts(accounts);
  return accounts;
}

/**
 * Get a valid (non-expired) access token for a specific account email.
 * Returns null if the account is not found or the token has expired.
 */
export function getValidToken(email: string): string | null {
  const accounts = getAccounts();
  const account = accounts.find((a) => a.email === email);
  if (!account) return null;
  if (account.token_expiry <= Date.now() + TOKEN_EXPIRY_BUFFER_MS) return null;
  return account.access_token;
}

/**
 * Check if any stored account has a valid (non-expired) token.
 */
export function isAnyAccountValid(): boolean {
  return getAccounts().some((a) => a.token_expiry > Date.now() + TOKEN_EXPIRY_BUFFER_MS);
}

/**
 * Get the first valid access token from any stored account.
 * Returns null if all tokens are expired.
 */
export function getFirstValidToken(): string | null {
  const account = getAccounts().find((a) => a.token_expiry > Date.now() + TOKEN_EXPIRY_BUFFER_MS);
  return account?.access_token || null;
}

/**
 * Get all accounts with valid (non-expired) tokens.
 */
export function getAllValidAccounts(): StoredAccount[] {
  return getAccounts().filter((a) => a.token_expiry > Date.now() + TOKEN_EXPIRY_BUFFER_MS);
}

// ── Login / Add Account / Logout Flows ──────────────────────

/**
 * Full login flow: load GIS -> request token -> fetch profile -> store account.
 * @param selectAccount If true, forces the account chooser (for adding a new account).
 */
export async function login(selectAccount = false): Promise<StoredAccount> {
  await loadGIS();

  const tokenResponse = await requestToken({ selectAccount });

  const profile = await fetchUserProfile(tokenResponse.access_token);

  const accounts = getAccounts();
  const color =
    accounts.find((a) => a.email === profile.email)?.color ||
    ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length];

  const storedAccount: StoredAccount = {
    email: profile.email,
    name: profile.name,
    picture: profile.picture,
    access_token: tokenResponse.access_token,
    token_expiry: Date.now() + tokenResponse.expires_in * 1000,
    color,
  };

  addOrUpdateAccount(storedAccount);
  return storedAccount;
}

/**
 * Add another account (forces account chooser).
 */
export async function addAccount(): Promise<StoredAccount> {
  return login(true);
}

/**
 * Logout: revoke all tokens and clear storage.
 */
export function logout(): void {
  const accounts = getAccounts();

  // Best-effort revoke each token (GIS may not be loaded yet, so guard)
  if (window.google?.accounts?.oauth2) {
    for (const account of accounts) {
      try {
        google.accounts.oauth2.revoke(account.access_token, () => {
          // Ignore revoke result — we're clearing storage regardless
        });
      } catch {
        // Ignore errors during revoke
      }
    }
  }

  localStorage.removeItem(STORAGE_KEY);
}

// ── Silent Token Refresh ────────────────────────────────────

/**
 * Attempt to silently refresh an access token for the given account email
 * using GIS `prompt: 'none'`. No popup is shown — if the user is still
 * signed in to Google in the browser and previously granted consent,
 * Google returns a fresh token seamlessly. If not, this returns null and
 * the caller should fall back to the interactive flow.
 *
 * This is the closest thing to "permanent" auth achievable in a pure
 * browser app (refresh_tokens require a backend).
 */
const silentRefreshInFlight = new Map<string, Promise<string | null>>();

export async function refreshTokenSilent(email: string): Promise<string | null> {
  const existing = silentRefreshInFlight.get(email);
  if (existing) return existing;

  const promise = (async (): Promise<string | null> => {
    if (!GOOGLE_CLIENT_ID) return null;
    try {
      await loadGIS();
      const tokenResponse = await new Promise<google.accounts.oauth2.TokenResponse>((resolve, reject) => {
        const tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: OAUTH_SCOPES,
          callback: (response) => {
            if (response.error) reject(new Error(response.error_description || response.error));
            else resolve(response);
          },
          error_callback: (error) => reject(new Error(error?.message || 'Silent refresh failed')),
        });
        // `prompt: ''` with a hint is the GIS token-client equivalent of
        // silent auth — returns a token if the user has an active Google
        // session and previously consented, without showing any UI.
        tokenClient.requestAccessToken({ hint: email, prompt: '' });
      });

      if (!tokenResponse?.access_token || !tokenResponse.expires_in) return null;

      const accounts = getAccounts();
      const prev = accounts.find((a) => a.email === email);
      if (!prev) return null;

      const updated: StoredAccount = {
        ...prev,
        access_token: tokenResponse.access_token,
        token_expiry: Date.now() + tokenResponse.expires_in * 1000,
      };
      addOrUpdateAccount(updated);
      return tokenResponse.access_token;
    } catch {
      // Silent refresh failed — caller should fall back to interactive flow
      return null;
    }
  })();

  silentRefreshInFlight.set(email, promise);
  promise.finally(() => silentRefreshInFlight.delete(email));
  return promise;
}

/**
 * Attempt to silently refresh tokens for multiple accounts in parallel.
 * Returns the list of emails whose silent refresh SUCCEEDED.
 */
export async function refreshTokensSilentBatch(emails: string[]): Promise<string[]> {
  const results = await Promise.all(
    emails.map(async (email) => ({ email, token: await refreshTokenSilent(email) }))
  );
  return results.filter((r) => r.token !== null).map((r) => r.email);
}

// ── Token Refresh Wrapper ───────────────────────────────────

// Deduplication map: prevents multiple simultaneous GIS popups for the same account
const refreshInFlight = new Map<string, Promise<string>>();

/**
 * Refresh the token for a given email. Deduplicates concurrent calls so only
 * one GIS popup is shown per account at a time.
 */
async function refreshToken(email: string): Promise<string> {
  const existing = refreshInFlight.get(email);
  if (existing) return existing;

  const promise = (async () => {
    await loadGIS();
    const tokenResponse = await requestToken({ hint: email });

    if (!tokenResponse?.access_token || !tokenResponse.expires_in) {
      throw new Error('Invalid token response from Google');
    }

    const profile = await fetchUserProfile(tokenResponse.access_token);
    const accounts = getAccounts();
    const prev = accounts.find((a) => a.email === email);
    const expiresIn = Math.max(tokenResponse.expires_in, 1);

    const updatedAccount: StoredAccount = {
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
      access_token: tokenResponse.access_token,
      token_expiry: Date.now() + expiresIn * 1000,
      color: prev?.color || ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length],
    };

    addOrUpdateAccount(updatedAccount);
    return updatedAccount.access_token;
  })();

  refreshInFlight.set(email, promise);
  promise.finally(() => refreshInFlight.delete(email));

  return promise;
}

/**
 * Wraps an async function that requires a token. If the function throws a 401
 * (UnauthorizedError), re-requests a token via GIS popup and retries once.
 * Concurrent refresh requests for the same account are deduplicated.
 */
export async function withFreshToken<T>(
  email: string,
  fn: (token: string) => Promise<T>
): Promise<T> {
  const token = getValidToken(email);
  if (token) {
    try {
      return await fn(token);
    } catch (err: any) {
      // Only retry on 401 / UnauthorizedError
      if (err?.name !== 'UnauthorizedError' && err?.message !== 'Token expired or revoked') {
        throw err;
      }
    }
  }

  // Token expired or 401 — refresh (deduplicated) and retry
  const freshToken = await refreshToken(email);
  return fn(freshToken);
}
