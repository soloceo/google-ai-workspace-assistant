/**
 * Cloudflare Worker — OAuth Token Service
 *
 * Handles Google OAuth code flow with `access_type=offline` to obtain
 * refresh tokens, which are stored encrypted in KV. The browser calls
 * `/auth/token?email=...` whenever it needs a fresh access token — the
 * Worker exchanges the stored refresh_token for a fresh access_token and
 * returns it. This gives the frontend effectively "permanent" auth
 * without ever exposing the refresh_token to the browser.
 *
 * Endpoints:
 *   POST /auth/start         → returns Google consent URL
 *   GET  /auth/callback      → Google redirects here after consent
 *   GET  /auth/accounts      → list connected account emails (session)
 *   POST /auth/token         → { email } → { access_token, expires_at }
 *   POST /auth/revoke        → { email } → removes refresh_token
 *
 * Security:
 *   - Session cookie (HttpOnly, Secure, SameSite=Lax) identifies the browser
 *   - Refresh tokens encrypted with AES-GCM using a per-Worker secret key
 *   - CORS locked to FRONTEND_ORIGIN
 */

interface Env {
  TOKENS: KVNamespace;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  FRONTEND_ORIGIN: string;    // e.g. "https://soloceo.github.io"
  ENCRYPTION_KEY: string;      // 32-byte base64-encoded AES key
  OAUTH_SCOPES: string;        // space-separated scopes
}

interface StoredAccount {
  email: string;
  name: string;
  picture?: string;
  refresh_token: string;
}

const SESSION_COOKIE = 'ws_sid';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year

// ─── Crypto helpers ─────────────────────────────────────────

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64encode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}

async function getAesKey(keyB64: string): Promise<CryptoKey> {
  const raw = b64decode(keyB64);
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encrypt(text: string, keyB64: string): Promise<string> {
  const key = await getAesKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  // Pack iv + ciphertext
  const packed = new Uint8Array(iv.length + ct.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ct), iv.length);
  return b64encode(packed);
}

async function decrypt(packedB64: string, keyB64: string): Promise<string> {
  const key = await getAesKey(keyB64);
  const packed = b64decode(packedB64);
  const iv = packed.slice(0, 12);
  const ct = packed.slice(12);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

function newSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return b64encode(bytes).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!);
}

// ─── Session helpers ────────────────────────────────────────

function getSessionId(req: Request): string | null {
  const cookie = req.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? match[1] : null;
}

function sessionCookie(sid: string): string {
  // SameSite=None (+ Secure) is required because the frontend makes
  // cross-origin fetch requests to the Worker with credentials. Lax
  // would prevent the cookie from being sent on fetch/XHR.
  return `${SESSION_COOKIE}=${sid}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

async function listAccountsForSession(env: Env, sid: string): Promise<StoredAccount[]> {
  const { keys } = await env.TOKENS.list({ prefix: `sess:${sid}:` });
  const accounts: StoredAccount[] = [];
  for (const k of keys) {
    const raw = await env.TOKENS.get(k.name);
    if (!raw) continue;
    try {
      const decrypted = await decrypt(raw, env.ENCRYPTION_KEY);
      accounts.push(JSON.parse(decrypted));
    } catch {
      // Decryption failed — skip
    }
  }
  return accounts;
}

async function storeAccount(env: Env, sid: string, account: StoredAccount): Promise<void> {
  const encrypted = await encrypt(JSON.stringify(account), env.ENCRYPTION_KEY);
  await env.TOKENS.put(`sess:${sid}:${account.email}`, encrypted, {
    expirationTtl: SESSION_TTL_SECONDS,
  });
}

async function deleteAccount(env: Env, sid: string, email: string): Promise<void> {
  await env.TOKENS.delete(`sess:${sid}:${email}`);
}

// ─── CORS / response helpers ────────────────────────────────

function corsHeaders(env: Env, extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.FRONTEND_ORIGIN,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Vary': 'Origin',
    ...extra,
  };
}

function json(env: Env, body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(env),
      ...(init.headers as Record<string, string> || {}),
    },
  });
}

// ─── Google token endpoints ─────────────────────────────────

async function exchangeCodeForTokens(env: Env, code: string, redirectUri: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
}> {
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json();
}

async function refreshAccessToken(env: Env, refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Refresh failed: ${await res.text()}`);
  return res.json();
}

