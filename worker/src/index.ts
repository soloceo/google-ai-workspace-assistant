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
  return `${SESSION_COOKIE}=${sid}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

// ─── Route handlers ─────────────────────────────────────────

async function handleStart(req: Request, env: Env): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const returnTo = searchParams.get('return_to') || env.FRONTEND_ORIGIN;

  let sid = getSessionId(req);
  const newSession = !sid;
  if (!sid) sid = newSessionId();

  const state = `${sid}.${encodeURIComponent(returnTo)}`;
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

  const [sid, returnToEnc] = state.split('.');
  const returnTo = returnToEnc ? decodeURIComponent(returnToEnc) : env.FRONTEND_ORIGIN;
  if (!sid) return new Response('Invalid state', { status: 400 });

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
    const { access_token, expires_in } = await refreshAccessToken(env, account.refresh_token);
    return json(env, {
      access_token,
      expires_at: Date.now() + expires_in * 1000,
    });
  } catch (e: any) {
    // Refresh token likely revoked. Remove the account so the user can reconnect.
    await deleteAccount(env, sid, email);
    return json(env, { error: 'Refresh failed — please reconnect', detail: String(e) }, { status: 401 });
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
      if (url.pathname === '/' || url.pathname === '/health') {
        return json(env, { ok: true, service: 'google-ai-workspace-auth' });
      }
      return json(env, { error: 'Not found' }, { status: 404 });
    } catch (e: any) {
      return json(env, { error: 'Internal error', detail: String(e) }, { status: 500 });
    }
  },
};