async function fetchGoogleUserInfo(accessToken: string): Promise<{ email: string; name: string; picture?: string }> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch user info');
  return res.json();
}

async function revokeToken(token: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
}

/**
 * Validate return_to is same-origin as FRONTEND_ORIGIN. Prevents open
 * redirects where an attacker could trick the Worker into sending a
 * real Google login success to their own URL (leaking the user's email).
 */
function isAllowedReturnTo(url: string, env: Env): boolean {
  try {
    const u = new URL(url);
    const allowed = new URL(env.FRONTEND_ORIGIN);
    return u.origin === allowed.origin;
  } catch {
    return false;
  }
}

// ─── Route handlers ─────────────────────────────────────────

async function handleStart(req: Request, env: Env): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const requestedReturnTo = searchParams.get('return_to') || env.FRONTEND_ORIGIN;
  const returnTo = isAllowedReturnTo(requestedReturnTo, env)
    ? requestedReturnTo
    : env.FRONTEND_ORIGIN;

  let sid = getSessionId(req);
  const newSession = !sid;
  if (!sid) sid = newSessionId();

  // Use '~' as separator: not produced by base64url (sid) and not
  // produced by encodeURIComponent (returnTo), so it's unambiguous.
  // Previous version used '.' which collided with dots in the URL
  // (e.g. "soloceo.github.io") and truncated the return URL.
  const state = `${sid}~${encodeURIComponent(returnTo)}`;
  const redirectUri = new URL('/auth/callback', req.url).toString();

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', env.OAUTH_SCOPES);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent select_account');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...corsHeaders(env),
  };
  if (newSession) headers['Set-Cookie'] = sessionCookie(sid);
  return new Response(JSON.stringify({ authorize_url: url.toString() }), { headers });
}

async function handleCallback(req: Request, env: Env): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state') || '';
  const error = searchParams.get('error');

  if (error) return new Response(`OAuth error: ${error}`, { status: 400 });
  if (!code) return new Response('Missing code', { status: 400 });

  const sepIdx = state.indexOf('~');
  const sid = sepIdx > 0 ? state.slice(0, sepIdx) : '';
  const returnToEnc = sepIdx > 0 ? state.slice(sepIdx + 1) : '';
  const decodedReturnTo = returnToEnc ? decodeURIComponent(returnToEnc) : env.FRONTEND_ORIGIN;
  // Re-validate return_to here too: even though handleStart validates
  // on the way in, an attacker could craft a state string directly.
  const returnTo = isAllowedReturnTo(decodedReturnTo, env) ? decodedReturnTo : env.FRONTEND_ORIGIN;
  if (!sid) return new Response('Invalid state', { status: 400 });

  // Bind state to session: the sid embedded in state MUST match the
  // cookie in this browser. Prevents session-fixation / CSRF where an
  // attacker gets their /auth/start URL consumed by the victim.
  const cookieSid = getSessionId(req);
  if (cookieSid !== sid) {
    return new Response('Session mismatch — please restart the login flow', { status: 400 });
  }

  const redirectUri = new URL('/auth/callback', req.url).toString();
  const tokens = await exchangeCodeForTokens(env, code, redirectUri);

  if (!tokens.refresh_token) {
    // Google only returns refresh_token on first consent. If the user had
    // previously granted consent without being prompted again, we won't
    // get one. `prompt=consent` above forces re-consent to avoid this.
    return new Response('No refresh_token returned by Google. Try revoking consent and retrying.', { status: 500 });
  }

  const userInfo = await fetchGoogleUserInfo(tokens.access_token);
  await storeAccount(env, sid, {
    email: userInfo.email,
    name: userInfo.name,
    picture: userInfo.picture,
    refresh_token: tokens.refresh_token,
  });

  // Redirect back to the frontend with a success indicator
  const returnUrl = new URL(returnTo);
  returnUrl.searchParams.set('auth', 'success');
  returnUrl.searchParams.set('email', userInfo.email);
  return new Response(null, {
    status: 302,
    headers: {
      'Location': returnUrl.toString(),
      'Set-Cookie': sessionCookie(sid),
    },
  });
}

async function handleAccounts(req: Request, env: Env): Promise<Response> {
  const sid = getSessionId(req);
  if (!sid) return json(env, { accounts: [] });
  const accounts = await listAccountsForSession(env, sid);
  return json(env, {
    accounts: accounts.map((a) => ({ email: a.email, name: a.name, picture: a.picture })),
  });
}

async function handleToken(req: Request, env: Env): Promise<Response> {
  const sid = getSessionId(req);
  if (!sid) return json(env, { error: 'No session' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = body.email;
  if (!email) return json(env, { error: 'email required' }, { status: 400 });

  const raw = await env.TOKENS.get(`sess:${sid}:${email}`);
  if (!raw) return json(env, { error: 'Account not connected' }, { status: 404 });

  const decrypted = await decrypt(raw, env.ENCRYPTION_KEY);
  const account: StoredAccount = JSON.parse(decrypted);

  try {
    const tokenRes = await refreshAccessToken(env, account.refresh_token);
    // Google may rotate the refresh_token (esp. after scope changes or
    // security events). If a new one comes back, persist it — otherwise
    // the next refresh will silently fail with invalid_grant.
    if (tokenRes.refresh_token && tokenRes.refresh_token !== account.refresh_token) {
      await storeAccount(env, sid, { ...account, refresh_token: tokenRes.refresh_token });
    }
    return json(env, {
      access_token: tokenRes.access_token,
      expires_at: Date.now() + tokenRes.expires_in * 1000,
    });
  } catch (e: any) {
    // Refresh token likely revoked. Remove the account so the user can reconnect.
    await deleteAccount(env, sid, email);
    // Don't leak raw Google error text — log server-side instead.
    console.error(`[auth/token] refresh failed for ${email}:`, e);
    return json(env, { error: 'Refresh failed — please reconnect' }, { status: 401 });
  }
}

async function handleRevoke(req: Request, env: Env): Promise<Response> {
  const sid = getSessionId(req);
  if (!sid) return json(env, { ok: true });
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = body.email;
  if (!email) return json(env, { error: 'email required' }, { status: 400 });

  const raw = await env.TOKENS.get(`sess:${sid}:${email}`);
  if (raw) {
    try {
      const decrypted = await decrypt(raw, env.ENCRYPTION_KEY);
      const account: StoredAccount = JSON.parse(decrypted);
      await revokeToken(account.refresh_token);
    } catch {
      // ignore
    }
  }
  await deleteAccount(env, sid, email);
  return json(env, { ok: true });
}

// ─── Notes ──────────────────────────────────────────────────
// Personal notebook — keyed by the user's connected Google account email,
// NOT by browser session. This means:
//   • Multiple users on separate browsers → fully isolated by email
//   • Same user on multiple devices → same notes everywhere
//   • User clears cookies → re-login with same Google account → notes back
//
// KV key format: note:owner:${googleEmail}:${noteId}
// Legacy keys (note:${sid}:${noteId}) from before the re-key are migrated
// to the new format on first list after the session's first Google login.
//
// Notes are NOT encrypted — they live alongside refresh tokens in KV.
// Between users they're isolated by email (you can only read notes whose
// owner email is connected to your session). Photos are stored inline as
// base64 JPEG after client-side resize.

const NOTE_CATEGORIES = new Set(['product', 'idea', 'task', 'accounting', 'other']);
const NOTE_TX_TYPES = new Set(['income', 'expense']);
const NOTE_TAX_MODES = new Set(['exclusive', 'inclusive', 'exempt']);
const NOTE_PAYMENTS = new Set(['cash', 'credit', 'bank', 'cheque', 'other']);
const MAX_NOTE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB — KV value limit is 25MB

interface StoredNote {
  id: string;
  created_at: number;
  updated_at: number;
  title: string;
  text: string;
  category: string; // product | idea | task | accounting | other
  photos: string[]; // base64 data URLs (JPEG after client-side resize)
  photoTexts: string[]; // parallel: OCR-extracted text per photo

  // Accounting fields — all optional, only populated when
  // category === 'accounting'. Kept on every note type so we don't
  // need a separate schema; undefined for non-accounting notes.
  amount?: number;           // headline amount as entered
  txType?: string;           // income | expense
  taxMode?: string;          // exclusive | inclusive | exempt
  taxRate?: number;          // percent, e.g. 13 for HST Ontario
  payment?: string;          // cash | credit | bank | cheque | other
  txDate?: string;           // YYYY-MM-DD — transaction date (may differ from note created_at)

  owner?: string; // Google email that owns this note (not encrypted, used by client)
}

function newNoteId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return b64encode(bytes).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!);
}

function sanitizeNote(n: any, existing?: StoredNote): StoredNote {
  const now = Date.now();
  const cleanNum = (v: any): number | undefined => {
    if (v === null || v === undefined || v === '') return undefined;
    const f = Number(v);
    return Number.isFinite(f) ? f : undefined;
  };
  const cleanEnum = (v: any, allowed: Set<string>): string | undefined =>
    typeof v === 'string' && allowed.has(v) ? v : undefined;
  const cleanDate = (v: any): string | undefined =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;

  const category = NOTE_CATEGORIES.has(n?.category) ? n.category : existing?.category || 'other';
  // Accounting fields are only retained when category is 'accounting'.
  // Switching away clears them — this prevents orphan amounts from
  // polluting ledger summaries if a user re-categorizes a note.
  const isAccounting = category === 'accounting';

  // Partial-update helper: if the key was explicitly sent by the client
  // (including as undefined/null to clear it), respect the sent value.
  // Otherwise fall back to the existing stored value. Without this, a
  // client could never clear an optional field via PATCH because
  // `n?.field ?? existing?.field` always reverts to existing when the
  // client sent undefined.
  const merged = <T>(key: string, sanitize: (v: any) => T | undefined, existingVal: T | undefined): T | undefined => {
    if (n && typeof n === 'object' && key in n) return sanitize(n[key]);
    return existingVal;
  };

  return {
    id: existing?.id || newNoteId(),
    created_at: existing?.created_at || now,
    updated_at: now,
    title: typeof n?.title === 'string' ? n.title.slice(0, 500) : existing?.title || '',
    text: typeof n?.text === 'string' ? n.text.slice(0, 100_000) : existing?.text || '',
    category,
    photos: Array.isArray(n?.photos) ? n.photos.filter((p: any) => typeof p === 'string').slice(0, 20) : existing?.photos || [],
    photoTexts: Array.isArray(n?.photoTexts) ? n.photoTexts.filter((t: any) => typeof t === 'string').slice(0, 20) : existing?.photoTexts || [],
    // Accounting fields — cleared if category isn't 'accounting'.
    // Within accounting, each field respects explicit clears (PATCH
    // with undefined means "remove this field", not "keep existing").
    amount:  isAccounting ? merged('amount',  cleanNum,                                      existing?.amount)  : undefined,
    txType:  isAccounting ? merged('txType',  (v) => cleanEnum(v, NOTE_TX_TYPES),            existing?.txType)  : undefined,
    taxMode: isAccounting ? merged('taxMode', (v) => cleanEnum(v, NOTE_TAX_MODES),           existing?.taxMode) : undefined,
    taxRate: isAccounting ? merged('taxRate', cleanNum,                                      existing?.taxRate) : undefined,
    payment: isAccounting ? merged('payment', (v) => cleanEnum(v, NOTE_PAYMENTS),            existing?.payment) : undefined,
    txDate:  isAccounting ? merged('txDate',  cleanDate,                                     existing?.txDate)  : undefined,
  };
}

/** Return the Google emails currently connected to this browser session. */
async function getSessionEmails(env: Env, sid: string): Promise<string[]> {
  const { keys } = await env.TOKENS.list({ prefix: `sess:${sid}:` });
  return keys
    .map(k => k.name.substring(`sess:${sid}:`.length))
    // Filter out our own metadata keys (prefixed with __)
    .filter((e) => e && !e.startsWith('__'))
    .sort();
}

/**
 * Decide which email new notes should be saved under. Priority:
 *   1. Explicit user choice persisted after a migrate (survives KV's
 *      eventual consistency — critical so new notes don't drift back
 *      to the old namespace right after a migrate).
 *   2. Email that already owns the most notes (alphabetical tiebreak).
 *   3. Alphabetically-first connected email (empty-state default).
 */
async function getPrimaryOwnerForSession(env: Env, sid: string): Promise<string | null> {
  const emails = await getSessionEmails(env, sid);
  if (emails.length === 0) return null;

  const pinned = await env.TOKENS.get(`sess:${sid}:__primaryOwner`);
  if (pinned && emails.includes(pinned)) return pinned;

  const counts = await Promise.all(
    emails.map(async (email) => {
      const { keys } = await env.TOKENS.list({ prefix: `note:owner:${email}:`, limit: 1000 });
      return { email, count: keys.length };
    })
  );
  counts.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.email.localeCompare(b.email);
  });
  return counts[0].email;
}

/**
 * Move old session-keyed notes to the new email-keyed namespace.
 * Idempotent — runs on each listNotes call but is cheap when there's
 * nothing to migrate (single KV list returns zero keys).
 */
async function migrateSessionNotes(env: Env, sid: string, ownerEmail: string): Promise<void> {
  const { keys } = await env.TOKENS.list({ prefix: `note:${sid}:` });
  if (keys.length === 0) return;
  for (const k of keys) {
    const value = await env.TOKENS.get(k.name);
    if (!value) continue; // transient null from KV eventual consistency — DO NOT delete
    const noteId = k.name.substring(`note:${sid}:`.length);
    const targetKey = `note:owner:${ownerEmail}:${noteId}`;
    // Avoid overwriting a newer note with the same random ID (very unlikely
    // given 96 bits of entropy, but migrations should never destroy data).
    const existingAtTarget = await env.TOKENS.get(targetKey);
    if (existingAtTarget) {
      // Re-key with a fresh suffix instead of clobbering
      const suffix = crypto.getRandomValues(new Uint8Array(4));
      const unique = Array.from(suffix).map(b => b.toString(16).padStart(2, '0')).join('');
      await env.TOKENS.put(`${targetKey}-${unique}`, value);
    } else {
      await env.TOKENS.put(targetKey, value);
    }
    await env.TOKENS.delete(k.name);
  }
}

/**
 * Find the KV key for a note by scanning all connected emails' namespaces.
 * Ensures callers can only hit notes owned by a Google account that's
 * currently authenticated in their session.
 *
 * If the same noteId exists in multiple namespaces (can happen after a
 * partial migration), prefer the primaryOwner's copy so updates don't
 * silently land in a "stale" namespace.
 */
async function findNoteKey(env: Env, sid: string, noteId: string): Promise<{ key: string; owner: string } | null> {
  const emails = await getSessionEmails(env, sid);
  if (emails.length === 0) return null;

  const primary = await getPrimaryOwnerForSession(env, sid);
  const order = primary && emails.includes(primary)
    ? [primary, ...emails.filter((e) => e !== primary)]
    : emails;

  for (const email of order) {
    const key = `note:owner:${email}:${noteId}`;
    const exists = await env.TOKENS.get(key);
    if (exists) return { key, owner: email };
  }
  return null;
}

async function handleListNotes(req: Request, env: Env): Promise<Response> {
  const sid = getSessionId(req);
  if (!sid) return json(env, { notes: [] });

  const emails = await getSessionEmails(env, sid);
  if (emails.length === 0) return json(env, { notes: [] });

  // Migrate any legacy session-keyed notes to the primary email
  // namespace on first authenticated list call.
  await migrateSessionNotes(env, sid, emails[0]);

  // Aggregate notes from every connected email's namespace so users
  // with multiple Google accounts see all their notes together.
  const allNotes: StoredNote[] = [];
  for (const email of emails) {
    const { keys } = await env.TOKENS.list({ prefix: `note:owner:${email}:` });
    const batch = await Promise.all(
      keys.map(async (k) => {
        const raw = await env.TOKENS.get(k.name);
        if (!raw) return null;
        try {
          const n = JSON.parse(raw) as StoredNote;
          n.owner = email; // tell the client which email owns this note
          return n;
        } catch {
          return null;
        }
      })
    );
    allNotes.push(...batch.filter((n): n is StoredNote => n !== null));
  }
  allNotes.sort((a, b) => b.updated_at - a.updated_at);

  // Count notes per owner email so the client can show where storage
  // currently lives and let the user switch it.
  const ownerCounts: Record<string, number> = {};
  for (const n of allNotes) {
    if (n.owner) ownerCounts[n.owner] = (ownerCounts[n.owner] || 0) + 1;
  }

  return json(env, {
    notes: allNotes,
    ownerCounts,
    connectedEmails: emails,
    primaryOwner: await getPrimaryOwnerForSession(env, sid),
  });
}

async function handleCreateNote(req: Request, env: Env): Promise<Response> {
  const sid = getSessionId(req);
  if (!sid) return json(env, { error: 'No session' }, { status: 401 });

  // Writes go to whichever email already owns the most notes — so new
  // notes follow existing data. If no notes exist yet, falls back to
  // the alphabetically-first connected email.
  const owner = await getPrimaryOwnerForSession(env, sid);
  if (!owner) return json(env, { error: 'Must log in with a Google account first' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, any>;
  const note = sanitizeNote(body);

  const serialized = JSON.stringify(note);
  // String .length counts UTF-16 code units, not bytes. Use TextEncoder
  // so CJK text is measured accurately against the 25MB KV value cap.
  if (new TextEncoder().encode(serialized).length > MAX_NOTE_SIZE_BYTES) {
    return json(env, { error: 'Note too large (max 20MB incl. photos)' }, { status: 413 });
  }

  await env.TOKENS.put(`note:owner:${owner}:${note.id}`, serialized);
  return json(env, { note: { ...note, owner } });
}

async function handleUpdateNote(req: Request, env: Env, noteId: string): Promise<Response> {
  const sid = getSessionId(req);
  if (!sid) return json(env, { error: 'No session' }, { status: 401 });

  const found = await findNoteKey(env, sid, noteId);
  if (!found) return json(env, { error: 'Not found' }, { status: 404 });

  const raw = await env.TOKENS.get(found.key);
  if (!raw) return json(env, { error: 'Not found' }, { status: 404 });
  const existing = JSON.parse(raw) as StoredNote;

  const body = (await req.json().catch(() => ({}))) as Record<string, any>;
  const note = sanitizeNote({ ...existing, ...body }, existing);

  const serialized = JSON.stringify(note);
  // String .length counts UTF-16 code units, not bytes. Use TextEncoder
  // so CJK text is measured accurately against the 25MB KV value cap.
  if (new TextEncoder().encode(serialized).length > MAX_NOTE_SIZE_BYTES) {
    return json(env, { error: 'Note too large (max 20MB incl. photos)' }, { status: 413 });
  }

  await env.TOKENS.put(found.key, serialized);
  return json(env, { note: { ...note, owner: found.owner } });
}

async function handleDeleteNote(req: Request, env: Env, noteId: string): Promise<Response> {
  const sid = getSessionId(req);
  if (!sid) return json(env, { ok: true });

  const found = await findNoteKey(env, sid, noteId);
  if (found) await env.TOKENS.delete(found.key);
  return json(env, { ok: true });
}

/**
 * Move every note owned by any of the user's connected emails to a
 * single target email. Lets the user choose which of their Google
 * accounts "owns" the notebook, so they can safely disconnect other
 * accounts without losing data.
 *
 * The target MUST be currently connected in the session — this
 * prevents the user from moving notes to an email they no longer
 * control.
 */
async function handleMigrateNotes(req: Request, env: Env): Promise<Response> {
  const sid = getSessionId(req);
  if (!sid) return json(env, { error: 'No session' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { to?: string };
  const target = body.to;
  if (!target) return json(env, { error: 'target email required' }, { status: 400 });

  const emails = await getSessionEmails(env, sid);
  if (!emails.includes(target)) {
    return json(env, { error: 'Target email not authenticated in this session' }, { status: 403 });
  }

  let moved = 0;
  for (const email of emails) {
    if (email === target) continue;
    const { keys } = await env.TOKENS.list({ prefix: `note:owner:${email}:` });
    for (const k of keys) {
      const value = await env.TOKENS.get(k.name);
      if (!value) continue;
      const noteId = k.name.substring(`note:owner:${email}:`.length);
      let targetKey = `note:owner:${target}:${noteId}`;
      // On collision, write with a fresh suffix instead of overwriting the
      // existing target note — data loss is worse than a duplicate.
      if (await env.TOKENS.get(targetKey)) {
        const suffix = crypto.getRandomValues(new Uint8Array(4));
        const unique = Array.from(suffix).map(b => b.toString(16).padStart(2, '0')).join('');
        targetKey = `${targetKey}-${unique}`;
      }
      await env.TOKENS.put(targetKey, value);
      await env.TOKENS.delete(k.name);
      moved += 1;
    }
  }

  // Remember the user's explicit choice so subsequent creates don't drift
  // back to the old owner due to KV list eventual consistency.
  await env.TOKENS.put(`sess:${sid}:__primaryOwner`, target);

  return json(env, { ok: true, moved, target });
}

// ─── Router ─────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    try {
      if (url.pathname === '/auth/start' && request.method === 'POST') return handleStart(request, env);
      if (url.pathname === '/auth/callback' && request.method === 'GET') return handleCallback(request, env);
      if (url.pathname === '/auth/accounts' && request.method === 'GET') return handleAccounts(request, env);
      if (url.pathname === '/auth/token' && request.method === 'POST') return handleToken(request, env);
      if (url.pathname === '/auth/revoke' && request.method === 'POST') return handleRevoke(request, env);

      // Notes
      if (url.pathname === '/notes' && request.method === 'GET') return handleListNotes(request, env);
      if (url.pathname === '/notes' && request.method === 'POST') return handleCreateNote(request, env);
      if (url.pathname === '/notes/migrate' && request.method === 'POST') return handleMigrateNotes(request, env);
      const noteMatch = url.pathname.match(/^\/notes\/([A-Za-z0-9_-]+)$/);
      if (noteMatch && request.method === 'PATCH') return handleUpdateNote(request, env, noteMatch[1]);
      if (noteMatch && request.method === 'DELETE') return handleDeleteNote(request, env, noteMatch[1]);

      if (url.pathname === '/' || url.pathname === '/health') {
        return json(env, { ok: true, service: 'google-ai-workspace-auth' });
      }
      return json(env, { error: 'Not found' }, { status: 404 });
    } catch (e: any) {
      return json(env, { error: 'Internal error', detail: String(e) }, { status: 500 });
    }
  },
};
